# llama.cpp Engine Guide

## Overview

llama.cpp is Cortex's secondary inference engine, specifically added to support models that vLLM cannot handle. It provides CPU+GPU hybrid inference with GGUF quantized models.

**When to use llama.cpp:**
- ✅ **GPT-OSS 20B/120B models** (Harmony architecture) ← **Primary reason added to Cortex**
- ✅ GGUF quantized models (Q4_K_M, Q8_0, etc.)
- ✅ Custom/experimental architectures unsupported by vLLM
- ✅ CPU+GPU hybrid inference (offload layers to GPU)
- ✅ Tight VRAM constraints requiring aggressive quantization

**When to use vLLM instead:**
- ✅ Model has HuggingFace Transformers checkpoint
- ✅ Standard architecture (Llama, Mistral, Qwen, etc.)
- ✅ Need maximum throughput
- ✅ Pure GPU inference with sufficient VRAM

---

## Why llama.cpp Was Added to Cortex

### The GPT-OSS Problem

**OpenAI released GPT-OSS models** (20B and 120B) built on the **Harmony architecture**:

```
Model: huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated
Architecture: Harmony (custom, not in HF Transformers)
Available formats:
  - Safetensors (BF16) - 240GB weights
  - GGUF (Q8_0) - ~120GB quantized
  - GGUF (Q4_K_M) - ~60GB quantized
```

**vLLM Problem:**
```python
vllm serve huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated

Error: "Architecture 'harmony' is not supported"
# vLLM doesn't have Harmony in its model registry
# Would need upstream PR to add support
```

**llama.cpp Solution:**
```bash
llama-server -m gpt-oss-120b.Q8_0.gguf -ngl 999

# Works! llama.cpp loads any GGUF regardless of architecture
# 120B model serves successfully with quantization
```

**Result**: Cortex gained llama.cpp engine specifically to serve GPT-OSS models while maintaining the unified admin UX.

---

## Core Technologies

### 1. GGUF Format

**GGUF** (GPT-Generated Unified Format) - llama.cpp's native format:

**Advantages:**
- Single-file distribution (easy to share)
- Embedded metadata (architecture, quantization, rope config)
- Optimized for CPU inference
- Supports any model architecture
- Multiple quantization levels in one file

**Structure:**
```
gpt-oss-120b.Q8_0.gguf  (119GB)
├─ Header (GGUF version, tensor count)
├─ Metadata (architecture, parameters, rope, etc.)
├─ Tensor info (names, shapes, types)
└─ Tensor data (quantized weights)
```

**Cortex Support:**
- GGUF models placed in: `/var/cortex/models/`
- Single-file or merged multi-part GGUF
- llama-server loads directly

### 2. Quantization Levels

llama.cpp supports aggressive quantization for VRAM savings:

| Quantization | Bits per Weight | Size (120B) | Quality | Use Case |
|--------------|----------------|-------------|---------|----------|
| **F16** | 16 | ~240GB | Perfect | Baseline (too large) |
| **Q8_0** | 8 | ~120GB | Excellent | **Recommended for Cortex** |
| **Q6_K** | 6 | ~90GB | Very Good | Good balance |
| **Q5_K_M** | 5-6 mixed | ~75GB | Good | Tighter VRAM |
| **Q4_K_M** | 4-5 mixed | ~60GB | Acceptable | Maximum compression |
| **Q3_K_M** | 3-4 mixed | ~45GB | Degraded | Experimental |
| **Q2_K** | 2-3 mixed | ~30GB | Poor | Avoid |

**Cortex Recommendation for GPT-OSS 120B:**
- Use **Q8_0** (best quality/size tradeoff)
- Fits across 4x L40S GPUs (46GB each = 184GB total)
- Near-lossless quantization
- Production-ready quality

### 3. CPU+GPU Hybrid Inference

llama.cpp's killer feature: **intelligent layer offloading**

**Example: 120B model on 4x L40S GPUs:**

```bash
# Q8_0 quantized = ~120GB weights
# 4x GPUs = ~184GB VRAM available

llama-server \
  -m gpt-oss-120b.Q8_0.gguf \
  -ngl 999 \                     # Offload all possible layers to GPU
  --tensor-split 0.25,0.25,0.25,0.25  # Split evenly across 4 GPUs
  -c 8192 \                      # Context window
  -b 512                         # Batch size

# Result:
# - Most layers on GPUs (fast)
# - Spillover to CPU RAM if needed (transparent)
# - Slower than pure GPU, but works!
```

**Layer Offload (`-ngl`):**
```
ngl=0:     All layers on CPU (slow, ~2-5 tok/s)
ngl=40:    40 layers on GPU, rest on CPU (mixed, ~10-20 tok/s)
ngl=999:   All layers on GPU (fast, ~30-50 tok/s)
```

**Cortex Default**: `ngl=999` (offload everything possible)

### 4. Tensor Split (Multi-GPU VRAM Distribution)

Distributes model across GPUs:

```bash
# 4x GPUs, equal split:
--tensor-split 0.25,0.25,0.25,0.25

# 4x GPUs, unequal (if GPU 0 has less VRAM):
--tensor-split 0.15,0.28,0.28,0.29

# 2x GPUs:
--tensor-split 0.5,0.5
```

**Cortex Configuration:**
- Set in Model Form → llama.cpp section
- Default: Equal split across available GPUs
- Adjustable for heterogeneous GPU setups

---

## Cortex llama.cpp Implementation

### Container Architecture

```
Host Machine
├─ Docker Network: cortex_default
└─ llama.cpp Container: llamacpp-model-{id}
   ├─ Image: cortex/llamacpp-server:latest (custom-built)
   ├─ Port: 8000 (internal) → Ephemeral host port
   ├─ Network: Service-to-service via container name
   ├─ Volumes:
   │  └─ /models (RO) → Host models directory
   ├─ Environment:
   │  ├─ CUDA_VISIBLE_DEVICES=all
   │  └─ NVIDIA_DRIVER_CAPABILITIES=compute,utility
   └─ Resources:
      ├─ GPU: All available (via DeviceRequest)
      ├─ SHM: 8GB (larger than vLLM for CPU offload)
      └─ IPC: host mode
```

### Startup Command Example

For GPT-OSS 120B Q8_0:

```bash
# Container command (built by _build_llamacpp_command()):
llama-server
-m /models/huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated/Q8_0-GGUF/gpt-oss-120b.Q8_0.gguf
--host 0.0.0.0
--port 8000
-c 8192                           # Context size
-ngl 999                          # GPU layers (all)
-b 512                            # Batch size
-t 32                             # CPU threads
--tensor-split 0.25,0.25,0.25,0.25  # 4-GPU split
--flash-attn on                   # Flash attention
--mlock                           # Lock model in RAM
--no-mmap                         # Disable memory mapping
--numa isolate                    # NUMA policy
```

### GGUF File Resolution

Cortex intelligently resolves GGUF files:

```python
# If local_path is a .gguf file:
local_path: "model.Q8_0.gguf"
→ Uses: /models/model.Q8_0.gguf

# If local_path is a directory:
local_path: "model-folder"
→ Scans for .gguf files in folder
→ Uses first found or specified file

# Special case for GPT-OSS:
local_path: "huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated"
→ Uses: /models/.../Q8_0-GGUF/gpt-oss-120b.Q8_0.gguf
```

---

## Configuration Parameters

### Core Parameters

**Context Size** (`-c`):
```bash
-c 8192    # Default: 8192 tokens

# Larger context = more VRAM/RAM
# Recommendations:
# - 4096: Conservative, fast
# - 8192: Balanced (Cortex default)
# - 16384: Large contexts, needs VRAM
# - 32768+: Requires significant resources
```

**GPU Layers** (`-ngl`):
```bash
-ngl 999   # Default: Offload all layers

# Manual tuning:
# -ngl 0:   Pure CPU (very slow)
# -ngl 40:  40 layers on GPU, rest CPU
# -ngl 999: Automatic (all that fit)

# Cortex default: 999 (let llama.cpp decide)
```

**Batch Size** (`-b`):
```bash
-b 512     # Default: 512

# Affects prompt processing speed:
# Higher: Faster prefill, more VRAM
# Lower: Slower prefill, less VRAM
# Range: 128-2048
```

**CPU Threads** (`-t`):
```bash
-t 32      # Default: 32 threads

# Set to: (CPU cores - 2) typically
# For 64-core system: -t 60
# For 16-core: -t 14
```

### Performance Flags

**Flash Attention** (`--flash-attn`):
```bash
--flash-attn on    # Default: on

# Faster attention computation
# Minimal quality impact
# Keep enabled unless debugging
```

**Memory Lock** (`--mlock`):
```bash
--mlock    # Default: enabled in Cortex

# Locks model in RAM (prevents swapping to disk)
# Ensures consistent performance
# Requires sufficient RAM
```

**Memory Mapping** (`--no-mmap`):
```bash
--no-mmap  # Default: enabled in Cortex

# Loads model into RAM instead of memory-mapping file
# Faster inference (no page faults)
# Requires 2x model size in RAM temporarily
```

**NUMA Policy** (`--numa`):
```bash
--numa isolate    # Default: isolate

# Options:
# - isolate: Bind to single NUMA node (best latency)
# - distribute: Spread across nodes (better throughput)
# - none: No NUMA pinning
```

### RoPE Scaling

For extending context beyond training length:

```bash
--rope-freq-base 10000     # Default from model
--rope-freq-scale 1.0      # Default (no scaling)

# Example: Extend 4K model to 8K context:
--rope-freq-scale 0.5      # Compresses RoPE

# Cortex: Set in Model Form → Advanced llama.cpp section
```

---

## OpenAI API Compatibility

llama-server provides OpenAI-compatible endpoints:

### Endpoints Available:

```
POST /v1/chat/completions    ✓ Chat interface
POST /v1/completions         ✓ Text completion
POST /v1/embeddings          ✓ Embeddings (if model supports)
GET  /v1/models              ✓ List served models
GET  /health                 ✓ Health check (for Cortex polling)
GET  /metrics                ✓ Prometheus metrics
```

### Differences from OpenAI API:

**1. No API key enforcement by default**:
```python
# Cortex wraps llama-server with gateway auth
# Internal communication: No auth needed
# External access: Gateway enforces API keys
```

**2. Extended parameters**:
```json
{
  "model": "gpt-oss-120b",
  "messages": [...],
  // Standard OpenAI params work
  "temperature": 0.7,
  "max_tokens": 256,
  // llama.cpp extras:
  "repeat_penalty": 1.1,
  "top_k": 40,
  "mirostat": 2
}
```

**3. Streaming format**:
```
Compatible with OpenAI's Server-Sent Events (SSE)
Works with OpenAI SDKs without modification
```

---

## Multi-GPU Deployment

### Tensor Split Strategy

llama.cpp uses **layer-based sharding** across GPUs:

**How it works:**
```
120-layer model, 4 GPUs, equal split:

GPU 0: Layers 0-29   (30 layers, ~30GB)
GPU 1: Layers 30-59  (30 layers, ~30GB)
GPU 2: Layers 60-89  (30 layers, ~30GB)
GPU 3: Layers 90-119 (30 layers, ~30GB)

Total: 120GB weights fit across 184GB VRAM ✓
```

**Unequal splits** (if GPUs have different VRAM):
```bash
# GPU 0 has 24GB, rest have 48GB each:
--tensor-split 0.15,0.28,0.28,0.29

# Calculation:
# Total ratio: 0.15 + 0.28 + 0.28 + 0.29 = 1.0
# GPU 0 gets 15% of model
# GPU 1-3 get 28-29% each
```

### Performance Characteristics

**120B Q8_0 on 4x L40S GPUs:**

```
Configuration:
-ngl 999
--tensor-split 0.25,0.25,0.25,0.25
-c 8192
-b 512
-t 32

Expected Performance:
- Throughput: ~8-15 tokens/sec (single request)
- TTFT: 2-4 seconds (depending on prompt length)
- Context: Up to 8192 tokens
- Concurrency: 1-2 simultaneous requests

Comparison to vLLM (if it worked):
- vLLM would be 2-3x faster
- But vLLM doesn't support Harmony architecture!
- llama.cpp is the only option for GPT-OSS
```

---

## GGUF Quantization Explained

### Quantization Methods

llama.cpp supports many quantization schemes:

**K-quants** (Recommended):
```
Q8_0:    8-bit, per-block scale
         - Nearly lossless
         - 2x compression vs FP16
         - Cortex recommendation for production

Q6_K:    6-bit mixed precision
         - Good quality
         - 2.7x compression

Q5_K_M:  5-6 bit mixed
         - Balanced
         - 3.2x compression

Q4_K_M:  4-5 bit mixed
         - High compression
         - 4x reduction
         - Acceptable quality

Q3_K_M:  3-4 bit mixed
         - Extreme compression
         - 5.3x reduction
         - Noticeable degradation

Q2_K:    2-3 bit
         - Maximum compression
         - Avoid for production
```

**Legacy quants** (Avoid):
```
Q4_0, Q4_1, Q5_0, Q5_1, Q6_0
# Superseded by K-quants
# Use Q*_K_M variants instead
```

### Preparing GGUF for Cortex

**Option 1: Use pre-quantized from HuggingFace:**

```bash
# Many models have GGUF variants:
# https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF

# Download to /var/cortex/models/qwen-2.5-7b/
# Select .gguf file in Cortex Model Form
```

**Option 2: Quantize yourself:**

```bash
# 1. Convert HF model to GGUF F16:
python convert_hf_to_gguf.py /path/to/hf/model

# 2. Quantize to Q8_0:
llama-quantize model-f16.gguf model-Q8_0.gguf Q8_0

# 3. Place in Cortex models directory:
mv model-Q8_0.gguf /var/cortex/models/
```

**Option 3: Merge multi-part GGUF** (for GPT-OSS):

```bash
# GPT-OSS 120B ships as 9-part GGUF
# Merge into single file:

llama-gguf-split --merge \
  Q8_0-GGUF-00001-of-00009.gguf \
  gpt-oss-120b.Q8_0.gguf

# Result: Single 119GB file ready for llama-server
```

---

## Cortex Configuration

### Model Form - llama.cpp Section

**Engine Selection:**
```
Engine Type: llama.cpp (GGUF)
```

**Required Fields:**
```
Mode: Offline (llama.cpp requires local files)
Local Path: huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated/gpt-oss-120b.Q8_0.gguf
Name: GPT-OSS 120B Abliterated
Served Name: gpt-oss-120b-abliterated
```

**llama.cpp Specific Settings:**

```
GPU Layers (ngl): 999                          # Offload all
Tensor Split: 0.25,0.25,0.25,0.25             # 4-GPU equal
Batch Size: 512                                # Prefill batch
CPU Threads: 32                                # Background processing
Context Size: 8192                             # Max context
Flash Attention: ✓ On                          # Performance
Memory Lock (mlock): ✓ On                      # Prevent swapping
Disable Memory Mapping: ✓ On                   # Load to RAM
NUMA Policy: isolate                           # Latency optimization
```

**Optional RoPE (for context extension):**
```
RoPE Frequency Base: (leave default)
RoPE Frequency Scale: (leave default unless extending context)
```

---

## Performance Tuning

### Memory Optimization

**For tight VRAM** (e.g., <100GB total):

1. **Use more aggressive quantization:**
   ```
   Q8_0 → Q6_K → Q5_K_M → Q4_K_M
   ```

2. **Reduce context:**
   ```
   -c 8192 → -c 4096
   ```

3. **Lower batch size:**
   ```
   -b 512 → -b 256
   ```

4. **Reduce GPU layers:**
   ```
   -ngl 999 → -ngl 80  # Offload fewer layers
   ```

### Throughput Optimization

**For maximum tokens/sec:**

1. **Increase batch size:**
   ```
   -b 512 → -b 1024 or -b 2048
   # Higher batch = faster prefill
   # Needs more VRAM
   ```

2. **Optimize CPU threads:**
   ```
   -t 32 → -t (num_cores - 2)
   # Match hardware topology
   ```

3. **Enable flash attention:**
   ```
   --flash-attn on  # Keep enabled
   ```

4. **Use mlock:**
   ```
   --mlock  # Prevent swapping
   # Ensures consistent performance
   ```

### Quality vs Speed

**Quality Priority** (Accuracy over speed):
```
Quantization: Q8_0
Context: 8192+
Batch: 256-512
Result: Slower but higher quality
```

**Speed Priority** (Throughput over quality):
```
Quantization: Q5_K_M or Q4_K_M
Context: 4096
Batch: 1024-2048
GPU Layers: -ngl 999
Result: Faster, some quality loss
```

---

## OpenAI API Integration

### Chat Completions

llama-server exposes standard endpoint:

```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-oss-120b",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "temperature": 0.7,
    "max_tokens": 128
  }'
```

**Cortex wraps this:**
```
User → Cortex Gateway (port 8084)
     → llama.cpp container (port 8000)
     → Response → User

# Gateway provides:
# - API key authentication
# - Usage tracking
# - Metrics collection
# - Circuit breaking
```

### Streaming

```bash
curl -N http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-oss-120b",
    "messages": [...],
    "stream": true
  }'

# Server-Sent Events (SSE) format
# Compatible with OpenAI SDKs
```

---

## Health Checks

### Endpoints for Monitoring

**Health** (used by Cortex):
```bash
GET /v1/models

# llama.cpp doesn't have /health endpoint
# Cortex uses /v1/models as health check
# Returns: {"data": [{"id": "gpt-oss-120b"}]}
```

**Metrics** (Prometheus):
```bash
GET /metrics

# Available if --endpoint-metrics enabled
# Provides: Request counts, latencies, etc.
# Cortex can scrape these (future enhancement)
```

---

## Troubleshooting

### Common Issues

**1. Model Won't Load**

```
Error: "unable to load model"

Checks:
1. Verify GGUF file path is correct
2. Check file permissions (readable)
3. Ensure enough RAM for model
4. Check GGUF is valid (not corrupted)

Fix:
# Test GGUF integrity:
llama-cli -m model.gguf -p "test" -n 1
```

**2. OOM on GPU**

```
Error: "CUDA error: out of memory"

Solutions:
1. Reduce -ngl (offload fewer layers):
   -ngl 999 → -ngl 60
   
2. Use more aggressive quantization:
   Q8_0 → Q6_K or Q5_K_M
   
3. Reduce context:
   -c 8192 → -c 4096
   
4. Adjust tensor split for unequal GPUs
```

**3. Slow Performance**

```
Issue: <5 tokens/sec on GPUs

Checks:
1. Verify layers on GPU: -ngl should be high
2. Check GPU utilization: nvidia-smi
3. Ensure --flash-attn is on
4. Check --mlock is set
5. Verify batch size adequate (-b 512+)

If layers on CPU:
- Increase -ngl
- Check VRAM usage with nvidia-smi
- May need more aggressive quantization
```

**4. Container Restart Loop**

```
Container keeps restarting:

Check logs:
docker logs llamacpp-model-1

Common causes:
- GGUF file not found at specified path
- Invalid GGUF format
- Out of memory (CPU or GPU)
- Unsupported quantization for architecture

Fix: 
- Review Cortex model logs in UI
- Verify file path in Model Form
```

---

## Differences from vLLM

### When llama.cpp is Better:

| Feature | vLLM | llama.cpp | Winner |
|---------|------|-----------|--------|
| **Architecture support** | HF only | Any GGUF | llama.cpp ✓ |
| **Quantization** | FP16/8/INT8/AWQ/GPTQ | Q2-Q8 K-quants | llama.cpp ✓ |
| **CPU inference** | Very slow | Optimized | llama.cpp ✓ |
| **CPU+GPU hybrid** | No | Yes | llama.cpp ✓ |
| **Single-file deploy** | No | GGUF! | llama.cpp ✓ |

### When vLLM is Better:

| Feature | vLLM | llama.cpp | Winner |
|---------|------|-----------|--------|
| **Throughput** | Excellent (PagedAttention) | Good | vLLM ✓ |
| **Memory efficiency** | Best (PagedAttention) | Good | vLLM ✓ |
| **Continuous batching** | Yes | Limited | vLLM ✓ |
| **Concurrency** | Excellent (100+ requests) | Limited (1-4) | vLLM ✓ |
| **HF ecosystem** | Native | Via conversion | vLLM ✓ |

### Cortex Strategy:

```
Standard Models (Llama, Mistral, Qwen):
→ Use vLLM (better performance)

GPT-OSS 120B / Harmony Architecture:
→ Use llama.cpp (only option)

GGUF-only models:
→ Use llama.cpp (native format)

Mixed deployments:
→ Both engines side-by-side
→ Gateway routes by model registry
```

---

## Production Deployment

### Container Lifecycle

**Start** (via Cortex UI):
```
1. Admin clicks "Start"
2. Cortex builds llama-server command
3. Docker creates container: llamacpp-model-{id}
4. Container pulls cortex/llamacpp-server:latest
5. llama-server loads GGUF model
6. Health check polls /v1/models
7. State: stopped → starting → running
8. Model registered in gateway
```

**Stop** (via Cortex UI):
```
1. Admin clicks "Stop"
2. Container stops (graceful shutdown, 10s timeout)
3. Container removed
4. State: running → stopped
5. Model unregistered from gateway
```

**No auto-restart** (after Cortex restart):
```
# Restart policy: "no"
# Models stay stopped until admin clicks Start
# Prevents broken auto-start issues
```

### Health Monitoring

Cortex polls llama.cpp health every 15 seconds:

```bash
GET http://llamacpp-model-1:8000/v1/models

Success: {"data": [{"id": "gpt-oss-120b"}]}
→ Health: UP, register in model registry

Failure: Connection refused / timeout
→ Health: DOWN, circuit breaker may open
```

### Logs and Debugging

**View logs via Cortex UI:**
```
Models page → Select model → Logs button
Shows: llama-server output, loading progress, errors
```

**Common log patterns:**
```
[Loading model] - Model weights loading
[KV cache] - VRAM/RAM allocation
[CUDA] - GPU initialization  
[Server] - HTTP server ready
[Inference] - Per-request processing
```

---

## Resource Requirements

### For GPT-OSS 120B Q8_0:

**Minimum** (Cortex tested configuration):
```
GPUs: 4x NVIDIA L40S (46GB VRAM each)
Total VRAM: 184GB
RAM: 64GB+
Disk: 150GB (model + overhead)
CPU: 32+ cores recommended
```

**Why 4x L40S works:**
```
Model weights (Q8_0): ~120GB
KV cache (8K context): ~8GB
Overhead: ~3GB per GPU
Total: ~131GB across 4 GPUs
Available: 184GB
Headroom: 53GB ✓
```

**Alternative configurations:**
```
2x H100 (80GB each): 160GB → Tight but possible
3x A100 (80GB each): 240GB → Comfortable
8x 3090 (24GB each): 192GB → Works with tuning
```

### For Smaller Models:

**Llama 2 13B Q4_K_M** (fits single GPU):
```
Model: ~7GB
KV cache: ~2GB (4K context)
Total: ~9GB
Fits: Any GPU with 12GB+ (RTX 3060, 4060 Ti, etc.)
```

---

## Best Practices for llama.cpp in Cortex

### 1. Quantization Selection

```
Production (Quality Priority):
→ Use Q8_0 (near-lossless)

Balanced (Quality + Size):
→ Use Q6_K or Q5_K_M

Maximum Compression:
→ Use Q4_K_M (acceptable trade-off)
→ Avoid Q3_K or Q2_K (too much degradation)
```

### 2. Context Window

```
Conservative (Fast, Reliable):
-c 4096

Balanced (Cortex Default):
-c 8192

Large Context (Needs Resources):
-c 16384 or higher
```

### 3. GPU Layer Offloading

```
Default (Let llama.cpp decide):
-ngl 999

Manual Tuning (if needed):
# Check VRAM usage: nvidia-smi
# If OOM, reduce layers:
-ngl 80  # Adjust based on available VRAM
```

### 4. Multi-GPU Split

```
Equal GPUs:
--tensor-split 0.25,0.25,0.25,0.25

Unequal GPUs (e.g., 3x 48GB + 1x 24GB):
--tensor-split 0.34,0.34,0.34,0.17
# Give less to smaller GPU
```

---

## Comparison: llama.cpp vs vLLM in Cortex

### Use llama.cpp When:

1. **Model architecture unsupported by vLLM**
   - GPT-OSS 120B (Harmony) ✓
   - Experimental/custom architectures
   - Models requiring trust_remote_code that vLLM rejects

2. **GGUF is only available format**
   - Community quantizations
   - Pre-converted models
   - Air-gapped environments with GGUFs

3. **CPU+GPU hybrid needed**
   - Limited VRAM (can offload layers to RAM)
   - Heterogeneous GPU setups

4. **Simpler deployment**
   - Single GGUF file
   - No tokenizer issues
   - Works "out of box"

### Use vLLM When:

1. **Architecture is supported**
   - Llama, Mistral, Qwen, Phi, etc.
   - Standard HF Transformers models

2. **Need maximum performance**
   - PagedAttention efficiency
   - Continuous batching
   - High concurrency (50+ simultaneous)

3. **Pure GPU inference**
   - Sufficient VRAM available
   - Want best throughput

4. **Online model serving**
   - Download from HF on startup
   - Automatic model updates

---

## Integration with Cortex Gateway

### Model Registry

When llama.cpp container starts:

```python
# Cortex registers endpoint:
register_model_endpoint(
    served_name="gpt-oss-120b-abliterated",
    url="http://llamacpp-model-1:8000",
    task="generate"
)

# Gateway routes requests:
POST /v1/chat/completions {"model": "gpt-oss-120b-abliterated"}
→ Proxied to: http://llamacpp-model-1:8000/v1/chat/completions
```

### Monitoring

Health poller checks every 15 seconds:
```
GET http://llamacpp-model-1:8000/v1/models
Response: {"data": [{"id": "gpt-oss-120b-abliterated"}]}
Status: UP
```

Circuit breaker opens after 5 consecutive failures (30s cooldown).

### Usage Tracking

Cortex tracks per-request:
```
- Prompt tokens (estimated if llama-server doesn't report)
- Completion tokens
- Latency
- Status code
- Model name: gpt-oss-120b-abliterated
- Task: generate
```

---

## Migration Guide

### From Standalone llama.cpp to Cortex

**Before** (manual llama-server):
```bash
llama-server \
  -m /models/model.gguf \
  -ngl 999 \
  --tensor-split 0.25,0.25,0.25,0.25 \
  -c 8192 \
  --host 0.0.0.0 --port 8080
```

**After** (Cortex managed):
```
1. Add model via Cortex UI
2. Configure parameters in Model Form
3. Click "Start"
4. Cortex creates container automatically
5. Monitor via System Monitor
6. Track usage via Usage page
```

**Benefits:**
- Health monitoring
- Usage metering
- API key auth
- Multi-user access
- Web UI management

---

## Future Enhancements

### Planned for Cortex:

1. **LoRA Adapter Support**
   - llama.cpp supports dynamic LoRA loading
   - Cortex could expose adapter management

2. **RoPE Extension UI**
   - Slider for context extension
   - Auto-calculate rope_freq_scale

3. **Quantization Conversion**
   - In-UI quantization from F16 to Q8_0
   - Progress tracking

4. **Multi-Model Serving**
   - Load multiple GGUFs in single container
   - Dynamic model switching

5. **Grammar/Constrained Generation**
   - llama.cpp supports GBNF grammars
   - Enforce JSON, code, structured output

---

## References

- **Official Repo**: https://github.com/ggml-org/llama.cpp
- **Documentation**: https://github.com/ggml-org/llama.cpp/tree/master/docs
- **Docker Images**: ghcr.io/ggml-org/llama.cpp:server-cuda
- **Cortex Implementation**: `backend/src/docker_manager.py` (lines 182-325)
- **GGUF Spec**: https://github.com/ggerganov/ggml/blob/master/docs/gguf.md
- **GPT-OSS Models**: https://huggingface.co/collections/openai/gpt-oss-67723e53c50e1ec6424f71c4

---

## Conclusion

**llama.cpp in Cortex serves a critical role:**

✅ **Enables GPT-OSS 120B** - The primary reason it was added  
✅ **Fills vLLM gaps** - Custom architectures, GGUF-only models  
✅ **Production-ready** - Stable, reliable, well-tested  
✅ **Unified UX** - Same admin interface as vLLM  
✅ **Complementary** - Works alongside vLLM, not replacing it  

**Together, vLLM + llama.cpp provide comprehensive model serving for Cortex users.** 🚀

---

**For vLLM (standard models), see**: `vllm.md` (in this directory)  
**For choosing between engines**: See `engine-comparison.md` (in this directory) - comprehensive decision matrix and comparison  
**For research background**: See `engine-research.md` (in this directory)

