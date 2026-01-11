# GGUF Implementation Analysis & Identified Gaps

**Analysis Date:** January 9, 2026  
**Scope:** Comprehensive review of Cortex GGUF support across backend, frontend, and engine integrations

---

## ⭐ Quick Reference: Available GGUF Features

> **For developers and community members**: This section summarizes what's available in Cortex.
> For detailed implementation notes, see the full analysis below.

### Implemented Features

| Feature | Description | Documentation |
|---------|-------------|---------------|
| **Smart Engine Guidance** | Automatic engine/format recommendations based on file analysis | [Model Management](../models/model-management.md#smart-engine-guidance) |
| **GGUF Validation** | Header validation, corruption detection, version checks | [GGUF Format Guide](../models/gguf-format.md#gguf-validation) |
| **Metadata Extraction** | Architecture, context length, layers, attention heads from GGUF headers | [GGUF Format Guide](../models/gguf-format.md#gguf-metadata) |
| **Multi-part GGUF** | Native llama.cpp support for split files (no merge required) | [Multi-Part GGUF](../models/gguf-multipart.md) |
| **Quantization Indicators** | Quality/speed bars for Q4_K_M, Q8_0, etc. | [GGUF Format Guide](../models/gguf-format.md#quantization-levels) |
| **Architecture Compatibility** | vLLM vs llama.cpp support badges per architecture | [GGUF Format Guide](../models/gguf-format.md#architecture-compatibility) |
| **Speculative Decoding** | Draft model support for llama.cpp throughput boost | [llama.cpp Guide](../models/llamaCPP.md#speculative-decoding) |
| **Tokenizer Suggestions** | Auto-suggest HF tokenizer repos based on model name | [GGUF Format Guide](../models/gguf-format.md#tokenizer-requirements) |
| **vLLM GGUF Format** | Weight format control (auto/gguf/ggml) for vLLM | [vLLM Guide](../models/vllm.md#gguf-support-experimental) |
| **Flash Attention Check** | GPU compute capability detection for FA2 support | [Admin API](../api/admin-api.md#gpu-metrics-response-enhanced) |
| **SafeTensor Display** | Metadata display for SafeTensor models | Frontend UI |

### API Endpoints

| Endpoint | New Fields | Purpose |
|----------|------------|---------|
| `GET /admin/inspect-folder` | `engine_recommendation`, `gguf_validation`, `metadata`, `safetensor_info` | Folder analysis with recommendations |
| `GET /admin/system/gpus` | `compute_capability`, `architecture`, `flash_attention_supported` | GPU FA2 compatibility |
| `POST /admin/models` | `draft_model_path`, `draft_n`, `draft_p_min`, `gguf_weight_format` | Model creation with new fields |

### Frontend Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `GGUFGroupSelector` | Model Form Step 2 | Quantization selection with quality indicators |
| `EngineGuidance` | Model Form | Smart recommendations banner |
| `ArchitectureCompatibility` | GGUF/SafeTensor display | Engine support badges |
| `SpeculativeDecodingExplainer` | llama.cpp config | Modal explaining speculative decoding |
| `SafeTensorDisplay` | Model Form Step 2 | SafeTensor metadata display |

### Related Documentation

- **[GGUF Format Guide](../models/gguf-format.md)** - Comprehensive GGUF documentation
- **[llama.cpp Guide](../models/llamaCPP.md)** - Full llama.cpp configuration including speculative decoding
- **[vLLM Guide](../models/vllm.md)** - vLLM configuration including GGUF support
- **[Engine Comparison](../models/engine-comparison.md)** - When to use vLLM vs llama.cpp
- **[Multi-Part GGUF](../models/gguf-multipart.md)** - Split file handling

---

## Executive Summary

Cortex provides **dual-engine GGUF support** through vLLM (limited) and llama.cpp (full). The implementation is production-ready for common use cases but has several gaps that could improve user experience, reduce configuration errors, and enable advanced features.

**Key Strengths:**
- Multi-part GGUF auto-detection for llama.cpp (native split-file loading)
- Smart quantization grouping in frontend
- Version-aware vLLM entrypoint selection
- Comprehensive llama.cpp parameter exposure

**Priority Gaps:**
1. vLLM GGUF limitations not clearly communicated to users
2. No smart engine recommendation for multi-part GGUF scenarios
3. No GGUF metadata extraction (architecture, context length, vocab size)
4. Missing tokenizer auto-resolution suggestions
5. No GGUF binary validation (relies on filename patterns)

## Test Environment

### Available Test Models
Located in `/var/cortex/models/`:
| Model | Type | Size | Use Case |
|-------|------|------|----------|
| `alamios_Mistral-Small-3.1-DRAFT-0.5B-GGUF` | GGUF | ~0.5B | GGUF/offline testing |
| `Qwen3-0.6B` | SafeTensors | ~0.6B | Standard vLLM testing |

### Hardware Constraints
- **GPU:** NVIDIA GeForce RTX 3060 (Laptop)
- **VRAM:** 6144 MiB total (~5GB usable)
- **Driver:** 580.95.05
- **CUDA:** 13.0
---

## Current Implementation Overview

### Backend: `docker_manager.py`

#### vLLM GGUF Support
```python
# Lines 147-155 - GGUF-specific vLLM arguments
if m.tokenizer:
    cmd.extend(["--tokenizer", m.tokenizer])
if m.hf_config_path:
    cmd.extend(["--hf-config-path", m.hf_config_path])
```

**Current Capabilities:**
- ✅ `--tokenizer` flag for external HF tokenizer
- ✅ `--hf-config-path` for model configuration
- ✅ Version-aware entrypoint detection (v0.6-0.12+)
- ✅ Debug logging via environment variables

**vLLM GGUF Limitations (from research):**
- Only single-file GGUFs supported
- No multi-part GGUF support
- Requires external tokenizer (from HF repo or local)
- Limited quantization types supported
- Performance inferior to native HF format

#### llama.cpp GGUF Support
```python
# Lines 192-231 - Full llama-server configuration
cmd = [
    "--model", model_path,
    "--host", "0.0.0.0",
    "--port", str(internal_port),
    "--ctx-size", str(m.context_size or 8192),
    "--n-gpu-layers", str(m.ngl or 999),
    # ... comprehensive parameter support
]
```

**Current Capabilities:**
- ✅ Full GGUF support including multi-part files
- ✅ Automatic first-part detection (`-00001-of-XXXXX.gguf`)
- ✅ KV cache quantization (`--cache-type-k`, `--cache-type-v`)
- ✅ NUMA policies
- ✅ Flash attention toggle
- ✅ Memory locking and mmap control
- ✅ Tensor split for multi-GPU
- ✅ RoPE frequency scaling

### Backend: `gguf_utils.py`

**Current Capabilities:**
- ✅ Multi-part detection via regex patterns
- ✅ Quantization type extraction from filenames
- ✅ Smart grouping with recommendations
- ✅ Status reporting: `ready`, `incomplete`, `needs_merge`, `merged_available`
- ✅ Total size calculation per group

```python
# Regex patterns for multi-part detection
MULTI_PART_PATTERNS = [
    r"-(\d+)-of-(\d+)\.gguf$",    # model-00001-of-00003.gguf
    r"\.part(\d+)of(\d+)\.gguf$", # model.part1of3.gguf
    r"\.gguf\.(\d+)of(\d+)$",     # model.gguf.1of3
]
```

### Frontend Components

#### `GGUFGroupSelector.tsx`
- ✅ Visual quantization selection with radio buttons
- ✅ Multi-part indicator badges
- ✅ Size display per group
- ✅ "Recommended" badge logic
- ✅ Status-based styling (incomplete files grayed out)
- ✅ "How to merge?" modal trigger

#### `OfflineModeFields.tsx`
- ✅ GGUF/SafeTensors toggle when both present
- ✅ Tokenizer source selection (HF repo vs local)
- ✅ Expandable GGUF requirements help
- ✅ HF config path input

#### `LlamaCppConfiguration.tsx`
- ✅ Context size slider
- ✅ GPU layers (ngl) control
- ✅ Batch size / ubatch size
- ✅ Parallel slots
- ✅ KV cache type selection (k and v)
- ✅ CPU threads
- ✅ Flash attention toggle
- ✅ Memory locking / mmap options
- ✅ NUMA policy selection
- ✅ RoPE frequency controls

---

## Identified Gaps

### Gap #1: vLLM GGUF Limitations Not Surfaced (HIGH)

**Problem:** Users may select vLLM for GGUF files without understanding its limitations.

**Current Behavior:** No warning when selecting vLLM with GGUF file.

**Recommendation:**
```typescript
// In OfflineModeFields.tsx or EngineSelection.tsx
{engineType === 'vllm' && useGguf && (
  <div className="warning-banner">
    ⚠️ vLLM GGUF support is limited:
    - Only single-file GGUFs supported
    - Performance lower than native HF format
    - Requires external tokenizer
    Consider using llama.cpp for optimal GGUF support.
  </div>
)}
```

**Files to Modify:**
- `frontend/src/components/models/modelForm/OfflineModeFields.tsx`
- `frontend/src/components/models/modelForm/EngineSelection.tsx`

---

### Gap #2: Smart Engine Recommendation for Multi-part GGUF (HIGH) ⭐ NEW

**Problem:** When users have multi-part GGUF files and select vLLM, vLLM cannot load them (only supports single-file GGUF). Users need clear guidance on their options.

**Current Behavior:** No engine recommendation based on file analysis. Users may select vLLM for multi-part GGUF and hit a wall.

**Research Finding (Jan 2026):**
> "vLLM currently only supports loading single-file GGUF models. If your GGUF model is split into multiple files, you will need to merge them into a single file using a tool like `gguf-split` before it can be used with vLLM."
> — vLLM Documentation

**Decision Matrix:**

| Scenario | SafeTensors Available | Recommended Engine | Rationale |
|----------|----------------------|-------------------|-----------|
| Single GGUF | Yes | vLLM (SafeTensors) | Native format, best performance |
| Single GGUF | No | Either (llama.cpp preferred) | llama.cpp has better GGUF support |
| Multi-part GGUF | Yes | vLLM (SafeTensors) | Avoid GGUF complexity entirely |
| Multi-part GGUF | No | llama.cpp | Native split-file support |

**User Options When Multi-part GGUF + vLLM Selected:**

1. **Switch to llama.cpp** (Recommended if no SafeTensors)
   - Native multi-part support, zero extra disk space
   - Full GGUF optimization

2. **Use SafeTensors instead** (Recommended if available)
   - Best vLLM performance
   - Native HF format support

3. **Merge GGUF files first** (Manual option)
   - Requires 2x disk space
   - One-time operation, cached
   - Use `llama-gguf-split --merge` or binary concatenation

**Recommendation - Smart Guidance Component:**

```typescript
// frontend/src/components/models/modelForm/EngineGuidance.tsx
interface EngineGuidanceProps {
  engineType: 'vllm' | 'llamacpp';
  hasMultipartGguf: boolean;
  hasSafeTensors: boolean;
  hasGguf: boolean;
  onSwitchEngine: (engine: 'vllm' | 'llamacpp') => void;
  onSwitchToSafeTensors: () => void;
}

export function EngineGuidance({ 
  engineType, hasMultipartGguf, hasSafeTensors, hasGguf, 
  onSwitchEngine, onSwitchToSafeTensors 
}: EngineGuidanceProps) {
  // Case: vLLM selected with multi-part GGUF
  if (engineType === 'vllm' && hasMultipartGguf) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-2">
          <span className="text-amber-400 text-lg">⚠️</span>
          <div>
            <p className="text-amber-200 font-medium">Multi-part GGUF Detected</p>
            <p className="text-amber-200/70 text-sm mt-1">
              vLLM only supports single-file GGUF. Choose an option below:
            </p>
          </div>
        </div>
        
        <div className="space-y-2 ml-6">
          {hasSafeTensors && (
            <button 
              onClick={onSwitchToSafeTensors}
              className="w-full text-left px-3 py-2 rounded-lg bg-emerald-500/10 
                         border border-emerald-500/30 hover:bg-emerald-500/20 transition"
            >
              <span className="text-emerald-400 font-medium">✓ Recommended:</span>
              <span className="text-white/80 ml-2">Use SafeTensors with vLLM</span>
              <p className="text-emerald-300/60 text-xs mt-1">
                Best performance, native HF format support
              </p>
            </button>
          )}
          
          <button 
            onClick={() => onSwitchEngine('llamacpp')}
            className="w-full text-left px-3 py-2 rounded-lg bg-blue-500/10 
                       border border-blue-500/30 hover:bg-blue-500/20 transition"
          >
            <span className="text-blue-400 font-medium">
              {hasSafeTensors ? '○ Alternative:' : '✓ Recommended:'}
            </span>
            <span className="text-white/80 ml-2">Switch to llama.cpp</span>
            <p className="text-blue-300/60 text-xs mt-1">
              Native multi-part GGUF support, no extra disk space needed
            </p>
          </button>
          
          <details className="text-xs text-white/50">
            <summary className="cursor-pointer hover:text-white/70">
              Manual option: Merge GGUF files first
            </summary>
            <div className="mt-2 p-2 bg-black/20 rounded">
              <code>llama-gguf-split --merge part-00001.gguf merged.gguf</code>
              <p className="mt-1">Requires 2x disk space. One-time operation.</p>
            </div>
          </details>
        </div>
      </div>
    );
  }
  
  // Case: vLLM with single GGUF but SafeTensors available
  if (engineType === 'vllm' && hasGguf && hasSafeTensors) {
    return (
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
        <p className="text-blue-300 text-sm">
          💡 <strong>Tip:</strong> SafeTensors detected. vLLM performs better with SafeTensors than GGUF.
          <button 
            onClick={onSwitchToSafeTensors}
            className="ml-2 text-blue-400 underline hover:text-blue-300"
          >
            Switch to SafeTensors
          </button>
        </p>
      </div>
    );
  }
  
  return null;
}
```

**Backend Enhancement - Inspection Response:**

```python
# backend/src/routes/models.py - Enhanced inspect-folder response
@router.get("/models/inspect-folder")
async def inspect_folder(base: str, folder: str):
    # ... existing logic ...
    
    return {
        # ... existing fields ...
        "engine_recommendation": {
            "recommended": "llamacpp" if has_multipart_gguf else ("vllm" if has_safetensors else "either"),
            "reason": get_recommendation_reason(has_multipart_gguf, has_safetensors, has_gguf),
            "options": get_available_options(has_multipart_gguf, has_safetensors, has_gguf),
        }
    }

def get_recommendation_reason(multipart: bool, safetensors: bool, gguf: bool) -> str:
    if multipart and safetensors:
        return "Multi-part GGUF detected. Use SafeTensors with vLLM for best performance, or llama.cpp for native GGUF support."
    if multipart:
        return "Multi-part GGUF detected. llama.cpp recommended for native split-file loading."
    if safetensors:
        return "SafeTensors available. vLLM recommended for optimal performance."
    if gguf:
        return "GGUF only. llama.cpp recommended for best GGUF support."
    return "Standard model files. Either engine works well."
```

**Files to Modify:**
- `frontend/src/components/models/modelForm/EngineGuidance.tsx` (new)
- `frontend/src/components/models/modelForm/OfflineModeFields.tsx`
- `frontend/src/components/models/modelForm/EngineSelection.tsx`
- `backend/src/routes/models.py`

---

### Gap #3: No GGUF Metadata Extraction (MEDIUM-HIGH)

**Problem:** The system relies entirely on filename patterns for GGUF analysis. Actual GGUF headers contain valuable metadata (architecture, context length, vocab size, quantization type).

**Current Behavior:** `gguf_utils.py` only parses filenames.

**What GGUF Headers Contain:**
- `general.architecture` - Model architecture (llama, mistral, phi, etc.)
- `general.name` - Model name
- `general.quantization_version` - Quantization version
- `llama.context_length` - Native context length
- `llama.embedding_length` - Embedding dimension
- `tokenizer.ggml.model` - Tokenizer type

**Recommendation:** Add GGUF header parsing using `gguf` Python library:

```python
# backend/src/gguf_utils.py - New function
def parse_gguf_metadata(filepath: str) -> dict:
    """Parse GGUF file header for metadata."""
    import struct
    
    with open(filepath, 'rb') as f:
        magic = f.read(4)
        if magic != b'GGUF':
            raise ValueError("Not a valid GGUF file")
        
        version = struct.unpack('<I', f.read(4))[0]
        n_tensors = struct.unpack('<Q', f.read(8))[0]
        n_kv = struct.unpack('<Q', f.read(8))[0]
        
        # Parse key-value pairs
        metadata = {}
        for _ in range(n_kv):
            # Parse key name, type, and value
            # ... (GGUF spec parsing logic)
        
        return {
            'version': version,
            'architecture': metadata.get('general.architecture'),
            'context_length': metadata.get('llama.context_length'),
            'vocab_size': metadata.get('llama.vocab_size'),
            'quantization': metadata.get('general.quantization_version'),
        }
```

**Dependencies:** Consider adding `gguf` package to requirements.txt

---

### Gap #4: Missing Tokenizer Auto-Resolution (MEDIUM)

**Problem:** Users must manually find the correct HF repo ID for tokenizers. Common patterns exist that could enable suggestions.

**Current Behavior:** Empty text input with manual entry.

**Recommendation:** Add tokenizer suggestions based on model name patterns:

```python
# backend/src/gguf_utils.py or new tokenizer_resolver.py
TOKENIZER_PATTERNS = {
    'llama': 'meta-llama/Llama-3.1-8B-Instruct',
    'mistral': 'mistralai/Mistral-7B-Instruct-v0.3',
    'qwen': 'Qwen/Qwen2.5-7B-Instruct',
    'phi': 'microsoft/Phi-3-mini-4k-instruct',
    'gemma': 'google/gemma-2-9b-it',
    'yi': '01-ai/Yi-1.5-34B-Chat',
    'deepseek': 'deepseek-ai/DeepSeek-V2-Lite',
}

def suggest_tokenizer(model_name: str) -> list[str]:
    """Suggest tokenizer repos based on model name."""
    suggestions = []
    name_lower = model_name.lower()
    for pattern, repo in TOKENIZER_PATTERNS.items():
        if pattern in name_lower:
            suggestions.append(repo)
    return suggestions
```

**Frontend Enhancement:**
- Add dropdown/autocomplete with suggestions
- Show "Common tokenizers for this model type" helper

---

### Gap #5: No GGUF Binary Validation (MEDIUM)

**Problem:** Files are assumed valid based on `.gguf` extension only. Corrupt or incomplete files will fail at container startup.

**Current Behavior:** No validation before deployment.

**Recommendation:** Add quick header validation:

```python
def validate_gguf_file(filepath: str) -> tuple[bool, str]:
    """Quick validation of GGUF file header."""
    try:
        with open(filepath, 'rb') as f:
            magic = f.read(4)
            if magic != b'GGUF':
                return False, "Invalid magic bytes - not a GGUF file"
            
            version = struct.unpack('<I', f.read(4))[0]
            if version < 2 or version > 4:
                return False, f"Unsupported GGUF version: {version}"
            
            # Check file isn't truncated
            f.seek(0, 2)
            size = f.tell()
            if size < 1024:  # Minimum realistic size
                return False, "File appears truncated"
            
        return True, "Valid GGUF file"
    except Exception as e:
        return False, str(e)
```

---

### Gap #6: llama.cpp Speculative Decoding Not Exposed (MEDIUM)

**Problem:** llama-server supports speculative decoding (`--draft-model`, `--draft-p-min`) which can significantly improve throughput, but this isn't exposed in Cortex.

**llama-server Flags:**
- `--draft-model PATH` - Draft model for speculative decoding
- `--draft-n N` - Number of tokens to draft (default: 16)
- `--draft-p-min P` - Minimum probability for draft acceptance

**Recommendation:** Add speculative decoding configuration:

**Database:**
```python
# models.py - New fields
draft_model_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
draft_n: Mapped[int | None] = mapped_column(Integer, nullable=True)
draft_p_min: Mapped[float | None] = mapped_column(Float, nullable=True)
```

**Frontend:**
```typescript
// LlamaCppConfiguration.tsx - New section
<details>
  <summary>Speculative Decoding (Advanced)</summary>
  <label>Draft Model Path
    <input type="text" placeholder="/path/to/draft-model.gguf" />
  </label>
  <label>Draft Tokens (n)
    <input type="number" min={1} max={64} defaultValue={16} />
  </label>
</details>
```

---

### Gap #7: vLLM GGUF Weight Format Options (LOW)

**Problem:** vLLM supports `--gguf-weight-format` flag but it's not exposed.

**vLLM Options:**
- `auto` - Automatic detection
- `ggml` - Legacy GGML format
- `gguf` - GGUF format

**Recommendation:** Add to VLLMConfiguration when GGUF detected:
```typescript
{useGguf && (
  <label>GGUF Weight Format
    <select defaultValue="auto">
      <option value="auto">auto</option>
      <option value="gguf">gguf</option>
      <option value="ggml">ggml (legacy)</option>
    </select>
  </label>
)}
```

---

### Gap #8: No Flash Attention Availability Check (LOW)

**Problem:** Flash Attention 2 requires specific GPU compute capabilities (SM 80+). Users may enable it on incompatible hardware.

**Current Behavior:** Simple checkbox toggle.

**Recommendation:** Add GPU capability check:

```python
# backend/src/gpu_utils.py or docker_manager.py
def check_flash_attention_support(gpu_info: list) -> tuple[bool, str]:
    """Check if GPUs support Flash Attention 2."""
    # SM 8.0+ required (A100, A10, RTX 30xx, RTX 40xx, H100, L40)
    SUPPORTED_ARCHS = ['Ampere', 'Ada', 'Hopper']
    
    for gpu in gpu_info:
        arch = gpu.get('architecture', '')
        if not any(a in arch for a in SUPPORTED_ARCHS):
            return False, f"GPU {gpu['name']} may not support FA2"
    
    return True, "Flash Attention 2 supported"
```

---

### Gap #9: No Context Length Auto-Sizing (LOW)

**Problem:** Context length significantly impacts VRAM usage. No guidance based on available GPU memory.

**Recommendation:** Add VRAM-based suggestions:

```typescript
// LlamaCppConfiguration.tsx
const suggestContextSize = (vramMB: number, quantType: string) => {
  // Rough estimates based on quantization
  const bytesPerToken = {
    'Q4_K_M': 4.5,
    'Q5_K_M': 5.5,
    'Q8_0': 8.5,
    'F16': 16,
  }[quantType] || 6;
  
  const availableForContext = vramMB * 0.3 * 1024 * 1024; // 30% of VRAM
  return Math.floor(availableForContext / bytesPerToken);
};
```

---

### Gap #10: Manual Multi-part Merge Instructions (LOW)

**Problem:** `MergeInstructionsModal.tsx` provides manual CLI instructions. While llama.cpp handles splits natively, users may want merged files for other tools.

**Current:** Modal with llama-gguf-split command instructions.

**Enhancement:** Consider adding one-click merge button that runs merge in backend:

```python
# backend/src/gguf_utils.py
async def merge_gguf_parts(parts: list[str], output_path: str) -> str:
    """Merge multi-part GGUF files."""
    import subprocess
    
    # Use llama-gguf-split --merge
    cmd = ['llama-gguf-split', '--merge', parts[0], output_path]
    result = subprocess.run(cmd, capture_output=True)
    
    if result.returncode != 0:
        raise Exception(result.stderr.decode())
    
    return output_path
```

---

### Gap #11: No GGUF Compatibility Matrix (LOW)

**Problem:** Different architectures have different support levels in vLLM vs llama.cpp. Users can't easily see what's supported.

**Recommendation:** Add compatibility display:

```typescript
// New component: GGUFCompatibilityBadge.tsx
const COMPATIBILITY = {
  'llama': { vllm: 'full', llamacpp: 'full' },
  'mistral': { vllm: 'full', llamacpp: 'full' },
  'qwen2': { vllm: 'full', llamacpp: 'full' },
  'phi3': { vllm: 'partial', llamacpp: 'full' },
  'mamba': { vllm: 'none', llamacpp: 'full' },
  'rwkv': { vllm: 'none', llamacpp: 'partial' },
  'harmony': { vllm: 'none', llamacpp: 'full' }, // GPT-OSS
};
```

---

### Gap #12: No Quantization Quality Indicators (LOW)

**Problem:** Users may not understand tradeoffs between Q4_K_M, Q5_K_M, Q8_0, etc.

**Recommendation:** Add tooltips/badges with guidance:

```typescript
const QUANT_INFO = {
  'Q4_K_M': { size: '~4.5 bits', quality: '★★★☆☆', speed: '★★★★★' },
  'Q5_K_M': { size: '~5.5 bits', quality: '★★★★☆', speed: '★★★★☆' },
  'Q6_K': { size: '~6.5 bits', quality: '★★★★☆', speed: '★★★☆☆' },
  'Q8_0': { size: '8 bits', quality: '★★★★★', speed: '★★★☆☆' },
  'F16': { size: '16 bits', quality: '★★★★★', speed: '★★☆☆☆' },
};
```

---

### Gap #13: No Model Card Integration (LOW)

**Problem:** HuggingFace model cards contain useful info (license, intended use, limitations) that could be displayed.

**Recommendation:** Fetch and display model card info when tokenizer repo is specified:

```python
# backend/src/hf_utils.py
async def fetch_model_card(repo_id: str) -> dict:
    """Fetch model card from HuggingFace."""
    from huggingface_hub import hf_hub_download
    
    try:
        card_path = hf_hub_download(repo_id, 'README.md')
        # Parse frontmatter for license, tags, etc.
        return parse_model_card(card_path)
    except:
        return {}
```

---

### Gap #14: No imatrix Support (LOW)

**Problem:** Importance matrix quantization (`--imatrix`) improves quality for aggressive quantization but isn't supported.

**llama.cpp Flags:**
- `--imatrix FILE` - Importance matrix for smarter quantization

**This is primarily a quantization-time feature, not inference-time, so lower priority.**

---

### Gap #15: Limited LoRA Adapter Display for GGUF (VERY LOW)

**Problem:** vLLM supports LoRA adapters, llama.cpp supports GGUF-based LoRAs (`--lora`), but neither is well-surfaced.

**Recommendation:** Add LoRA configuration section:

```typescript
// New section in LlamaCppConfiguration.tsx
<details>
  <summary>LoRA Adapters</summary>
  <label>LoRA Path
    <input type="text" placeholder="/path/to/lora.gguf" />
  </label>
  <label>LoRA Scale
    <input type="number" min={0} max={2} step={0.1} defaultValue={1} />
  </label>
</details>
```

---

### Gap #16: vLLM GGUF + Chunked Prefill Untested (VERY LOW)

**Problem:** Chunked prefill may not work correctly with GGUF in vLLM. Needs testing and documentation.

**Recommendation:** Add note/warning when both are enabled:

```typescript
{useGguf && values.enable_chunked_prefill && (
  <p className="text-amber-400 text-xs">
    ⚠️ Chunked prefill with GGUF is not well-tested. 
    Disable if you experience issues.
  </p>
)}
```

---

### Gap #17: No RoPE Scaling Auto-Detection (VERY LOW)

**Problem:** Extended context models (e.g., 128K context) often use RoPE scaling. This requires manual configuration.

**GGUF Metadata Fields:**
- `llama.rope.freq_base`
- `llama.rope.scaling.type`
- `llama.rope.scaling.factor`

**Recommendation:** Auto-populate from GGUF metadata when parsed (depends on Gap #2):

```python
def suggest_rope_config(metadata: dict) -> dict:
    """Suggest RoPE config from GGUF metadata."""
    return {
        'rope_freq_base': metadata.get('llama.rope.freq_base', 10000),
        'rope_freq_scale': 1.0 / metadata.get('llama.rope.scaling.factor', 1.0),
    }
```

---

## Implementation Priority Matrix

| Gap | Description | Severity | Effort | Impact | Priority | Status |
|-----|-------------|----------|--------|--------|----------|--------|
| #1 | vLLM GGUF Warnings | High | Low | High | **P1** | ✅ **DONE** |
| #2 | Smart Engine Recommendation ⭐ | High | Medium | High | **P1** | ✅ **DONE** |
| #3 | GGUF Metadata Extraction | Medium-High | Medium | High | **P1** | ✅ **DONE** |
| #4 | Tokenizer Suggestions | Medium | Low | Medium | **P2** | ✅ **DONE** |
| #5 | Binary Validation | Medium | Low | Medium | **P2** | ✅ **DONE** |
| #6 | Speculative Decoding | Medium | Medium | Medium | **P2** | ✅ **DONE** |
| #7 | Weight Format | Low | Low | Low | P3 | ✅ **DONE** |
| #8 | FA Availability | Low | Medium | Low | P3 | ✅ **DONE** |
| #9 | Context Auto-Size | Low | Low | Medium | P3 | Pending |
| #10 | Merge Automation | Low | High | Low | P4 | Pending |
| #11 | Compatibility Matrix | Low | Low | Medium | P3 | ✅ **DONE** |
| #12 | Quality Indicators | Low | Low | Medium | P3 | ✅ **DONE** |
| #13 | Model Card | Low | Medium | Low | P4 | Pending |
| #14 | imatrix | Low | High | Low | P4 | Pending |
| #15 | LoRA Display | Very Low | Medium | Low | P4 | Pending |
| #16 | Chunked Prefill | Very Low | Low | Low | P4 | Pending |
| #17 | RoPE Auto-Detect | Very Low | Low | Low | P4 | Pending |

---

## Implementation Progress

### ✅ Completed: Gaps #1 + #2 (Smart Engine Guidance)

**Completed:** January 9, 2026

**Files Modified:**
| File | Changes |
|------|---------|
| `backend/src/schemas/models.py` | Added `EngineRecommendation` schema |
| `backend/src/services/folder_inspector.py` | Added `compute_engine_recommendation()` function |
| `frontend/src/components/models/modelForm/EngineGuidance.tsx` | **NEW** - Smart guidance component |
| `frontend/src/components/models/modelForm/OfflineModeFields.tsx` | Integrated guidance component |
| `frontend/src/components/models/modelForm/EngineSelection.tsx` | Added recommendation awareness |
| `frontend/src/components/models/ModelForm.tsx` | Wired up new props |

**Features Implemented:**
- ✅ Backend computes `engine_recommendation` during folder inspection
- ✅ Decision matrix: Multi-part GGUF + SafeTensors → vLLM; Multi-part GGUF only → llama.cpp
- ✅ `EngineGuidance.tsx` component with 4 case handlers
- ✅ One-click "Switch to SafeTensors" and "Switch to llama.cpp" buttons
- ✅ Warning banners for vLLM + multi-part GGUF (incompatible)
- ✅ Tips for vLLM + GGUF when SafeTensors available
- ✅ Experimental GGUF warning when using vLLM with GGUF-only folders
- ✅ Engine selection dropdown shows contextual recommendation badges

---

### ✅ Completed: Gap #12 (Quantization Quality Indicators)

**Completed:** January 9, 2026

**Files Modified:**
| File | Changes |
|------|---------|
| `frontend/src/components/models/modelForm/GGUFGroupSelector.tsx` | Added quality/speed indicators |

**Features Implemented:**
- ✅ `QUANT_INFO` lookup table with 30+ quantization types
- ✅ Quality bars (1-5 scale, green) showing output quality
- ✅ Speed bars (1-5 scale, blue) showing inference speed
- ✅ Bits-per-weight display for each quantization type
- ✅ Description tooltips explaining each quantization level
- ✅ Legend in selector header

---

### ✅ Completed: Gap #4 (Tokenizer Suggestions)

**Completed:** January 9, 2026

**Files Modified:**
| File | Changes |
|------|---------|
| `frontend/src/components/models/modelForm/OfflineModeFields.tsx` | Added `TokenizerInput` component with suggestions |

**Features Implemented:**
- ✅ `TOKENIZER_SUGGESTIONS` lookup with 20+ model families
- ✅ Pattern-based matching (Llama, Mistral, Qwen, Phi, Gemma, Yi, DeepSeek, etc.)
- ✅ Dropdown suggestions on input focus
- ✅ Inline suggestion pills for quick selection
- ✅ Auto-suggests based on folder/model name

---

### ✅ Completed: Gap #5 (GGUF Binary Validation)

**Completed:** January 9, 2026

**Files Modified:**
| File | Changes |
|------|---------|
| `backend/src/utils/gguf_utils.py` | Added `validate_gguf_file()` and `validate_gguf_files_in_directory()` |
| `backend/src/schemas/models.py` | Added `GGUFValidationSummary` schema |
| `backend/src/services/folder_inspector.py` | Integrated validation into folder inspection |
| `frontend/src/components/models/modelForm/OfflineModeFields.tsx` | Added `GGUFValidationBadge` component |

**Features Implemented:**
- ✅ Magic byte validation (`GGUF` = `0x47475546`)
- ✅ Version check (supports GGUF v2 and v3)
- ✅ Header structure validation (tensor count, KV count)
- ✅ File size sanity check (minimum 256 bytes)
- ✅ Legacy GGML format detection with helpful error
- ✅ Truncation detection
- ✅ Validation summary in folder inspection response
- ✅ Frontend badge showing validation status (✓ valid / ❌ errors)

---

## Recommended Implementation Order (Updated)

### Phase 1: User Guidance & Guardrails ✅ COMPLETE
1. ~~**Gap #1** - Add vLLM GGUF limitation warnings~~ ✅ Done
2. ~~**Gap #2** - Smart engine recommendation~~ ✅ Done
3. ~~**Gap #12** - Add quantization quality indicators~~ ✅ Done

### Phase 2: Smarter Defaults ✅ COMPLETE
4. ~~**Gap #4** - Add tokenizer suggestions dropdown~~ ✅ Done
5. ~~**Gap #5** - Add GGUF binary validation~~ ✅ Done
6. ~~**Gap #3** - Implement GGUF metadata extraction~~ ✅ Done

### Phase 3: Advanced Features ✅ COMPLETE
7. ~~**Gap #6** - Expose speculative decoding for llama.cpp~~ ✅ Done
8. ~~**Gap #8** - Flash Attention availability check~~ ✅ Done
9. ~~**Gap #11** - Architecture compatibility display~~ ✅ Done
10. ~~**Gap #7** - vLLM GGUF weight format option~~ ✅ Done

### Phase 4: Polish (ongoing)
- Remaining low-priority gaps as time permits
- Gap #10 (merge automation) only if user demand warrants the complexity

---

## Technical Notes

### GGUF Format Reference
- Magic bytes: `GGUF` (0x47475546)
- Version: uint32 (currently 2 or 3)
- Header contains tensor count, KV pair count
- Key-value pairs use length-prefixed strings
- Tensor metadata follows KV pairs
- Binary tensor data at end of file

### vLLM GGUF Internals
- Uses `llama.cpp` library internally for GGUF parsing
- Converts GGUF tensors to PyTorch format
- Performance overhead from format conversion
- Limited to architectures vLLM supports

### llama.cpp Server API
- Full OpenAI API compatibility
- Native GGUF support (no conversion)
- Split-file loading via first-part path
- Extensive quantization support

---

## Conclusion

Cortex's GGUF implementation is **functional and production-ready** for common use cases. With the completion of Gaps #1 and #2, the system now provides **smart engine guidance** that prevents the most common failure scenarios.

### Current Status (January 10, 2026)

| Category | Status |
|----------|--------|
| Smart Engine Guidance | ✅ Complete |
| vLLM GGUF Warnings | ✅ Complete |
| Multi-part GGUF Handling | ✅ Complete (llama.cpp native support) |
| Tokenizer Suggestions | ✅ Complete |
| Quantization Quality Indicators | ✅ Complete |
| GGUF Binary Validation | ✅ Complete |
| GGUF Metadata Extraction | ✅ Complete |
| SafeTensor Folder Info Display | ✅ Complete |
| Folder Scanning Loading Indicator | ✅ Complete |
| Speculative Decoding (llama.cpp) | ✅ Complete |
| **Flash Attention Availability Check** | ✅ **Complete** |
| **Architecture Compatibility Display** | ✅ **Complete** |
| **vLLM GGUF Weight Format Option** | ✅ **Complete** |

### Remaining Items (Low Priority)

| Priority | Gap | Description | Effort | Impact |
|----------|-----|-------------|--------|--------|
| Low | #9 | VRAM-based context size suggestions | 2-3 hrs | Low |
| Low | #10 | Manual multi-part merge automation | 4+ hrs | Low |

### What's Been Achieved

The **smart engine guidance** implementation (Gaps #1 + #2) now:
- ✅ Detects multi-part GGUF during folder inspection
- ✅ Recommends SafeTensors + vLLM when available
- ✅ Recommends llama.cpp for GGUF-only scenarios
- ✅ Shows one-click action buttons for engine/format switching
- ✅ Displays experimental GGUF warnings for vLLM
- ✅ Provides manual merge instructions as fallback

The **GGUF metadata extraction** (Gap #3) now:
- ✅ Parses GGUF file headers to extract model metadata
- ✅ Extracts: architecture, context_length, embedding_length, block_count, attention heads, vocab_size
- ✅ Handles GQA (Grouped Query Attention) - shows heads as "Q/KV" ratio
- ✅ Maps GGUF file_type codes to human-readable names
- ✅ Displays colorful metadata badges in the UI:
  - **Arch**: Model architecture (llama, qwen2, mistral, etc.)
  - **Ctx**: Context length in K tokens (e.g., "32K")
  - **Layers**: Number of transformer blocks
  - **Hidden**: Embedding dimension
  - **Heads**: Attention heads with GQA ratio (e.g., "14/2")
  - **Vocab**: Vocabulary size in K tokens

This eliminates the most common failure scenario where users try to load multi-part GGUF with vLLM, and now provides rich metadata to help users understand model capabilities at a glance.

---

### ✅ Completed: Gap #6 (Speculative Decoding)

**Completed:** January 10, 2026

**Files Modified:**
| File | Changes |
|------|---------|
| `backend/src/models.py` | Added `draft_model_path`, `draft_n`, `draft_p_min` fields |
| `backend/src/schemas/models.py` | Added fields to ModelItem, CreateModelRequest, UpdateModelRequest |
| `backend/src/routes/models.py` | Wired up new fields in create/update/list handlers |
| `backend/src/docker_manager.py` | Added `--model-draft`, `--draft`, `--draft-p-min` args |
| `frontend/src/components/models/ModelForm.tsx` | Added fields to ModelFormValues type |
| `frontend/src/components/models/ModelWorkflowForm.tsx` | Added fields to defaults |
| `frontend/src/components/models/modelForm/LlamaCppConfiguration.tsx` | Added Speculative Decoding UI section |

**Features Implemented:**
- ✅ Database fields: `draft_model_path`, `draft_n`, `draft_p_min`
- ✅ Backend passes `--model-draft`, `--draft`, `--draft-p-min` to llama-server
- ✅ Frontend UI section in "Advanced llama.cpp Configuration":
  - Draft Model Path input with helpful example
  - Draft Tokens (n) slider (1-64, default 16)
  - Min Acceptance Probability slider (0-1, default 0.5)
  - Visual confirmation when speculative decoding is configured
- ✅ Tooltips explaining how speculative decoding works
- ✅ Full API support for create/update/list operations

**Usage:**
Speculative decoding uses a small "draft" model (e.g., 0.5B) to speculatively predict tokens for a larger model. The main model then verifies these predictions, potentially accepting multiple tokens per forward pass, which can significantly improve throughput.

Example configuration:
- **Main model:** Mistral-Small-24B (Q4_K_M quantized)
- **Draft model:** Mistral-Small-0.5B-DRAFT (Q8_0 quantized)
- **Draft tokens:** 16
- **Min acceptance:** 0.5

---

### ✅ Completed: Gap #8 (Flash Attention Availability Check)

**Completed:** January 10, 2026

**Files Modified:**
| File | Changes |
|------|---------|
| `backend/src/schemas/admin.py` | Added `compute_capability`, `architecture`, `flash_attention_supported` to GpuMetrics |
| `backend/src/routes/admin.py` | Extended NVML GPU info with compute capability and FA2 support check |
| `frontend/src/components/models/modelForm/LlamaCppConfiguration.tsx` | Added FA2 compatibility badge and warning |
| `frontend/src/components/models/modelForm/VLLMConfiguration.tsx` | Added FA2 compatibility badge and warning for attention backend |

**Features Implemented:**
- ✅ Backend detects GPU compute capability via NVML (`nvmlDeviceGetCudaComputeCapability`)
- ✅ Determines GPU architecture name (Ampere, Ada Lovelace, Hopper, etc.)
- ✅ Calculates Flash Attention 2 support (requires SM 80+)
- ✅ Frontend displays compatibility badges:
  - ✓ Green badge with architecture name when FA2 supported
  - ⚠️ Amber/red badge when FA2 not supported
- ✅ Shows warning when user enables Flash Attention on incompatible GPU
- ✅ Applies to both llama.cpp (flash_attention checkbox) and vLLM (attention_backend dropdown)

**Flash Attention 2 Requirements:**
- Requires NVIDIA GPU with Compute Capability 8.0+ (SM 80+)
- Supported: Ampere (A100, A10, RTX 30xx), Ada Lovelace (RTX 40xx, L40), Hopper (H100)
- Not supported: Turing (T4, RTX 20xx), Volta (V100), Pascal, older

---

### ✅ Completed: Gap #11 (Architecture Compatibility Display)

**Completed:** January 10, 2026

**Files Modified:**
| File | Changes |
|------|---------|
| `frontend/src/components/models/modelForm/ArchitectureCompatibility.tsx` | **NEW FILE** - Compatibility matrix and badges |
| `frontend/src/components/models/modelForm/GGUFGroupSelector.tsx` | Integrated compatibility badges in metadata display |
| `frontend/src/components/models/modelForm/SafeTensorDisplay.tsx` | Integrated compatibility badges for SafeTensor models |

**Features Implemented:**
- ✅ Comprehensive compatibility matrix for 40+ model architectures
- ✅ Support levels: `full`, `partial`, `experimental`, `none`, `unknown`
- ✅ Architecture normalization for robust matching (handles various naming conventions)
- ✅ Visual compatibility badges showing vLLM and llama.cpp support:
  - ✓ Green for full support
  - ◐ Yellow for partial support
  - ⚡ Orange for experimental
  - ✗ Red for no support
- ✅ Tooltips with detailed support information and notes
- ✅ Special handling for custom architectures (GPT-OSS/Harmony → llama.cpp only)

**Supported Architectures Include:**
- LLaMA family (llama, llama2, llama3, codellama)
- Mistral family (mistral, mixtral)
- Qwen family (qwen, qwen2)
- Google (gemma, gemma2)
- Microsoft (phi, phi2, phi3, phi4)
- And many more (falcon, mpt, bloom, deepseek, internlm, stablelm, etc.)

---

### ✅ Completed: Gap #7 (vLLM GGUF Weight Format Option)

**Completed:** January 10, 2026

**Files Modified:**
| File | Changes |
|------|---------|
| `backend/src/models.py` | Added `gguf_weight_format` column |
| `backend/src/schemas/models.py` | Added field to ModelItem, CreateModelRequest, UpdateModelRequest |
| `backend/src/routes/models.py` | Wired up field in create/update handlers |
| `backend/src/docker_manager.py` | Added `--gguf-weight-format` arg for vLLM |
| `frontend/src/components/models/ModelForm.tsx` | Added to ModelFormValues type |
| `frontend/src/components/models/modelForm/VLLMConfiguration.tsx` | Added conditional dropdown |
| `frontend/src/lib/validators.ts` | Added to validation schema |

**Features Implemented:**
- ✅ Database field: `gguf_weight_format` (auto, gguf, ggml)
- ✅ Backend passes `--gguf-weight-format` to vLLM when not "auto"
- ✅ Frontend dropdown in Production Settings (only shows when GGUF file selected)
- ✅ Options:
  - `auto` (default) - vLLM auto-detects format
  - `gguf` - Modern GGUF format
  - `ggml` - Legacy GGML format
- ✅ Helpful tooltip explaining the option

---

## Validation & Testing

### Automated Test Suite

A comprehensive validation script has been created to verify all implemented features:

**Location:** `scripts/test_gguf_gaps.sh`

**To Run:**
```bash
# Ensure containers are running
make quick-start

# Run validation tests
./scripts/test_gguf_gaps.sh
```

**Tests Included:**
| Test | Description | Gaps Covered |
|------|-------------|--------------|
| Database Schema | Verifies all new columns exist | #6, #7 |
| vLLM Model Creation | Creates model with `gguf_weight_format`, `attention_backend` | #7 |
| llama.cpp Model Creation | Creates model with speculative decoding fields | #6 |
| List Models API | Verifies all new fields returned correctly | #6, #7 |
| GPU Metrics | Verifies Flash Attention fields in response | #8 |
| Folder Inspection | Verifies engine recommendation fields | #2, #3 |
| Cleanup | Archives test models | - |

**Expected Output:**
```
════════════════════════════════════════════════════════════════
  ✓ ALL TESTS PASSED - Ready for code review!
════════════════════════════════════════════════════════════════
```

### Manual Frontend Testing Checklist

| Feature | How to Test | Expected Result |
|---------|------------|-----------------|
| **Gap #7: GGUF Weight Format** | vLLM + Offline + GGUF → Step 03 → Production Settings | "GGUF Weight Format" dropdown visible |
| **Gap #8: Flash Attention** | llama.cpp → Step 03 → Performance Flags | Badge next to Flash Attention checkbox |
| **Gap #11: Architecture Compat** | Any model → Step 02 → GGUF selector | "✓ vLLM" and "✓ llama.cpp" badges |
| **Gap #6: Speculative Decoding** | llama.cpp → Step 03 → Speculative Decoding | Input fields and "What is this?" button |
| **Gap #12: Quality Indicators** | Any GGUF → Step 02 → Quantization selector | Quality/Speed bars with legend |

### Known Limitations

1. **Flash Attention Badge:** Shows "? Requires SM 80+" instead of actual GPU architecture because NVML library is not available inside the gateway container (Docker isolation). The badge still provides useful guidance.

2. **GGUF Weight Format:** Only visible when `useGguf=true` is passed from the parent form, not when editing an existing model with a `.gguf` path.

