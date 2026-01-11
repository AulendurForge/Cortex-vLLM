# llama.cpp Implementation Gap Analysis

> **Document Purpose**: Comprehensive analysis of gaps in Cortex's llama.cpp integration, with prioritized recommendations and acceptance criteria for testing.
> 
> **Last Updated**: January 2026
> **Research Sources**: Context7 llama.cpp documentation, llama.cpp GitHub, web research on production deployment patterns

---

## Test Environment

### Available Test Models
Located in `/var/cortex/models/`:
| Model | Type | Size | Use Case |
|-------|------|------|----------|
| `alamios_Mistral-Small-3.1-DRAFT-0.5B-GGUF` | GGUF | ~0.5B | GGUF/offline testing, speculative decoding draft |
| `Qwen3-0.6B` | SafeTensors | ~0.6B | Standard vLLM testing |
| `Qwen3-1.7B` | SafeTensors | ~1.7B | vLLM testing |

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
- Flash Attention 2 NOT supported (requires SM 80+, RTX 3060 is SM 86 but laptop variant may have issues)

### Scripts
- **MAKEFILE**: Use our makefile scripts to do things like clearing out the database if schema changes are necessary (`make clean-all`) or rebuilding the application to pick up new code (`make quick-start`)

---

## Executive Summary

After comprehensive research on llama.cpp best practices and cross-referencing with Cortex's current implementation, I've identified **15 gaps** across 4 priority tiers. The gaps range from critical stability issues to nice-to-have UX improvements.

### Current Implementation Strengths ✅
- Solid Docker container management with proper GPU passthrough
- Good coverage of core llama.cpp parameters (ngl, context_size, batch_size, etc.)
- Custom args support via `engine_startup_args_json` (Plane B)
- Request defaults support via `request_defaults_json` (Plane C)
- Speculative decoding configuration
- Multi-part GGUF handling (points to first part, relies on llama.cpp native loading)
- Health check polling on `/health` and `/v1/models`
- Prometheus metrics endpoint support (`--metrics`)

### Key Gap Categories
1. **Missing Server Options** - Critical llama.cpp flags not exposed
2. **Monitoring & Observability** - Insufficient runtime visibility
3. **Error Handling & Validation** - Brittle failure modes
4. **UX & Configuration** - Friction in offline/custom deployments

---

## Priority 1: Critical (Stability & Core Functionality)

### Gap #1: Missing `--metrics` and `--slots` Flags ✅ COMPLETED
**Severity**: High  
**Impact**: Cannot monitor llama.cpp server performance or slot utilization
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Added `LLAMACPP_METRICS_ENABLED` and `LLAMACPP_SLOTS_ENABLED` config settings (default: true)
- Updated `_build_llamacpp_command()` to include `--metrics` and `--slots` flags
- Both endpoints now enabled by default for all llama.cpp containers
- Updated documentation in `docs/models/llamaCPP.md`

**Research Finding** (Context7):
```bash
# Enable monitoring and metrics
llama-server -m model.gguf --port 8080 --metrics --slots
```

The `/metrics` endpoint provides:
- `llamacpp:prompt_tokens_total`
- `llamacpp:tokens_predicted_total`
- `llamacpp:kv_cache_usage_ratio`
- `llamacpp:requests_processing`
- `llamacpp:predicted_tokens_seconds` (throughput)

**Recommendation**:
- [x] Add `--metrics` flag to `_build_llamacpp_command()` by default
- [x] Add `--slots` flag to enable slot status endpoint
- [ ] Add UI toggle for metrics/slots in LlamaCppConfiguration.tsx (deferred - defaults work)
- [ ] Update health poller to scrape `/metrics` for llama.cpp containers (future enhancement)

**Acceptance Criteria**:
- [x] Start a llama.cpp model and verify `GET /metrics` returns Prometheus-format metrics
- [x] Verify `GET /slots` returns JSON array of slot states
- [ ] System Monitor page shows llama.cpp metrics (if integrated) - future enhancement
- [x] Logs show metrics endpoint is enabled on startup

---

### Gap #2: No Container Startup Timeout Configuration ✅ COMPLETED
**Severity**: High  
**Impact**: Large models may timeout during loading; no way to configure
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Added `startup_timeout_sec` field to Model schema and API
- Added `LLAMACPP_STARTUP_TIMEOUT` (default 300s) and `VLLM_STARTUP_TIMEOUT` (default 600s) config settings
- Docker healthcheck `StartPeriod` now uses model's `startup_timeout_sec` or config default
- Polling loop in `start_model()` uses configurable timeout for initial health checks

**Research Finding**:
- Large GGUF models (70B+) can take 5-15 minutes to load
- llama.cpp server may hang during model loading (GitHub issue #15128)

**Recommendation**:
- [x] Add `startup_timeout_sec` field to Model schema
- [x] Make health check `StartPeriod` configurable (default 300s for llama.cpp, 600s for vLLM)
- [x] Extend polling loop to respect user-configured timeout
- [ ] Add UI field in LlamaCppConfiguration for startup timeout (future enhancement)

**Acceptance Criteria**:
- [x] Can configure startup timeout via API (e.g., 180 seconds)
- [x] Docker healthcheck StartPeriod reflects configured timeout
- [x] Model with long load time transitions to "running" after loading completes
- [x] Model that fails to load within timeout transitions to "failed" with clear error
- [ ] Container logs are accessible during loading phase

---

### Gap #3: Missing Verbose Logging Options ✅ COMPLETED
**Severity**: Medium-High  
**Impact**: Difficult to debug issues; logs may be inconsistent
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Added `verbose_logging` field to Model schema
- Added `LLAMACPP_LOG_VERBOSE`, `LLAMACPP_LOG_TIMESTAMPS`, `LLAMACPP_LOG_COLORS` config settings
- Implemented `--log-verbose`, `--log-timestamps`, `--log-colors` flags in `_build_llamacpp_command()`
- Note: `--log-format` is not supported by current llama.cpp version

**Research Finding** (actual llama.cpp flags):
```bash
# llama.cpp supported logging options:
llama-server --log-verbose      # Verbose output (detailed model loading info)
llama-server --log-timestamps   # Add timestamps to log messages
llama-server --log-colors auto  # Colored logging (on/off/auto)
```

**Recommendation**:
- [x] Add `verbose_logging` boolean field to Model schema
- [x] Pass `--log-verbose` flag when configured
- [x] Add `--log-timestamps` for better debugging (enabled by default)
- [x] Add `--log-colors` for terminal viewing

**Acceptance Criteria**:
- [x] Can enable verbose logging via API
- [x] Verbose logging shows detailed model loading information
- [x] Timestamps appear in log messages
- [x] Log diagnosis feature works with verbose logs

---

### Gap #4: Incomplete Error Translation for llama.cpp API ✅ COMPLETED
**Severity**: Medium-High  
**Impact**: Gateway may not properly handle llama.cpp-specific errors
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Added `normalize_llamacpp_error()` function in `routes/openai.py`
- Added `translate_error_response()` wrapper for engine-specific error handling
- Handles specific llama.cpp errors:
  - "Loading model" → `model_loading` with retry_after hint
  - "slot unavailable" → `slot_unavailable` with retry_after hint
  - "context length" → `context_length_exceeded`
- Maps llama.cpp error types to OpenAI-compatible types

**Research Finding**:
llama.cpp returns different error formats than OpenAI API:
```json
// llama.cpp error
{"error": {"code": 503, "message": "Loading model", "type": "unavailable_error"}}

// Translated to OpenAI format
{"error": {"message": "Model is still loading. Please wait and retry.", "type": "service_unavailable", "code": "model_loading", "retry_after": 30}}
```

**Recommendation**:
- [x] Add error response normalization in gateway for llama.cpp responses
- [x] Map llama.cpp error codes to OpenAI-compatible format
- [x] Handle "Loading model" 503 gracefully (with retry_after hint)
- [x] Surface llama.cpp-specific errors clearly in UI

**Acceptance Criteria**:
- [x] API errors from llama.cpp are returned in OpenAI-compatible format
- [x] "Loading model" errors include retry_after hint
- [x] UI shows meaningful error messages, not raw llama.cpp errors
- [x] Gateway translates errors while preserving original message

---

## Priority 2: High (Performance & Reliability)

### Gap #5: No VRAM Estimation for llama.cpp Models ✅ COMPLETED
**Severity**: Medium-High  
**Impact**: Users can't predict if model will fit in VRAM
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Added `estimate_llamacpp_vram_usage()` function in `config_validator.py`
- Gets actual GGUF file size for model weights (more accurate than vLLM estimation)
- Calculates KV cache based on context_size, parallel_slots, and cache_type_k/v
- Extracts metadata from GGUF for layer count and embedding size
- Accounts for partial GPU offload (ngl < total layers)
- Accounts for tensor split across multiple GPUs

**VRAM estimation formula**:
```
Model weights: GGUF file size (already quantized)
KV cache: context × parallel_slots × layers × head_dim × kv_heads × (bytes_k + bytes_v)
Overhead: 15% of (weights + KV cache)
Required: Total × 1.1 (10% safety margin)
```

**Recommendation**:
- [x] Implement GGUF file size detection in dry-run validation
- [x] Calculate KV cache VRAM based on context_size, parallel_slots, cache_type
- [x] Show estimated VRAM in UI before starting model (via dry-run)
- [x] Warn if estimated VRAM exceeds available GPU memory

**Acceptance Criteria**:
- [x] Dry-run shows VRAM estimate for llama.cpp models
- [x] Estimate accounts for KV cache quantization settings
- [x] Warning displayed when estimate exceeds available VRAM
- [x] Estimate includes context_size, parallel_slots, ngl in output

---

### Gap #6: Missing `--no-warmup` and `--check-tensors` Options ✅ COMPLETED
**Severity**: Medium  
**Impact**: Slower startup; no tensor validation
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Added `check_tensors` and `skip_warmup` fields to Model schema
- Added `LLAMACPP_CHECK_TENSORS` (default: true) and `LLAMACPP_SKIP_WARMUP` (default: false) config settings
- Implemented `--check-tensors` and `--no-warmup` flags in `_build_llamacpp_command()`
- Tensor checking is enabled by default to catch corrupted GGUFs

**Research Finding**:
```bash
# Skip warmup for faster startup (useful for development)
llama-server --no-warmup

# Validate tensor integrity on load (catches corrupted GGUFs)
llama-server --check-tensors
```

**Recommendation**:
- [x] Add `skip_warmup` boolean to Model schema
- [x] Add `check_tensors` boolean (default: true for offline models)
- [ ] Expose in Advanced llama.cpp Configuration section (UI - future enhancement)
- [x] Enable tensor checking by default for offline deployments

**Acceptance Criteria**:
- [x] Can skip warmup via API
- [x] Tensor check enabled by default
- [x] Flags visible in dry-run command preview
- [x] Configuration stored in Model database

---

### Gap #7: No Support for `--chat-template` Override ✅ COMPLETED
**Severity**: Medium  
**Impact**: Some models may use wrong chat format
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Added `chat_template`, `chat_template_file`, and `jinja_enabled` fields to Model schema
- Added `LLAMACPP_JINJA_ENABLED` (default: true) config setting
- Implemented `--jinja`, `--chat-template`, and `--chat-template-file` flags
- Template file paths are relative to models directory (mounted at /models)

**Research Finding**:
```bash
# Override chat template with preset
llama-server --chat-template chatml
llama-server --chat-template llama3

# Use custom template file
llama-server --chat-template-file /path/to/template.jinja
```

**Recommendation**:
- [x] Add `chat_template` field (preset name or inline template)
- [x] Add `chat_template_file` field for custom Jinja templates
- [ ] Provide dropdown with common templates in UI (future enhancement)
- [x] Mount custom template files via models directory

**Acceptance Criteria**:
- [x] Can specify chat template preset via API
- [x] Can provide custom template file path
- [x] Flags visible in dry-run command preview
- [x] Jinja engine can be enabled/disabled

---

### Gap #8: No `--defrag-thold` KV Cache Defragmentation ✅ COMPLETED
**Severity**: Medium  
**Impact**: Memory fragmentation over long sessions
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Added `defrag_thold` field to Model schema
- Added `LLAMACPP_DEFRAG_THOLD` config (default: -1, disabled)
- Implemented `--defrag-thold` flag when value >= 0
- Note: This flag is marked as DEPRECATED in llama.cpp but still functional

**Research Finding**:
```bash
# Trigger defragmentation when fragmentation exceeds threshold
llama-server --defrag-thold 0.1  # Defrag when 10% fragmented
```

**Recommendation**:
- [x] Add `defrag_thold` field to Model schema (default: -1 = disabled)
- [ ] Expose in Advanced llama.cpp Configuration (future enhancement)
- [x] Document impact on long-running sessions

**Acceptance Criteria**:
- [x] Can configure defrag threshold via API
- [x] Flag visible in dry-run command preview
- [x] Default behavior is disabled (-1)

---

## Priority 3: Medium (UX & Flexibility)

### Gap #9: Custom Arguments Validation is Weak ✅ COMPLETED
**Severity**: Medium  
**Impact**: Invalid custom args cause silent failures
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Created `VALID_LLAMACPP_FLAGS` allowlist with 100+ valid flags
- Added `find_closest_flag()` fuzzy matching using difflib
- Added `validate_llamacpp_flag()` for per-flag validation
- Enhanced `validate_custom_startup_args()` with engine-specific validation
- Dry-run now shows warnings for typos with suggestions

**Research Finding**:
Common user errors:
- Typos in flag names (`--flash-atten` vs `--flash-attn`)
- Invalid value types (`--ngl "all"` vs `--ngl 999`)
- Conflicting flags

**Recommendation**:
- [x] Create allowlist of valid llama.cpp server flags
- [x] Validate custom args against allowlist with fuzzy matching
- [x] Show warnings for unknown flags (not errors, allow passthrough)
- [ ] Provide autocomplete/suggestions in custom args input (future enhancement)

**Acceptance Criteria**:
- [x] Typo in flag name shows warning with suggestion
- [x] Unknown but valid flags pass through with info message
- [x] Dry-run preview shows final command with custom args
- [x] Warnings include suggested corrections

---

### Gap #10: No LoRA Adapter Support ✅ COMPLETED
**Severity**: Medium  
**Impact**: Cannot use fine-tuned adapters
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Added `lora_adapters_json` field (JSON array of paths or {path, scale} objects)
- Added `lora_init_without_apply` flag for loading without applying
- Implemented `--lora` and `--lora-scaled` flags in command builder
- LoRA adapter paths are relative to models directory (mounted at /models)

**Research Finding**:
```bash
# Load LoRA adapter
llama-server -m base.gguf --lora adapter.gguf
llama-server -m base.gguf --lora-scaled adapter.gguf:0.8
```

**Recommendation**:
- [x] Add `lora_adapters_json` field (JSON array of paths or {path, scale})
- [ ] Add UI for managing multiple LoRA adapters (future enhancement)
- [x] Mount adapter files via models directory
- [x] Support adapter scaling (`--lora-scaled`)

**Acceptance Criteria**:
- [x] Can add one or more LoRA adapters via API
- [x] Can specify scaling factor for each adapter
- [x] Flags visible in dry-run command preview
- [x] Support for `--lora-init-without-apply` for runtime adapter management

---

### Gap #11: Missing Grammar/Constrained Generation Support ✅ COMPLETED
**Severity**: Medium  
**Impact**: Cannot enforce structured output (JSON, etc.)
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Added `grammar_file` field to Model schema
- Implemented `--grammar-file` flag in command builder
- Grammar file paths are relative to models directory (mounted at /models)

**Research Finding**:
```bash
# Use GBNF grammar for constrained generation
llama-server --grammar-file json.gbnf
```

**Recommendation**:
- [x] Add `grammar_file` field to Model schema
- [ ] Provide built-in grammars (json, list, etc.) (future enhancement)
- [x] Allow custom grammar file path
- [ ] Document grammar usage for structured output (future enhancement)

**Acceptance Criteria**:
- [x] Can provide custom grammar file path
- [x] Flag visible in dry-run command preview
- [x] Grammar file path mounted in container

---

### Gap #12: No `--alias` Support for Model Naming ✅ COMPLETED
**Severity**: Low-Medium  
**Impact**: Model name in /v1/models may not match served_model_name
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Implemented `--alias` flag using `served_model_name` value
- Model's `/v1/models` endpoint now returns the configured alias

**Research Finding**:
```bash
# Set model alias for API responses
llama-server -m model.gguf --alias my-custom-name
```

**Recommendation**:
- [x] Pass `--alias` flag with `served_model_name` value
- [x] Ensure /v1/models returns the alias, not filename
- [x] Verify gateway routing matches alias

**Acceptance Criteria**:
- [x] --alias flag uses served_model_name
- [x] Flag visible in dry-run command preview

---

## Priority 4: Low (Nice-to-Have)

### Gap #13: No `--embeddings` Flag for Embedding Models ✅ COMPLETED
**Severity**: Low  
**Impact**: Cannot serve embedding-only models efficiently
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Added `enable_embeddings` boolean field to Model schema
- Implemented `--embeddings` flag in command builder
- Automatically enabled when task is "embed" or explicitly set

**Research Finding**:
```bash
# Enable embeddings endpoint
llama-server -m model.gguf --embeddings
```

**Recommendation**:
- [x] Add `--embeddings` flag when task is "embed"
- [x] Add `enable_embeddings` field for explicit control
- [ ] Update health check to use appropriate endpoint (future enhancement)

**Acceptance Criteria**:
- [x] --embeddings flag added when task is "embed"
- [x] --embeddings flag added when enable_embeddings is true
- [x] Flag visible in dry-run command preview

---

### Gap #14: No `--system-prompt-file` Support ✅ COMPLETED
**Severity**: Low  
**Impact**: Cannot set default system prompt
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Added `system_prompt` text field to Model schema
- System prompt is written to `/var/cortex/models/.cortex_configs/system_prompt_{id}.txt`
- Automatically passed via `--system-prompt-file` flag

**Research Finding**:
```bash
# Set default system prompt
llama-server --system-prompt-file system.txt
```

**Recommendation**:
- [x] Add `system_prompt` text field to Model schema
- [x] Write to config file in models directory
- [x] Pass `--system-prompt-file` flag

**Acceptance Criteria**:
- [x] Can configure system prompt via API
- [x] System prompt file is created on disk
- [x] Flag visible in dry-run preview

---

### Gap #15: No `--cont-batching` Toggle in UI ✅ COMPLETED
**Severity**: Low  
**Impact**: Cannot disable continuous batching if needed
**Status**: ✅ **IMPLEMENTED** (January 2026)

**Implementation Summary**:
- Added `cont_batching` boolean field to Model schema
- Per-model override takes precedence over global `LLAMACPP_CONT_BATCHING` setting
- When `cont_batching=false`, the `--cont-batching` flag is omitted

**Research Finding**:
Continuous batching improves throughput but may increase latency for single requests.

**Recommendation**:
- [x] Add `cont_batching` boolean to Model schema (default: use global setting)
- [x] Per-model override takes precedence over global config
- [ ] Expose in Advanced llama.cpp Configuration (future enhancement)

**Acceptance Criteria**:
- [x] Can disable continuous batching via API
- [x] Model respects per-model setting over global config
- [x] Flag omitted from command when cont_batching=false

---

## Implementation Roadmap

### Phase 1: Critical Fixes (Week 1-2)
1. Gap #1: Add `--metrics` and `--slots` flags
2. Gap #2: Configurable startup timeout
3. Gap #4: Error translation for llama.cpp

### Phase 2: Performance & Reliability (Week 3-4)
4. Gap #3: Log format configuration
5. Gap #5: VRAM estimation for GGUF
6. Gap #6: Warmup and tensor checking options

### Phase 3: UX Improvements (Week 5-6)
7. Gap #7: Chat template override
8. Gap #9: Custom args validation
9. Gap #12: Model alias support

### Phase 4: Advanced Features (Week 7-8)
10. Gap #8: KV cache defragmentation
11. Gap #10: LoRA adapter support
12. Gap #11: Grammar/constrained generation

### Phase 5: Polish (Week 9+)
13. Gap #13: Embedding mode
14. Gap #14: System prompt file
15. Gap #15: Continuous batching toggle

---

## Testing Checklist

### Environment Setup
- [ ] RTX 3060 Laptop GPU available with 6GB VRAM
- [ ] `alamios_Mistral-Small-3.1-DRAFT-0.5B-GGUF` model in `/var/cortex/models/`
- [ ] Docker with nvidia runtime configured
- [ ] Cortex stack running (`make quick-start`)

### Basic Functionality Tests
- [ ] Create llama.cpp model via UI with default settings
- [ ] Start model and verify it reaches "running" state
- [ ] Send chat completion request via API
- [ ] Verify streaming responses work
- [ ] Stop model and verify cleanup

### Configuration Tests
- [ ] Test all KV cache type combinations (f16, q8_0, q4_0)
- [ ] Test context_size / parallel_slots interaction
- [ ] Test ngl=0 (CPU only) mode
- [ ] Test custom startup args via JSON
- [ ] Test custom environment variables

### Error Handling Tests
- [ ] Start model with invalid GGUF path → clear error
- [ ] Start model with insufficient VRAM → clear error
- [ ] Start model with invalid custom args → warning shown
- [ ] API request during loading → appropriate 503 response

### Performance Tests
- [ ] Measure tokens/second with default settings
- [ ] Compare with/without flash attention
- [ ] Compare different batch sizes
- [ ] Verify metrics endpoint data accuracy

---

## Appendix: llama.cpp Server Flag Reference

### Flags Currently Implemented ✅
| Flag | Model Field | Notes |
|------|-------------|-------|
| `-m` | `local_path` | Model file path |
| `--host` | hardcoded | `0.0.0.0` |
| `--port` | hardcoded | `8000` |
| `-c` | `context_size` | Context window |
| `-ngl` | `ngl` | GPU layers |
| `-b` | `batch_size` | Batch size |
| `-ub` | `ubatch_size` | Micro-batch size |
| `-t` | `threads` | CPU threads |
| `--tensor-split` | `tensor_split` | Multi-GPU split |
| `--flash-attn` | `flash_attention` | Flash attention |
| `--mlock` | `mlock` | Memory lock |
| `--numa` | `numa_policy` | NUMA policy |
| `--rope-freq-base` | `rope_freq_base` | RoPE base |
| `--rope-freq-scale` | `rope_freq_scale` | RoPE scale |
| `--model-draft` | `draft_model_path` | Speculative draft |
| `--draft` | `draft_n` | Draft tokens |
| `--draft-p-min` | `draft_p_min` | Draft threshold |
| `--timeout` | config | Server timeout |
| `--parallel` | `parallel_slots` | Parallel slots |
| `--cont-batching` | config | Continuous batching |
| `--cache-type-k` | `cache_type_k` | KV cache K type |
| `--cache-type-v` | `cache_type_v` | KV cache V type |

### Flags Missing (Gaps Identified) ❌
| Flag | Gap # | Priority |
|------|-------|----------|
| `--metrics` | #1 | P1 |
| `--slots` | #1 | P1 |
| `--log-format` | #3 | P1 |
| `--log-verbose` | #3 | P1 |
| `--no-warmup` | #6 | P2 |
| `--check-tensors` | #6 | P2 |
| `--chat-template` | #7 | P2 |
| `--defrag-thold` | #8 | P2 |
| `--lora` | #10 | P3 |
| `--grammar-file` | #11 | P3 |
| `--alias` | #12 | P3 |
| `--embeddings` | #13 | P4 |
| `--system-prompt-file` | #14 | P4 |

---

## References

- [llama.cpp GitHub Repository](https://github.com/ggml-org/llama.cpp)
- [llama.cpp Server Documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [llama.cpp Docker Documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/docker.md)
- [GGUF Format Specification](https://github.com/ggerganov/ggml/blob/master/docs/gguf.md)
- Context7 llama.cpp documentation (queried January 2026)
