# llama.cpp Integration Plan for Cortex

## Executive Summary

This document outlines the implementation plan to add llama.cpp support to Cortex alongside the existing vLLM infrastructure. The goal is to enable administrators to deploy and manage llama.cpp-based models (particularly GGUF format) with the same ease and feature parity as vLLM models.

**Key Requirements:**
- Support GPT-OSS 120B and other GGUF models that vLLM cannot handle
- Maintain all existing Cortex features: container management, health monitoring, metrics, API routing
- Seamless admin experience - same UI, same workflows
- OpenAI-compatible API endpoints for both vLLM and llama.cpp backends

---

## 1. Architecture Overview

### Current State
- Cortex uses `docker_manager.py` to spawn vLLM containers with `vllm/vllm-openai` image
- Models stored in `Model` table with vLLM-specific configuration fields
- Gateway routes requests to vLLM containers via model registry
- Health monitoring, metrics, and admin UI all assume vLLM endpoints

### Proposed Architecture
- **Dual-backend support**: Extend existing infrastructure to support both `vllm` and `llamacpp` engine types
- **Unified model registry**: Single registry handles routing to both engine types
- **Engine-agnostic API**: Gateway abstracts engine differences, presents consistent OpenAI API
- **Shared monitoring**: Same health checks, metrics collection, and admin interface for both engines

### Engine Selection Logic
```
Model Creation → Engine Type Field → Container Manager → Image Selection
                                                      ├─ vLLM: vllm/vllm-openai:latest
                                                      └─ llama.cpp: custom llama-server image
```

---

## 2. Database Schema Changes

### Add Engine Type Field to Model Table
```sql
-- Migration: Add engine_type field
ALTER TABLE models ADD COLUMN engine_type VARCHAR(16) DEFAULT 'vllm' NOT NULL;
-- Add index for efficient filtering
CREATE INDEX idx_models_engine_type ON models(engine_type);
```

### New llama.cpp-Specific Configuration Fields
```sql
-- llama.cpp specific parameters
ALTER TABLE models ADD COLUMN ngl INTEGER; -- GPU layers (-ngl)
ALTER TABLE models ADD COLUMN tensor_split VARCHAR(128); -- GPU memory distribution
ALTER TABLE models ADD COLUMN batch_size INTEGER DEFAULT 512; -- batch size (-b)
ALTER TABLE models ADD COLUMN threads INTEGER; -- CPU threads (-t)
ALTER TABLE models ADD COLUMN context_size INTEGER DEFAULT 8192; -- context window (-c)
ALTER TABLE models ADD COLUMN rope_freq_base FLOAT; -- RoPE frequency base
ALTER TABLE models ADD COLUMN rope_freq_scale FLOAT; -- RoPE frequency scale
ALTER TABLE models ADD COLUMN flash_attention BOOLEAN DEFAULT TRUE; -- flash attention
ALTER TABLE models ADD COLUMN mlock BOOLEAN DEFAULT FALSE; -- memory locking
ALTER TABLE models ADD COLUMN no_mmap BOOLEAN DEFAULT FALSE; -- disable memory mapping
ALTER TABLE models ADD COLUMN numa_policy VARCHAR(32); -- NUMA policy
ALTER TABLE models ADD COLUMN split_mode VARCHAR(32); -- layer/row split mode
```

### Backward Compatibility
- All new fields nullable with sensible defaults
- Existing vLLM models continue working unchanged
- `engine_type` defaults to 'vllm' for existing records

---

## 3. Backend Implementation

### 3.1 Configuration Updates (`config.py`)

```python
class Settings(BaseSettings):
    # Existing vLLM settings...
    VLLM_IMAGE: str = "vllm/vllm-openai:latest"
    
    # New llama.cpp settings
    LLAMACPP_IMAGE: str = "ghcr.io/ggerganov/llama.cpp:server-cuda"
    LLAMACPP_DEFAULT_HOST: str = "0.0.0.0"
    LLAMACPP_DEFAULT_PORT: int = 8000
    
    # Engine registry URLs (extend existing pools)
    LLAMACPP_GEN_URLS: str = ""  # Optional static llama.cpp endpoints
    
    def llamacpp_gen_urls(self) -> List[str]:
        return [u.strip() for u in self.LLAMACPP_GEN_URLS.split(",") if u.strip()]
```

### 3.2 Docker Manager Extensions (`docker_manager.py`)

Create parallel functions for llama.cpp container management:

```python
def _build_llamacpp_command(m: Model) -> list[str]:
    """Build llama-server command arguments."""
    model_path = _resolve_model_path(m)  # Handle GGUF file resolution
    
    cmd = [
        "llama-server",
        "-m", model_path,
        "--host", "0.0.0.0", 
        "--port", "8000",
    ]
    
    # Core parameters
    if getattr(m, 'context_size', None):
        cmd += ["-c", str(m.context_size)]
    if getattr(m, 'ngl', None):
        cmd += ["-ngl", str(m.ngl)]
    if getattr(m, 'tensor_split', None):
        cmd += ["--tensor-split", str(m.tensor_split)]
    if getattr(m, 'batch_size', None):
        cmd += ["-b", str(m.batch_size)]
    if getattr(m, 'threads', None):
        cmd += ["-t", str(m.threads)]
        
    # Performance flags
    if getattr(m, 'flash_attention', None):
        cmd += ["--flash-attn", "on" if m.flash_attention else "off"]
    if getattr(m, 'mlock', None) and m.mlock:
        cmd += ["--mlock"]
    if getattr(m, 'no_mmap', None) and m.no_mmap:
        cmd += ["--no-mmap"]
    if getattr(m, 'numa_policy', None):
        cmd += ["--numa", str(m.numa_policy)]
        
    return cmd

def _resolve_model_path(m: Model) -> str:
    """Resolve GGUF file path, handling both single files and merged multi-part."""
    if not m.local_path:
        raise ValueError("llama.cpp requires local_path")
        
    base_path = f"/models/{m.local_path}"
    
    # Check for single GGUF file
    if base_path.endswith('.gguf'):
        return base_path
        
    # Auto-detect merged GGUF in directory
    # Look for common patterns: model.gguf, *.Q8_0.gguf, etc.
    import os
    search_patterns = [
        "*.gguf",
        "*.Q8_0.gguf", 
        "*.Q4_K_M.gguf",
        "*-merged.gguf"
    ]
    # Return first found or raise error
    # (Implementation would scan mounted directory)
    return f"{base_path}/model.gguf"  # Placeholder

def start_llamacpp_container_for_model(m: Model) -> Tuple[str, int]:
    """Create llama.cpp container for the model."""
    settings = get_settings()
    image = settings.LLAMACPP_IMAGE
    _ensure_image(image)
    
    name = f"llamacpp-model-{m.id}"
    cli = _client()
    
    # Stop existing container (same pattern as vLLM)
    _stop_existing_container(cli, name)
    
    # Build environment and volumes
    binds = {
        settings.CORTEX_MODELS_DIR_HOST or settings.CORTEX_MODELS_DIR: 
        {"bind": "/models", "mode": "ro"}
    }
    
    environment = {
        "CUDA_VISIBLE_DEVICES": "all",
    }
    
    # GPU device requests
    device_requests = [DeviceRequest(count=-1, capabilities=[["gpu"]])]
    
    # Health check (llama.cpp server provides /health endpoint)
    healthcheck = {
        "Test": ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"],
        "Interval": 10_000_000_000,
        "Timeout": 5_000_000_000,
        "Retries": 3,
        "StartPeriod": 30_000_000_000,  # llama.cpp may take longer to load
    }
    
    cmd = _build_llamacpp_command(m)
    
    container = cli.containers.run(
        image=image,
        name=name,
        command=cmd,
        detach=True,
        environment=environment,
        volumes=binds,
        device_requests=device_requests,
        healthcheck=healthcheck,
        restart_policy={"Name": "unless-stopped"},
        ports={"8000/tcp": ("0.0.0.0", 0)},
        network="cortex_default",
        labels={"com.docker.compose.project": "cortex"},
        shm_size="8g",  # llama.cpp may need more shared memory
        ipc_mode="host",
    )
    
    container.reload()
    host_port = _extract_host_port(container)
    return name, host_port

# Extend existing functions to handle both engine types
def start_container_for_model(m: Model, hf_token: Optional[str] = None) -> Tuple[str, int]:
    """Route to appropriate engine based on model.engine_type."""
    engine_type = getattr(m, 'engine_type', 'vllm')
    
    if engine_type == 'llamacpp':
        return start_llamacpp_container_for_model(m)
    else:
        return start_vllm_container_for_model(m, hf_token)  # Rename existing function

def stop_container_for_model(m: Model) -> None:
    """Stop container regardless of engine type."""
    engine_type = getattr(m, 'engine_type', 'vllm')
    prefix = 'llamacpp' if engine_type == 'llamacpp' else 'vllm'
    name = f"{prefix}-model-{m.id}"
    
    cli = _client()
    try:
        c = cli.containers.get(name)
        c.stop(timeout=10)  # llama.cpp may need more time
        c.remove(force=True)
    except Exception:
        pass
```

### 3.3 Model Routes Extensions (`routes/models.py`)

Update Pydantic schemas to include llama.cpp fields:

```python
class ModelItem(BaseModel):
    # Existing fields...
    
    # Add engine type
    engine_type: str = "vllm"
    
    # llama.cpp specific fields
    ngl: Optional[int] = None
    tensor_split: Optional[str] = None
    batch_size: Optional[int] = None
    threads: Optional[int] = None
    context_size: Optional[int] = None
    rope_freq_base: Optional[float] = None
    rope_freq_scale: Optional[float] = None
    flash_attention: Optional[bool] = None
    mlock: Optional[bool] = None
    no_mmap: Optional[bool] = None
    numa_policy: Optional[str] = None
    split_mode: Optional[str] = None

class CreateModelRequest(BaseModel):
    # Existing fields...
    
    # Add engine selection
    engine_type: str = "vllm"
    
    # llama.cpp fields
    ngl: Optional[int] = None
    tensor_split: Optional[str] = None
    batch_size: Optional[int] = 512
    threads: Optional[int] = None
    context_size: Optional[int] = 8192
    rope_freq_base: Optional[float] = None
    rope_freq_scale: Optional[float] = None
    flash_attention: Optional[bool] = True
    mlock: Optional[bool] = False
    no_mmap: Optional[bool] = False
    numa_policy: Optional[str] = None
    split_mode: Optional[str] = None
```

Add validation for engine-specific requirements:

```python
@router.post("/models")
async def create_model(body: CreateModelRequest, _: dict = Depends(require_admin)):
    # Validate engine-specific requirements
    if body.engine_type == "llamacpp":
        if not body.local_path:
            raise HTTPException(status_code=400, detail="llamacpp requires local_path")
        if not body.local_path.lower().endswith('.gguf') and not _contains_gguf_file(body.local_path):
            raise HTTPException(status_code=400, detail="llamacpp requires GGUF file")
    
    # Existing validation for vLLM...
    
    # Create model with new fields
    m = Model(
        # Existing fields...
        engine_type=body.engine_type,
        ngl=body.ngl,
        tensor_split=body.tensor_split,
        batch_size=body.batch_size,
        threads=body.threads,
        context_size=body.context_size,
        rope_freq_base=body.rope_freq_base,
        rope_freq_scale=body.rope_freq_scale,
        flash_attention=body.flash_attention,
        mlock=body.mlock,
        no_mmap=body.no_mmap,
        numa_policy=body.numa_policy,
        split_mode=body.split_mode,
    )
```

### 3.4 Health Monitoring Extensions (`health.py`)

Extend health poller to handle llama.cpp endpoints:

```python
async def poll_upstreams_periodically(http_client: httpx.AsyncClient) -> None:
    while True:
        settings = get_settings()
        # Include llama.cpp URLs in health polling
        urls = sorted(set(
            settings.gen_urls() + 
            settings.emb_urls() + 
            settings.llamacpp_gen_urls() +  # New
            registry_urls()
        ))
        
        for base in urls:
            # Existing health check logic works for both engines
            # Both vLLM and llama.cpp expose /health endpoints
```

### 3.5 API Routing Updates (`routes/openai.py`)

The existing OpenAI proxy should work unchanged since both engines expose OpenAI-compatible APIs. However, we may need engine-specific error handling:

```python
def choose_by_model_or_task(model: str | None, task_hint: str | None, settings) -> tuple[str, str]:
    """Enhanced to check engine type from registry metadata."""
    if model and model in _MODEL_REGISTRY:
        entry = _MODEL_REGISTRY.get(model) or {}
        url = str(entry.get("url") or "")
        task = str(entry.get("task") or "generate")
        engine = str(entry.get("engine_type") or "vllm")  # New metadata
        if url:
            return url, task, engine  # Return engine type for error handling
    
    # Fallback logic remains the same
    return choose_url(settings.gen_urls()), "generate", "vllm"
```

### 3.6 Metrics and Monitoring

Extend Prometheus metrics to distinguish engine types:

```python
# Add engine_type label to existing metrics
UPSTREAM_LATENCY_BY_ENGINE = Histogram(
    "gateway_upstream_latency_by_engine_seconds",
    "Upstream latency by engine type",
    ["path", "engine_type"]
)

UPSTREAM_SELECTED_BY_ENGINE = Counter(
    "gateway_upstream_selected_by_engine_total", 
    "Upstream selections by engine type",
    ["path", "engine_type", "base_url"]
)
```

---

## 4. Frontend Implementation

### 4.1 Model Form Extensions

Update `ModelForm.tsx` to include engine selection and llama.cpp-specific fields:

```typescript
export type ModelFormValues = {
  // Existing fields...
  
  // Add engine selection
  engineType: 'vllm' | 'llamacpp';
  
  // llama.cpp specific fields
  ngl?: number;              // GPU layers
  tensorSplit?: string;      // e.g., "0.25,0.25,0.25,0.25"
  batchSize?: number;        // Batch size
  threads?: number;          // CPU threads
  contextSize?: number;      // Context window
  ropeFreqBase?: number;     // RoPE frequency base
  ropeFreqScale?: number;    // RoPE frequency scale
  flashAttention?: boolean;  // Flash attention
  mlock?: boolean;           // Memory locking
  noMmap?: boolean;          // Disable mmap
  numaPolicy?: string;       // NUMA policy
  splitMode?: string;        // Split mode
};

export function ModelForm({ ... }) {
  const [values, setValues] = React.useState<ModelFormValues>({
    // Existing defaults...
    engineType: 'vllm',
    batchSize: 512,
    contextSize: 8192,
    flashAttention: true,
    mlock: false,
    noMmap: false,
  });
  
  // Engine-specific field visibility
  const showVllmFields = values.engineType === 'vllm';
  const showLlamacppFields = values.engineType === 'llamacpp';
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Engine Type Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Engine Type</label>
        <select 
          value={values.engineType} 
          onChange={(e) => setValues({...values, engineType: e.target.value})}
          className="w-full p-2 border rounded"
        >
          <option value="vllm">vLLM (Transformers/Safetensors)</option>
          <option value="llamacpp">llama.cpp (GGUF)</option>
        </select>
      </div>
      
      {/* Conditional field sections */}
      {showVllmFields && (
        <VllmFieldsSection values={values} onChange={setValues} />
      )}
      
      {showLlamacppFields && (
        <LlamacppFieldsSection values={values} onChange={setValues} />
      )}
      
      {/* Common fields for both engines */}
      <CommonFieldsSection values={values} onChange={setValues} />
    </form>
  );
}
```

### 4.2 Engine-Specific Field Components

Create dedicated field sections for each engine:

```typescript
function LlamacppFieldsSection({ values, onChange }: FieldSectionProps) {
  return (
    <div className="space-y-4 border-l-2 border-blue-500 pl-4">
      <h3 className="font-medium text-blue-400">llama.cpp Configuration</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label>GPU Layers (ngl)</label>
          <input 
            type="number" 
            value={values.ngl || ''} 
            onChange={(e) => onChange({...values, ngl: parseInt(e.target.value) || undefined})}
            placeholder="Auto-detect"
          />
          <div className="text-xs text-gray-400">Number of layers to offload to GPU</div>
        </div>
        
        <div>
          <label>Tensor Split</label>
          <input 
            type="text" 
            value={values.tensorSplit || ''} 
            onChange={(e) => onChange({...values, tensorSplit: e.target.value || undefined})}
            placeholder="0.25,0.25,0.25,0.25"
          />
          <div className="text-xs text-gray-400">GPU memory distribution (comma-separated)</div>
        </div>
        
        <div>
          <label>Batch Size</label>
          <input 
            type="number" 
            value={values.batchSize || 512} 
            onChange={(e) => onChange({...values, batchSize: parseInt(e.target.value) || 512})}
          />
        </div>
        
        <div>
          <label>CPU Threads</label>
          <input 
            type="number" 
            value={values.threads || ''} 
            onChange={(e) => onChange({...values, threads: parseInt(e.target.value) || undefined})}
            placeholder="Auto-detect"
          />
        </div>
        
        <div>
          <label>Context Size</label>
          <input 
            type="number" 
            value={values.contextSize || 8192} 
            onChange={(e) => onChange({...values, contextSize: parseInt(e.target.value) || 8192})}
          />
        </div>
        
        <div className="flex items-center space-x-2">
          <input 
            type="checkbox" 
            checked={values.flashAttention || false}
            onChange={(e) => onChange({...values, flashAttention: e.target.checked})}
          />
          <label>Flash Attention</label>
        </div>
        
        <div className="flex items-center space-x-2">
          <input 
            type="checkbox" 
            checked={values.mlock || false}
            onChange={(e) => onChange({...values, mlock: e.target.checked})}
          />
          <label>Memory Lock (mlock)</label>
        </div>
        
        <div className="flex items-center space-x-2">
          <input 
            type="checkbox" 
            checked={values.noMmap || false}
            onChange={(e) => onChange({...values, noMmap: e.target.checked})}
          />
          <label>Disable Memory Mapping</label>
        </div>
      </div>
      
      {/* Advanced RoPE settings */}
      <details className="space-y-2">
        <summary className="cursor-pointer font-medium">Advanced RoPE Settings</summary>
        <div className="grid grid-cols-2 gap-4 pl-4">
          <div>
            <label>RoPE Frequency Base</label>
            <input 
              type="number" 
              step="0.1"
              value={values.ropeFreqBase || ''} 
              onChange={(e) => onChange({...values, ropeFreqBase: parseFloat(e.target.value) || undefined})}
              placeholder="Model default"
            />
          </div>
          <div>
            <label>RoPE Frequency Scale</label>
            <input 
              type="number" 
              step="0.01"
              value={values.ropeFreqScale || ''} 
              onChange={(e) => onChange({...values, ropeFreqScale: parseFloat(e.target.value) || undefined})}
              placeholder="Model default"
            />
          </div>
        </div>
      </details>
    </div>
  );
}
```

### 4.3 Model List UI Updates

Update the models table to show engine type and relevant metrics:

```typescript
// In ModelsPage component, add engine type column
const columns = [
  { key: 'name', label: 'Name' },
  { key: 'served_model_name', label: 'Served Name' },
  { key: 'engine_type', label: 'Engine', render: (val: string) => (
    <Badge variant={val === 'vllm' ? 'blue' : 'green'}>
      {val === 'vllm' ? 'vLLM' : 'llama.cpp'}
    </Badge>
  )},
  { key: 'task', label: 'Task' },
  { key: 'state', label: 'Status', render: renderStatus },
  { key: 'actions', label: 'Actions', render: renderActions },
];
```

### 4.4 Resource Calculator Updates

Extend the resource calculator to estimate llama.cpp requirements:

```typescript
function ResourceCalculatorModal({ ... }) {
  const [engineType, setEngineType] = useState<'vllm' | 'llamacpp'>('vllm');
  
  const calculateLlamacppRequirements = (params: number, quantization: string) => {
    const bytesPerParam = {
      'Q4_K_M': 0.5,
      'Q8_0': 1.0,
      'F16': 2.0,
    }[quantization] || 1.0;
    
    const modelSizeGB = (params * bytesPerParam) / 1e9;
    const kvCacheGB = 8; // Estimate based on context
    const systemOverheadGB = 4;
    
    return {
      modelSizeGB,
      kvCacheGB,
      totalRAM: modelSizeGB + kvCacheGB + systemOverheadGB,
      recommendedVRAM: Math.min(modelSizeGB * 0.8, 180), // 80% on GPU
      recommendedNGL: Math.floor(params / 1e9 * 0.6), // Rough layer estimate
    };
  };
  
  // Show different calculations based on engine type
}
```

---

## 5. Docker Image Strategy

### 5.1 Custom llama.cpp Image

Create a custom Docker image with llama.cpp server and CUDA support:

```dockerfile
# docker-images/llamacpp-server/Dockerfile
FROM nvidia/cuda:12.1-devel-ubuntu22.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Build llama.cpp with CUDA support
WORKDIR /build
RUN git clone https://github.com/ggerganov/llama.cpp.git . && \
    cmake -B build -DGGML_CUDA=ON -DLLAMA_BUILD_SERVER=ON && \
    cmake --build build --config Release -j$(nproc)

# Install binary
RUN cp build/bin/llama-server /usr/local/bin/

# Health check endpoint wrapper
COPY health-wrapper.sh /usr/local/bin/health-wrapper.sh
RUN chmod +x /usr/local/bin/health-wrapper.sh

# Default port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=30s \
    CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["/usr/local/bin/health-wrapper.sh"]
```

### 5.2 Health Endpoint Wrapper

llama.cpp server doesn't provide a `/health` endpoint by default, so we need a wrapper:

```bash
#!/bin/bash
# health-wrapper.sh

# Start llama-server in background
llama-server "$@" &
LLAMA_PID=$!

# Simple health endpoint using netcat/socat
(
  while true; do
    echo -e "HTTP/1.1 200 OK\r\nContent-Length: 15\r\n\r\n{\"status\":\"ok\"}" | nc -l -p 8001
  done
) &
HEALTH_PID=$!

# Proxy /health requests from port 8000 to 8001
# (Alternative: modify llama.cpp to add native /health endpoint)

# Wait for llama-server
wait $LLAMA_PID
kill $HEALTH_PID 2>/dev/null || true
```

**Alternative Approach**: Patch llama.cpp server to add native `/health` endpoint, or use a sidecar health service.

---

## 6. Configuration Management

### 6.1 Environment Variables

Add llama.cpp configuration to settings:

```python
# backend/src/config.py additions
class Settings(BaseSettings):
    # Existing vLLM settings...
    
    # llama.cpp settings
    LLAMACPP_IMAGE: str = "cortex/llamacpp-server:latest"
    LLAMACPP_GEN_URLS: str = ""
    LLAMACPP_DEFAULT_NGL: int = 999  # Offload all layers by default
    LLAMACPP_DEFAULT_BATCH_SIZE: int = 512
    LLAMACPP_DEFAULT_THREADS: int = 32
    LLAMACPP_DEFAULT_CONTEXT: int = 8192
    
    def all_gen_urls(self) -> List[str]:
        """Combined vLLM and llama.cpp generation URLs."""
        return self.gen_urls() + self.llamacpp_gen_urls()
```

### 6.2 Docker Compose Integration

Add llama.cpp service to compose files:

```yaml
# docker.compose.dev.yaml additions
services:
  # Existing services...
  
  llamacpp-gen:
    image: cortex/llamacpp-server:latest
    environment:
      - CUDA_VISIBLE_DEVICES=all
    volumes:
      - ${CORTEX_MODELS_DIR:-/var/cortex/models}:/models:ro
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    profiles: ["llamacpp"]
    networks:
      - default
    # No fixed ports - managed models will use ephemeral ports
```

---

## 7. Implementation Phases

### Phase 1: Backend Foundation (Week 1-2)
1. **Database Migration**
   - Add `engine_type` and llama.cpp-specific fields to Model table
   - Create migration script
   - Update model schemas and validation

2. **Docker Manager Extension**
   - Implement `_build_llamacpp_command()`
   - Create `start_llamacpp_container_for_model()`
   - Build and test custom llama.cpp Docker image
   - Extend existing container lifecycle functions

3. **Basic Container Management**
   - Test llama.cpp container creation/destruction
   - Verify health checks work
   - Ensure logs are accessible

### Phase 2: API Integration (Week 2-3)
1. **Model Registry Updates**
   - Extend registry to store engine type metadata
   - Update routing logic to handle both engine types
   - Test model registration/deregistration

2. **Health Monitoring**
   - Extend health poller for llama.cpp endpoints
   - Add engine-type labels to metrics
   - Test circuit breaker behavior

3. **API Compatibility Testing**
   - Verify OpenAI API compatibility for llama.cpp endpoints
   - Test streaming and non-streaming responses
   - Validate error handling and token counting

### Phase 3: Frontend Integration (Week 3-4)
1. **Model Form Updates**
   - Add engine type selection
   - Implement llama.cpp-specific field sections
   - Add field validation and help text

2. **UI Enhancements**
   - Update model list to show engine type
   - Add engine-specific status indicators
   - Update resource calculator for llama.cpp

3. **Admin Experience**
   - Test complete workflow: create → configure → start → monitor
   - Add engine-specific documentation and tooltips
   - Implement GGUF file detection and validation

### Phase 4: Advanced Features (Week 4-5)
1. **GGUF File Management**
   - Auto-detection of GGUF files in directories
   - Multi-part GGUF merging utilities
   - GGUF metadata inspection (model size, quantization, etc.)

2. **Performance Optimization**
   - Auto-configuration based on hardware detection
   - Intelligent defaults for GPU layers and tensor splitting
   - Performance profiling and recommendations

3. **Monitoring and Metrics**
   - Engine-specific dashboards in Grafana
   - Performance comparison tools
   - Resource utilization tracking

### Phase 5: Production Readiness (Week 5-6)
1. **Testing and Validation**
   - End-to-end testing with GPT-OSS 120B model
   - Load testing and performance benchmarking
   - Error handling and recovery testing

2. **Documentation**
   - Update all documentation for dual-engine support
   - Add llama.cpp-specific guides and troubleshooting
   - Create migration guide for existing deployments

3. **Deployment Integration**
   - Update compose files and deployment scripts
   - Add environment variable documentation
   - Create example configurations

---

## 8. Technical Considerations

### 8.1 API Compatibility

**Challenge**: Ensure llama.cpp server provides OpenAI-compatible responses.

**Solution**: 
- llama.cpp server already supports OpenAI-compatible endpoints
- May need response normalization middleware for edge cases
- Token counting may differ between engines - add engine-specific estimation

### 8.2 Model File Management

**Challenge**: GGUF files may be split across multiple parts.

**Solution**:
- Auto-detect and merge multi-part GGUF files during container startup
- Provide admin tools for manual GGUF management
- Cache merged files to avoid repeated merging

### 8.3 Resource Management

**Challenge**: Different memory and compute patterns between engines.

**Solution**:
- Engine-specific resource estimation algorithms
- Hardware capability detection and auto-configuration
- Resource conflict detection (prevent over-allocation)

### 8.4 Container Networking

**Challenge**: Both engines need to expose port 8000 in containers.

**Solution**:
- Existing ephemeral port allocation works for both
- Use container names for service-to-service communication
- Same network topology as current vLLM containers

### 8.5 Health and Monitoring

**Challenge**: Different health check patterns and metrics.

**Solution**:
- Standardize on `/health` endpoint for both engines
- Add engine type to all metrics for proper attribution
- Maintain existing monitoring infrastructure

---

## 9. Migration Strategy

### 9.1 Backward Compatibility
- All existing vLLM models continue working unchanged
- New `engine_type` field defaults to 'vllm'
- Frontend gracefully handles missing llama.cpp fields

### 9.2 Gradual Rollout
1. Deploy backend changes with feature flag
2. Add frontend UI behind admin flag
3. Test with non-production models
4. Enable for production workloads

### 9.3 Rollback Plan
- Database migration is additive (no data loss)
- Feature flags allow disabling llama.cpp support
- Existing vLLM functionality unaffected

---

## 10. Success Metrics

### 10.1 Functional Requirements
- [ ] Admin can create llama.cpp models via UI
- [ ] llama.cpp containers start/stop reliably
- [ ] Health monitoring works for both engines
- [ ] OpenAI API compatibility maintained
- [ ] GPT-OSS 120B model serves successfully

### 10.2 Performance Requirements
- [ ] llama.cpp model startup time < 60 seconds
- [ ] API latency parity with vLLM (within 10%)
- [ ] Resource utilization monitoring accuracy
- [ ] No performance regression for existing vLLM models

### 10.3 Operational Requirements
- [ ] Same admin experience for both engines
- [ ] Consistent logging and debugging
- [ ] Prometheus metrics coverage
- [ ] Documentation completeness

---

## 11. Risk Assessment

### 11.1 High Risk
- **Docker image complexity**: Building reliable CUDA-enabled llama.cpp image
- **API compatibility gaps**: Differences in OpenAI API implementation
- **Resource conflicts**: GPU memory contention between engines

### 11.2 Medium Risk
- **Performance characteristics**: Different optimization patterns
- **GGUF file management**: Complex file handling and merging
- **Health check reliability**: Different startup and failure patterns

### 11.3 Low Risk
- **Database schema changes**: Additive, backward compatible
- **Frontend complexity**: Incremental UI updates
- **Existing functionality**: No changes to current vLLM path

---

## 12. Implementation Checklist

### Backend
- [ ] Database migration for engine_type and llama.cpp fields
- [ ] Docker manager extensions for llama.cpp containers
- [ ] Custom llama.cpp Docker image with health endpoint
- [ ] Model validation for GGUF requirements
- [ ] Container lifecycle management (start/stop/logs)
- [ ] Health monitoring integration
- [ ] Metrics and observability extensions
- [ ] API routing updates for engine awareness

### Frontend  
- [ ] Engine type selection in model form
- [ ] llama.cpp-specific configuration fields
- [ ] Engine type display in model list
- [ ] Resource calculator updates for llama.cpp
- [ ] GGUF file detection and validation
- [ ] Engine-specific help text and documentation
- [ ] Testing with actual llama.cpp models

### Infrastructure
- [ ] Build and publish custom llama.cpp image
- [ ] Update compose files for optional llama.cpp services
- [ ] Environment variable documentation
- [ ] Grafana dashboard updates for dual engines
- [ ] Integration testing with GPT-OSS 120B

### Documentation
- [ ] Update all API documentation for new fields
- [ ] Add llama.cpp-specific guides
- [ ] Migration documentation for existing users
- [ ] Troubleshooting guides for both engines
- [ ] Performance comparison documentation

---

## Conclusion

This implementation plan provides a comprehensive roadmap for adding llama.cpp support to Cortex while maintaining full feature parity with the existing vLLM infrastructure. The approach prioritizes backward compatibility, operational simplicity, and a unified admin experience.

The key insight is that both engines expose OpenAI-compatible APIs, so the integration primarily involves:
1. Extending the model configuration schema
2. Adding engine-specific container management
3. Updating the UI to handle dual engines
4. Maintaining unified monitoring and administration

With this plan, administrators will be able to deploy GPT-OSS 120B via llama.cpp using the same familiar Cortex interface they use for vLLM models, achieving the organization's goal of supporting this specific model while preserving the investment in the Cortex platform.
