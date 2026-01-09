# vLLM Implementation Gaps Analysis

> **Analysis Date:** January 8, 2026  
> **Scope:** Full-stack analysis of vLLM container setup, configuration, serving, and management  
> **Based on:** vLLM official documentation (Context7), codebase review, and production best practices

---

## Executive Summary

This document identifies gaps across Cortex's vLLM implementation that could introduce instability. Issues are prioritized by severity (Critical → High → Medium → Low) and include acceptance criteria and testing procedures.

**Key Finding Areas:**
1. **Missing vLLM Engine Args** - Several important configuration options not exposed
2. **Offline Mode Gaps** - Tokenizer and config.json handling issues
3. **Container Lifecycle** - Startup verification and health check limitations
4. **Frontend/Backend Mismatches** - Field naming and validation gaps
5. **Multi-GPU Stability** - NCCL configuration gaps
6. **Version Compatibility** - V1/V2 engine and entrypoint changes

---

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

**Implications:**
- Must use small models only (< 3B parameters)
- Set `gpu_memory_utilization` to 0.7-0.8
- No multi-GPU testing possible
- Use `--enforce-eager` to reduce memory overhead

---

## 🔴 CRITICAL Priority Issues

### 1. ~~GGUF Tokenizer Fails in Offline Mode~~ ✅ FIXED

**Location:** `docker_manager.py:753`, `OfflineModeFields.tsx:252-268`, `routes/models.py:120-152`

**Status:** ✅ **FIXED 2026-01-08**

**Fix Applied:**
- Added validation in `routes/models.py` that checks at model creation time if a GGUF model in offline mode has an uncached HuggingFace tokenizer
- Added diagnostic pattern in `startup_diagnostics.py` for `LocalEntryNotFoundError`
- Clear error message provides workaround options (use hf_config_path or pre-cache tokenizer)

**Issue (Original):**  
When user selects a GGUF model in offline mode and provides a HuggingFace repo ID for tokenizer (e.g., `TinyLlama/TinyLlama-1.1B-Chat-v1.0`), vLLM attempts to download the tokenizer. However, `HF_HUB_OFFLINE=1` is set, causing the download to fail silently or error out.

**Root Cause:**
```python
# docker_manager.py:753
environment["HF_HUB_OFFLINE"] = "1"  # Blocks all HF downloads

# But then we pass --tokenizer with HF repo ID
cmd += ["--tokenizer", str(m.tokenizer)]  # Will fail to download
```

**vLLM Documentation States:**
> "We recommend using the tokenizer from base model instead of GGUF model. Because the tokenizer conversion from GGUF is time-consuming and unstable."

**Impact:** GGUF models in offline mode fail to start if tokenizer isn't pre-cached

**Acceptance Criteria:**
- [x] Validate tokenizer source at model creation time ✅ **FIXED 2026-01-08**
- [x] If HF repo ID provided in offline mode, check if tokenizer is in HF cache ✅ **FIXED 2026-01-08**
- [x] Provide clear error if tokenizer will be unavailable ✅ **FIXED 2026-01-08**
- [ ] Add option to copy tokenizer files into model directory (future enhancement)

**Testing:**
```bash
# Test case: Create GGUF model in offline mode with HF tokenizer
1. Set OFFLINE_MODE=True
2. Create model with local GGUF, tokenizer="TinyLlama/TinyLlama-1.1B-Chat-v1.0"
3. Start model
# Expected: Clear error explaining tokenizer unavailable
# Current: Cryptic vLLM error or silent failure
```

---

### 2. ~~Container Startup Verification Too Short~~ ✅ FIXED

**Location:** `routes/models.py:535-602`, `main.py:263-278`, `services/model_testing.py:182-240`

**Status:** ✅ **FIXED 2026-01-08**

**Fix Applied:**
- Added "loading" state for models during initialization
- Implemented progressive startup verification with health polling
- Quick container death detection (first 5 seconds, 0.5s intervals)
- Health endpoint polling (12 seconds with 2s intervals)
- Readiness endpoint auto-updates state to "running" when model becomes ready
- Shutdown handler now stops both "running" and "loading" models
- Added API key to readiness check requests

**Impact:** 
- Large models now correctly show "loading" state during initialization
- No more false "failed" states for slow-loading models
- Readiness endpoint actively checks model health and updates state

**Acceptance Criteria:**
- [x] Implement progressive readiness polling (not just Docker status) ✅ **FIXED 2026-01-08**
- [x] Add `/health` endpoint polling with exponential backoff ✅ **FIXED 2026-01-08**
- [x] Show loading state in UI with auto-refresh ✅ **FIXED 2026-01-09**
- [x] Distinguish "loading" vs "failed" state ✅ **FIXED 2026-01-08**
- [x] Frontend polls readiness to auto-update state ✅ **FIXED 2026-01-09**
- [ ] Timeout configurable per model size (default: 15min for large models) - Future enhancement

**Testing:**
```bash
# Test case: Start 70B model
1. Create 70B model config
2. Start model
3. Check state immediately after start
# Expected: state="loading" or state="starting" with ETA
# Current: May show state="failed" after 2 seconds
```

---

### 3. ~~Multi-GPU NCCL Configuration Gaps~~ ✅ FIXED

**Location:** `docker_manager.py:798-811`, `services/startup_diagnostics.py`

**Status:** ✅ **FIXED 2026-01-08**

**Fix Applied:**
- Added NCCL_TIMEOUT=1800 (30 minute timeout by default)
- Added NCCL_DEBUG=WARN for production logging
- Added NCCL_BLOCKING_WAIT=0 for better responsiveness
- Added NCCL_LAUNCH_MODE=GROUP for deterministic behavior
- Added NCCL timeout and error diagnostic patterns

**Previous Code:**
```python
environment.setdefault("NCCL_P2P_DISABLE", "1")
environment.setdefault("NCCL_IB_DISABLE", "1")
environment.setdefault("NCCL_SHM_DISABLE", "0")
# MISSING: NCCL_TIMEOUT, NCCL_BLOCKING_WAIT, NCCL_DEBUG
```

**Impact:** Multi-GPU models now have timeout protection and better error diagnostics

**Acceptance Criteria:**
- [x] Add NCCL_TIMEOUT=1800 (30 min default, configurable) ✅ **FIXED 2026-01-08**
- [x] Add NCCL_DEBUG=WARN for production ✅ **FIXED 2026-01-08**
- [ ] Expose NCCL configuration in Advanced Settings - Future enhancement
- [ ] Document multi-GPU troubleshooting in UI - Future enhancement

**Testing:**
```bash
# Test case: Tensor parallel with network issue
1. Start model with tp_size=2
2. Simulate network partition between GPUs
# Expected: Timeout after configured period with clear error
# Current: May hang indefinitely
```

---

## 🟠 HIGH Priority Issues

### 4. Missing vLLM Engine Arguments

**Location:** `docker_manager.py:187-363`, `schemas/models.py`, frontend forms

**Issue:**  
Several important vLLM arguments are not exposed to users, limiting optimization and debugging capabilities.

**Missing Arguments:**

| Argument | Purpose | Priority |
|----------|---------|----------|
| `--speculative-config` | 2-3x speedup with draft models | High |
| `--attention-backend` | Force specific attention impl | High |
| `--disable-log-requests` | Reduce log spam in production | Medium |
| `--disable-log-stats` | Faster startup | Medium |
| `--kv-cache-memory` | Direct KV cache size control | High |
| `--distributed-executor-backend` | ray/mp/uni selection | Medium |
| `--max-logprobs` | Control logprobs return | Low |
| `--guided-decoding-backend` | JSON schema support | Medium |

**Acceptance Criteria:**
- [ ] Add --attention-backend to Advanced Settings (flash_attn, flashinfer, etc.)
- [ ] Add --disable-log-requests checkbox for production
- [ ] Add --kv-cache-memory option (bytes) as alternative to gpu_memory_utilization
- [ ] Add speculative decoding configuration section:
  - [ ] Method selection (ngram, eagle, draft model)
  - [ ] num_speculative_tokens
  - [ ] speculative model path/ID

**Testing:**
```python
# Test speculative decoding config
1. Create model with speculative_config={"method": "ngram", "num_speculative_tokens": 5}
2. Verify container starts with correct args
3. Verify inference works and shows speedup
```

---

### 5. Entrypoint Hardcoding May Break with Newer vLLM

**Location:** `docker_manager.py:858`

**Issue:**  
Container entrypoint is hardcoded to specific Python module path. vLLM v0.13+ uses `vllm serve` CLI which may have different entrypoints.

**Current Code:**
```python
container: Container = cli.containers.run(
    image=image,
    name=name,
    entrypoint=["python3", "-m", "vllm.entrypoints.openai.api_server"],
    command=preview_cmd,
    # ...
)
```

**vLLM Documentation:**
> "vLLM V1 represents a substantial re-architecture... Users can expect significant performance improvements after upgrading to the V1 core engine."

**Risk:** When users upgrade to vLLM 0.13+ images, entrypoint may break

**Acceptance Criteria:**
- [ ] Detect vLLM version from image labels/tags
- [ ] Use appropriate entrypoint based on version:
  - v0.6.x: `python3 -m vllm.entrypoints.openai.api_server`
  - v0.7+: `vllm serve` or same module
  - v0.13+: May change again
- [ ] Add config option to override entrypoint
- [ ] Document version compatibility matrix

**Testing:**
```bash
# Test with multiple vLLM versions
1. Set VLLM_IMAGE to v0.6.3 - verify startup
2. Set VLLM_IMAGE to v0.7.0 - verify startup
3. Set VLLM_IMAGE to latest - verify startup
```

---

### 6. ~~Frontend Field Name Mismatches~~ ✅ FIXED

**Location:** `VLLMConfiguration.tsx`

**Status:** ✅ **FIXED 2026-01-08**

**Fix Applied:**
Fixed all camelCase field names in VLLMConfiguration.tsx to use snake_case:
- `enablePrefixCaching` → `enable_prefix_caching`
- `prefixCachingHashAlgo` → `prefix_caching_hash_algo`
- `enableChunkedPrefill` → `enable_chunked_prefill`
- `maxNumSeqs` → `max_num_seqs`
- `cudaGraphSizes` → `cuda_graph_sizes`
- `pipelineParallelSize` → `pipeline_parallel_size`

**Impact:** Configuration settings now properly save and apply to containers

**Acceptance Criteria:**
- [x] Audit all frontend form field names against backend schema ✅ **FIXED 2026-01-08**
- [x] Fix all camelCase → snake_case mismatches ✅ **FIXED 2026-01-08**
- [ ] Add end-to-end test for all config fields - Future enhancement
- [ ] Add TypeScript types generated from Pydantic schemas - Future enhancement

**Testing:**
```typescript
// Test each field roundtrip
1. Create model with enable_prefix_caching=true in UI
2. Fetch model from API
3. Verify enable_prefix_caching=true in response
4. Verify container starts with --enable-prefix-caching
```

---

### 7. V1 Engine Breaking Changes Not Handled

**Location:** `routes/openai.py` (request defaults), `schemas/models.py`

**Issue:**  
vLLM V1 removes several features that may be configured in Cortex request defaults or model configs. Using these on V1 will cause errors.

**Removed in V1:**
- `best_of` sampling parameter - commonly used for quality
- Per-request logits processors
- GPU ↔ CPU KV cache swapping (`swap_space` effectively ignored)
- Request-level structured output backend selection

**vLLM Documentation:**
> "As part of a significant architectural overhaul in vLLM V1, several older features have been removed to streamline the system."

**Impact:** Models may fail on V1 images if using removed features

**Acceptance Criteria:**
- [ ] Audit request defaults for `best_of` usage
- [ ] Warn users if `best_of > 1` configured with V1 image
- [ ] Remove/disable removed options from UI when V1 detected
- [ ] Update model form to hide V1-incompatible options

**Testing:**
```bash
# Test V1 compatibility
1. Configure model with best_of=3 in request defaults
2. Start with vLLM V1 image
# Expected: Clear warning that best_of not supported
# Current: Cryptic error from vLLM
```

---

### 8. ~~Health Check Implementation Gaps~~ ✅ FIXED

**Location:** `docker_manager.py:827-846`

**Status:** ✅ **FIXED 2026-01-08**

**Fix Applied:**
- Now uses curl with Python fallback for better compatibility
- Increased StartPeriod from 30s to 60s for larger models
- Added comments documenting vLLM health endpoint behavior (200 vs 503)
- Combined with Gap #2 readiness endpoint for full lifecycle tracking

**New Code:**
```python
healthcheck = {
    "Test": [
        "CMD-SHELL",
        "(curl -sf http://localhost:8000/health -o /dev/null 2>/dev/null && exit 0) || "
        "(python3 -c ... && exit 0) || exit 1",
    ],
    "StartPeriod": 60_000_000_000,  # 60s for larger models
}
```

**Acceptance Criteria:**
- [x] Use curl if available (more portable) ✅ **FIXED 2026-01-08**
- [x] Check for 503 (EngineDeadError) specifically ✅ **Handled via readiness endpoint**
- [ ] Implement separate liveness and readiness probes - Future enhancement (K8s specific)
- [x] Poll /v1/models to verify model actually loaded ✅ **Via readiness endpoint**

**Testing:**
```bash
# Test health check accuracy
1. Start model, immediately check health → should be "not ready"
2. After model loads, check health → should be "healthy"
3. Kill vLLM process inside container → should be "unhealthy" (503)
```

---

## 🟡 MEDIUM Priority Issues

### 9. No V1/V2 Engine Selection

**Location:** Not implemented

**Issue:**  
vLLM V1 provides significant performance improvements but requires explicit enablement via environment variable. Users have no way to select V1 vs V2 engine.

**vLLM Documentation:**
```python
# Enable V2 model runner
"VLLM_USE_V2_MODEL_RUNNER": lambda: bool(
    int(os.getenv("VLLM_USE_V2_MODEL_RUNNER", "0"))
)
```

**Acceptance Criteria:**
- [ ] Add "Engine Version" dropdown (V1, V2, auto-detect)
- [ ] Pass VLLM_USE_V1 or VLLM_USE_V2_MODEL_RUNNER accordingly
- [ ] Document V1 vs V2 trade-offs in UI tooltip

---

### 10. ~~Startup Diagnostics Missing Some Patterns~~ ✅ FIXED

**Location:** `services/startup_diagnostics.py`

**Status:** ✅ **FIXED 2026-01-08**

**Fix Applied:**
- Added LocalEntryNotFoundError pattern for offline tokenizer issues
- Added HF_HUB_OFFLINE assertion pattern
- Added NCCL timeout pattern with detailed fixes
- Added NCCL communication error pattern
- Added memory profiling error pattern
- GPU driver version patterns already existed

**Acceptance Criteria:**
- [x] Add offline tokenizer error pattern ✅ **FIXED 2026-01-08**
- [x] Add NCCL timeout/error patterns ✅ **FIXED 2026-01-08**
- [x] Add memory profiling error pattern ✅ **FIXED 2026-01-08**
- [x] Add GPU driver version mismatch pattern ✅ **Already existed**

---

### 11. Missing Logging Configuration

**Location:** `docker_manager.py` environment setup

**Issue:**  
No way to enable vLLM debug logging for troubleshooting.

**vLLM Environment Variables:**
```bash
VLLM_LOGGING_LEVEL=DEBUG    # Enable debug logs
VLLM_LOG_STATS_INTERVAL=1.  # Stats every second
VLLM_TRACE_FUNCTION=1       # Trace all function calls (perf impact)
CUDA_LAUNCH_BLOCKING=1      # Sync CUDA for debugging
```

**Acceptance Criteria:**
- [ ] Add "Debug Logging" toggle in Advanced Settings
- [ ] When enabled, set VLLM_LOGGING_LEVEL=DEBUG
- [ ] Add "Trace Mode" option (VLLM_TRACE_FUNCTION=1) with warning about perf
- [ ] Show log stats interval option

---

### 12. VRAM Estimation Not Shown Pre-Start

**Location:** `services/config_validator.py`, frontend

**Issue:**  
VRAM estimation exists in dry-run but isn't prominently shown before starting a model.

**Acceptance Criteria:**
- [ ] Show VRAM estimate in model card/summary
- [ ] Show warning badge if estimated VRAM > available
- [ ] Add "Check Configuration" button that shows dry-run results
- [ ] Show breakdown: weights + KV cache + overhead

---

### 13. No Request Timeout Configuration at Engine Level

**Location:** Not implemented

**Issue:**  
vLLM has server-side timeout options but they're not exposed.

**Missing Arguments:**
- `--request-timeout` - Max time for a single request
- `--max-log-len` - Truncate logged prompts

**Acceptance Criteria:**
- [ ] Add request_timeout_sec to model config
- [ ] Pass as --request-timeout to vLLM
- [ ] Add max_log_len option

---

## 🔵 LOW Priority Issues

### 14. Quantization Method Validation

**Location:** `VLLMConfiguration.tsx:153-165`

**Issue:**  
Quantization dropdown allows any selection but not all quant methods work with all models.

**Acceptance Criteria:**
- [ ] Validate quantization against model type
- [ ] Show warning if model weights don't match quant method
- [ ] Link to docs explaining each quant method

---

### 15. GPU Selection Persistence Issue

**Location:** `docker_manager.py:629-654`

**Issue:**  
GPU selection JSON parsing has multiple fallbacks, suggesting edge cases with persistence.

```python
# Handle both string and list types
if isinstance(selected_gpus, str):
    gpu_indices = json.loads(selected_gpus)
    # If the result is still a string, parse it again
    if isinstance(gpu_indices, str):
        gpu_indices = json.loads(gpu_indices)
```

**Acceptance Criteria:**
- [ ] Normalize selected_gpus to consistent format at save time
- [ ] Remove double-parse workaround
- [ ] Add validation test for GPU selection roundtrip

---

### 16. Missing Prometheus Metrics Endpoint Option

**Location:** Not implemented

**Issue:**  
vLLM can expose Prometheus metrics but this isn't configured.

**Acceptance Criteria:**
- [ ] Add --enable-prometheus option
- [ ] Configure metrics scraping from vLLM container
- [ ] Show vLLM-specific metrics in System Monitor

---

## Testing Matrix

| Test ID | Category | Test Case | Automated |
|---------|----------|-----------|-----------|
| T1 | Offline | GGUF with HF tokenizer in offline mode | ❌ Manual |
| T2 | Startup | 70B model startup timing | ❌ Manual |
| T3 | Multi-GPU | TP=4 with NCCL timeout | ❌ Manual |
| T4 | Config | All field names roundtrip | ⚠️ Need to add |
| T5 | Health | Health check states | ⚠️ Need to add |
| T6 | Version | Multiple vLLM image versions | ❌ Manual |
| T7 | Speculative | ngram speculative decoding | ❌ Manual |
| T8 | Diagnostics | All error patterns matched | ⚠️ Need to add |

---

## Implementation Roadmap

### Phase 1: Critical Fixes (Week 1-2)
1. Fix GGUF tokenizer in offline mode
2. Improve container startup verification
3. Add NCCL timeout configuration

### Phase 2: High Priority (Week 3-4)
4. Add missing engine arguments
5. Fix frontend field name mismatches
6. Version-aware entrypoint selection
7. Handle V1 engine breaking changes
8. Improve health check implementation

### Phase 3: Medium Priority (Week 5-6)
9. V1/V2 engine selection UI
10. Enhanced startup diagnostics
11. Debug logging configuration
12. Pre-start VRAM estimation UI
13. Request timeout configuration

### Phase 4: Low Priority & Polish (Week 7+)
14. Quantization validation
15. GPU selection normalization
16. Prometheus metrics integration

---

## Appendix: vLLM Configuration Reference

### Complete Engine Arguments (vLLM 0.6+)

```bash
vllm serve <model> \
  # Core
  --host 0.0.0.0 \
  --port 8000 \
  --model <path_or_repo_id> \
  --served-model-name <name> \
  --tokenizer <tokenizer_repo> \
  --hf-config-path <path> \
  
  # Memory
  --gpu-memory-utilization 0.9 \
  --max-model-len 8192 \
  --kv-cache-dtype auto \
  --kv-cache-memory <bytes> \  # New: direct control
  --block-size 16 \
  --swap-space 4 \
  
  # Parallelism
  --tensor-parallel-size 1 \
  --pipeline-parallel-size 1 \
  --distributed-executor-backend mp \
  
  # Batching
  --max-num-batched-tokens 2048 \
  --max-num-seqs 256 \
  --enable-chunked-prefill \
  
  # Caching
  --enable-prefix-caching \
  --prefix-caching-hash-algo builtin \
  
  # Performance
  --dtype auto \
  --quantization awq \
  --enforce-eager \
  --attention-backend flash_attn \
  
  # Speculative Decoding
  --speculative-config '{"method": "ngram", "num_speculative_tokens": 5}' \
  
  # Logging
  --disable-log-requests \
  --disable-log-stats \
  
  # Security
  --api-key <key> \
  --trust-remote-code
```

### Environment Variables

```bash
# vLLM Core
VLLM_USE_V1=1                      # Enable V1 engine
VLLM_LOGGING_LEVEL=INFO            # DEBUG for troubleshooting
VLLM_TRACE_FUNCTION=0              # 1 for deep tracing (perf impact)

# NCCL (Multi-GPU)
NCCL_P2P_DISABLE=1                 # Disable peer-to-peer (PCIe)
NCCL_IB_DISABLE=1                  # Disable InfiniBand
NCCL_SHM_DISABLE=0                 # Allow shared memory
NCCL_DEBUG=INFO                    # TRACE for deep debugging
NCCL_TIMEOUT=1800                  # 30 min timeout (seconds)

# PyTorch
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
CUDA_LAUNCH_BLOCKING=0             # 1 for sync debugging

# HuggingFace
HF_HUB_OFFLINE=1                   # Offline mode
HUGGING_FACE_HUB_TOKEN=<token>     # For gated models
HF_HUB_ENABLE_HF_TRANSFER=1        # Faster downloads
```

---

## Additional Research Findings (Context7)

### vLLM V1 Removed Features

**⚠️ Important:** These features were removed in vLLM V1 and will cause errors if used:

| Removed Feature | Impact | Alternative |
|-----------------|--------|-------------|
| `best_of` sampling | No longer supported | Use `n` parameter for multiple outputs |
| Per-Request Logits Processors | Removed | Use server-side configuration |
| GPU ↔ CPU KV Cache Swapping | Removed | Increase GPU memory or reduce context |
| Request-level Structured Output Backend | Removed | Use global structured output config |

**Action Required:** Audit any use of `best_of` in request defaults - will fail on V1

---

### Production Deployment Patterns

From vLLM docs - patterns we could support:

#### Data Parallelism (External Load Balancing)
```bash
# Rank 0
CUDA_VISIBLE_DEVICES=0 vllm serve $MODEL --data-parallel-size 2 --data-parallel-rank 0 --port 8000

# Rank 1  
CUDA_VISIBLE_DEVICES=1 vllm serve $MODEL --data-parallel-size 2 --data-parallel-rank 1 --port 8001
```

**Gap:** Cortex doesn't support data parallelism configuration - could enable horizontal scaling

#### Multi-Node Deployment
```bash
# Rank 0 (head node)
vllm serve $MODEL --data-parallel-size 2 --data-parallel-rank 0 \
    --data-parallel-address 10.99.48.128 --data-parallel-rpc-port 13345

# Rank 1 (worker node)
vllm serve $MODEL --data-parallel-size 2 --data-parallel-rank 1 \
    --data-parallel-address 10.99.48.128 --data-parallel-rpc-port 13345
```

**Gap:** No multi-node support currently

---

### Structured Outputs & Tool Calling

vLLM supports these structured output modes:

| Mode | Usage | Cortex Support |
|------|-------|----------------|
| JSON Schema | `response_format={"type": "json_schema", "json_schema": {...}}` | ✅ Passed through |
| JSON Object | `response_format={"type": "json_object"}` | ✅ Passed through |
| Regex | Via sampling params | ❌ Not exposed |
| Grammar | EBNF grammar | ❌ Not exposed |
| Choice | Constrained choices | ❌ Not exposed |

**Tool Calling:**
- vLLM supports named function calling via `tools` parameter
- Uses structured outputs to guarantee valid JSON
- Requires `--enable-auto-tool-choice` for auto selection

**Gap:** No UI for enabling tool calling mode at model level

---

### Quantization Method Compatibility Matrix

From vLLM docs:

| Method | GPU Support | CPU Support | Notes |
|--------|-------------|-------------|-------|
| AWQ | ✅ CUDA | ✅ x86 only | 4-bit, best quality |
| GPTQ | ✅ CUDA | ✅ x86 only | 4-bit, fast |
| FP8 | ✅ H100/Ada | ❌ | Native 8-bit |
| INT8 W8A8 | ✅ CUDA | ✅ x86/s390x | 8-bit |
| Marlin | ✅ CUDA | ❌ | Optimized 4-bit kernel |

**Gap:** Cortex doesn't validate quant method against available hardware

---

### Deprecation Policy Awareness

vLLM uses semantic versioning with deprecation warnings:

1. **Deprecated (Still On)** - Warning issued, removal version stated
2. **Deprecated (Off By Default)** - Must opt-in to use
3. **Removed** - Feature gone completely

**Impact:** Need to monitor vLLM changelogs and warn users when deprecated features are configured

---

### Nginx Load Balancing Example

For future horizontal scaling:

```nginx
upstream backend {
    least_conn;
    server vllm0:8000 max_fails=3 fail_timeout=10000s;
    server vllm1:8000 max_fails=3 fail_timeout=10000s;
}
server {
    listen 80;
    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Gap:** Gateway could implement load balancing across multiple model instances

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-08 | Claude | Initial analysis |
| 2026-01-08 | Claude | Added Context7 research: V1 removed features, production patterns, structured outputs, quantization matrix |
| 2026-01-09 | Claude | **FIXED:** #1 GGUF tokenizer offline mode validation |
| 2026-01-09 | Claude | **FIXED:** #2 Progressive startup verification with "loading" state |
| 2026-01-09 | Claude | **FIXED:** #2.1 Frontend "loading" state display with auto-polling |
| 2026-01-09 | Claude | **FIXED:** #3 NCCL timeout/debug configuration |
| 2026-01-09 | Claude | **FIXED:** #6 Frontend field name mismatches (camelCase → snake_case) |
| 2026-01-09 | Claude | **FIXED:** #8 Health check implementation (curl + Python fallback) |
| 2026-01-09 | Claude | **FIXED:** #10 Enhanced startup diagnostics patterns |


