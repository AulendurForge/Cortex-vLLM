# vLLM Engine Guide

## Overview

vLLM (Very Large Language Model) is Cortex's primary inference engine for serving transformer-based models from Hugging Face. It provides state-of-the-art throughput and memory efficiency through innovative techniques like PagedAttention.

**When to use vLLM:**
- ✅ Hugging Face Transformers models (SafeTensors, PyTorch)
- ✅ Architectures: Llama, Mistral, Qwen, Phi, GPT-NeoX, Falcon, and 100+ others
- ✅ Need maximum throughput and efficiency
- ✅ Multi-GPU tensor parallelism required
- ✅ Standard model architectures with HF support

**When NOT to use vLLM:**
- ❌ Custom/experimental architectures (e.g., Harmony/GPT-OSS)
- ❌ GGUF-only quantized models
- ❌ Models requiring `trust_remote_code` with unsupported architectures
- ❌ CPU-only inference (llama.cpp is better)

---

## Core Technologies

### 1. PagedAttention

vLLM's breakthrough innovation that enables efficient KV cache management:

**Traditional Attention Problem:**
- KV cache allocated contiguously for max sequence length
- Most tokens unused → wasted VRAM
- 60-80% of VRAM wasted on padding

**PagedAttention Solution:**
- KV cache split into fixed-size blocks (typically 16 tokens)
- Blocks allocated on-demand (like OS virtual memory)
- Near-zero waste, 2-4x higher throughput
- Enables longer contexts and larger batch sizes

**Cortex Implementation:**
```python
# Configured via --block-size flag
# Default: 16 tokens per block
# Adjustable via Model Form: 1, 8, 16, 32
```

### 2. Continuous Batching

Processes requests as they arrive, without waiting for batch to fill:

**Benefits:**
- Lower latency (no waiting for batch)
- Higher throughput (always working)
- Better GPU utilization

**Cortex Controls:**
- `max_num_seqs`: Maximum concurrent sequences (default: 256)
- `max_num_batched_tokens`: Total tokens per batch (default: 2048)

### 3. Tensor Parallelism (TP)

Splits model weights/computation across multiple GPUs:

**How it works:**
```
Single GPU:     [Model] → GPU 0 (OOM if model too large)

TP=2:           [Model] 
                ├─ Half → GPU 0
                └─ Half → GPU 1

TP=4:           [Model]
                ├─ Quarter → GPU 0
                ├─ Quarter → GPU 1
                ├─ Quarter → GPU 2
                └─ Quarter → GPU 3
```

**Use Cases:**
- Model too large for single GPU
- Need more KV cache space
- Want faster inference (up to TP=4-8, diminishing returns after)

**Cortex Configuration:**
- Set via `TP Size` slider in Model Form
- Must be ≤ number of available GPUs
- Works with Llama 3.3 70B across 4x L40S GPUs

### 4. Pipeline Parallelism (PP)

Splits model layers across devices/nodes:

**When to use:**
- Extremely large models (70B+, 175B+)
- Model doesn't fit even with TP
- Multi-node deployments

**How it works:**
```
PP=2:
Node 1: Layers 1-40   (GPU 0-3 with TP=4)
Node 2: Layers 41-80  (GPU 4-7 with TP=4)
```

**Cortex Support:**
- Available in Advanced settings
- `pipeline_parallel_size` configurable
- Adds inter-stage latency (use sparingly)

---

## Supported Quantization

### Runtime Quantization (vLLM built-in):

| Method | Size Reduction | Quality | VRAM Savings | Use Case |
|--------|---------------|---------|--------------|----------|
| **FP16/BF16** | Baseline | Best | 0% | Default |
| **FP8** | 2x | Very Good | ~50% | Newer GPUs (H100, L40S) |
| **INT8** | 2x | Good | ~50% | Wider GPU support |
| **AWQ (4-bit)** | 4x | Good | ~75% | Pre-quantized models |
| **GPTQ (4-bit)** | 4x | Good | ~75% | Pre-quantized models |

**Notes:**
- AWQ/GPTQ require pre-quantized model checkpoints
- FP8 requires Ada Lovelace or Hopper architecture
- INT8 works on most NVIDIA GPUs

### KV Cache Quantization:

Separate from weight quantization, reduces KV cache memory:

```python
# Default: Same as model dtype (FP16/BF16)
kv_cache_dtype: "auto"

# FP8 variants (50% KV cache reduction):
kv_cache_dtype: "fp8"          # Generic FP8
kv_cache_dtype: "fp8_e4m3"     # 4-bit exponent, 3-bit mantissa
kv_cache_dtype: "fp8_e5m2"     # 5-bit exponent, 2-bit mantissa
```

**Recommendation**: Use `fp8` for KV cache on L40S GPUs (minimal quality loss)

---

## Cortex vLLM Implementation

### Container Architecture

```
Host Machine
├─ Docker Network: cortex_default
└─ vLLM Container: vllm-model-{id}
   ├─ Image: vllm/vllm-openai:latest
   ├─ Port: 8000 (internal) → Ephemeral host port
   ├─ Network: Service-to-service via container name
   ├─ Volumes:
   │  ├─ /models (RO) → Host models directory
   │  └─ /root/.cache/huggingface → HF cache
   ├─ Environment:
   │  ├─ CUDA_VISIBLE_DEVICES=all
   │  ├─ NCCL_* (multi-GPU config)
   │  └─ HF_HUB_TOKEN (for gated models)
   └─ Resources:
      ├─ GPU: All available (via DeviceRequest)
      ├─ SHM: 2GB
      └─ IPC: host mode
```

### Startup Command Example

For a Llama 3 8B model with TP=2:

```bash
# Container command (built by _build_command()):
--model meta-llama/Meta-Llama-3-8B-Instruct
--host 0.0.0.0
--port 8000
--served-model-name llama-3-8b-instruct
--dtype auto
--tensor-parallel-size 2
--gpu-memory-utilization 0.9
--max-model-len 8192
--max-num-batched-tokens 2048
--kv-cache-dtype auto
--block-size 16
--enforce-eager
--api-key dev-internal-token
```

### Model Sources

**Online Mode** (HuggingFace):
```python
repo_id: "meta-llama/Meta-Llama-3-8B-Instruct"
local_path: None

# vLLM downloads to HF cache:
# /root/.cache/huggingface/hub/models--meta-llama--Meta-Llama-3-8B-Instruct
```

**Offline Mode** (Local Files):
```python
repo_id: None
local_path: "llama-3-8b-instruct"  # Relative to CORTEX_MODELS_DIR

# vLLM reads from:
# /models/llama-3-8b-instruct/
```

**GGUF Support** (Experimental):
```python
local_path: "model-folder/model.Q8_0.gguf"  # Single-file GGUF only
tokenizer: "meta-llama/Meta-Llama-3-8B"      # HF tokenizer repo
hf_config_path: "/models/model-folder"       # Optional config path

# Limitations:
# - Single-file GGUF only (merge multi-part first)
# - Less optimized than HF checkpoints
# - Experimental support, may have issues
```

---

## Performance Tuning

### Memory Optimization

**1. GPU Memory Utilization** (0.05 - 0.98):
```python
gpu_memory_utilization: 0.9  # Default

# Lower (0.7-0.8): More headroom, fewer OOM crashes
# Higher (0.92-0.95): Max KV cache, more sequences
```

**2. KV Cache dtype** (50% memory savings):
```python
kv_cache_dtype: "fp8"  # Halves KV cache VRAM

# Quality impact: Minimal on most models
# Best for: Long contexts, many concurrent requests
```

**3. Block Size** (Memory granularity):
```python
block_size: 16  # Default, balanced

# block_size=8: Less fragmentation, tighter VRAM
# block_size=32: Less overhead, needs more VRAM
```

**4. CPU Offload** (Last resort):
```python
cpu_offload_gb: 4  # Offload 4GB per GPU to CPU RAM

# Pros: Fits larger models
# Cons: Significantly slower, requires fast interconnect
```

**5. Swap Space** (KV cache spillover):
```python
swap_space_gb: 16  # Allow 16GB CPU RAM for KV cache

# Use when: Long contexts, tight VRAM
# Impact: Latency increases, but prevents OOM
```

### Throughput Optimization

**1. Max Sequences** (Concurrency):
```python
max_num_seqs: 256  # Default

# Higher: More concurrent requests, more VRAM
# Lower: Less memory pressure, lower throughput
# Sweet spot: 128-512 depending on model size
```

**2. Max Batched Tokens**:
```python
max_num_batched_tokens: 2048  # Default

# Higher: More throughput, more VRAM, higher latency per batch
# Lower: Less VRAM, lower throughput
# Recommendation: 1024-4096
```

**3. Prefix Caching**:
```python
enable_prefix_caching: True

# Speeds up: Repeated system prompts, RAG contexts
# Overhead: Small memory cost, hash computation
```

**4. Chunked Prefill**:
```python
enable_chunked_prefill: True

# Improves: Long prompt throughput
# By: Processing prefill in chunks
```

**5. CUDA Graphs**:
```python
# Only when enforce_eager=False
cuda_graph_sizes: "2048,4096,8192"

# Pre-captures kernels for common sequence lengths
# Reduces overhead, improves throughput
```

---

## Supported Architectures

vLLM supports 100+ model architectures. Common ones in Cortex deployments:

| Family | Example Models | Notes |
|--------|---------------|-------|
| **Llama** | Llama 2, Llama 3, Llama 3.1, 3.2, 3.3 | Excellent support, all sizes |
| **Mistral** | Mistral 7B, Mixtral 8x7B, 8x22B | Full MoE support |
| **Qwen** | Qwen 1.5, 2, 2.5, QwQ | Vision models supported |
| **Phi** | Phi-2, Phi-3, Phi-3.5 | Small, efficient |
| **DeepSeek** | DeepSeek V2, V3, R1 | MLA attention, MTP |
| **Gemma** | Gemma 2B, 7B, 27B | Google models |

**NOT Supported:**
- ❌ **Harmony architecture** (GPT-OSS 20B/120B) - Use llama.cpp
- ❌ Custom architectures without HF integration
- ❌ Models requiring unreleased HF transformers features

---

## Multi-GPU Configuration

### Topology Considerations

**4x L40S Setup (typical Cortex deployment):**

```python
# For 70B model:
tensor_parallel_size: 4  # Split across all 4 GPUs
gpu_memory_utilization: 0.92
max_model_len: 8192
swap_space_gb: 16

# Memory per GPU:
# Weights: ~18GB (70B / 4 GPUs)
# KV cache: ~8GB (depends on context, sequences)
# Overhead: ~3GB
# Total: ~29GB per GPU (fits in 46GB L40S VRAM)
```

**NCCL Settings** (Multi-GPU Communication):

Cortex automatically configures:
```python
NCCL_P2P_DISABLE=1         # Disable peer-to-peer (safer default)
NCCL_IB_DISABLE=1          # Disable InfiniBand (not present)
NCCL_SHM_DISABLE=0         # Allow shared memory (faster)
PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True  # Reduce fragmentation
```

### Multi-Node Deployment

For models >175B or distributed load:

```python
# Node 1 (Head):
tensor_parallel_size: 4
pipeline_parallel_size: 2
# Total: 8 GPUs used

# Start with Ray cluster:
# ray start --head
# vllm serve --tensor-parallel-size 4 --pipeline-parallel-size 2
```

**Cortex Support:**
- Single-node: ✅ Fully supported
- Multi-node: ⚠️ Requires manual Ray setup (not yet in Cortex UI)

---

## Deployment Modes in Cortex

### Online Mode (HuggingFace Download)

**Use case**: Model on HuggingFace Hub, network available

```
Model Form:
├─ Mode: Online
├─ Repo ID: meta-llama/Llama-3-8B-Instruct
└─ HF Token: (optional, for gated models)

Cortex does:
1. Mounts HF cache volume
2. Sets HF_HUB_TOKEN environment variable
3. vLLM downloads model on first start
4. Cached for subsequent starts
```

**Benefits:**
- Easy setup, just specify repo ID
- Automatic updates when model revised
- Shared cache across models

**Requirements:**
- Network access to Hugging Face
- Sufficient disk space for model downloads
- HF token for gated models (Llama 3, etc.)

**📖 For detailed HuggingFace download instructions, see:**
- `docs/models/huggingface-model-download.md` - Complete guide for downloading HF models

### Offline Mode (Local Files)

**Use case**: Air-gapped, pre-downloaded models

```
Model Form:
├─ Mode: Offline
├─ Local Path: llama-3-8b-instruct
└─ Base Dir: /var/cortex/models

Cortex does:
1. Mounts models directory read-only
2. Sets HF_HUB_OFFLINE=1
3. vLLM loads from /models/llama-3-8b-instruct
```

**Directory Structure:**
```
/var/cortex/models/llama-3-8b-instruct/
├─ model-00001-of-00004.safetensors
├─ model-00002-of-00004.safetensors
├─ model-00003-of-00004.safetensors
├─ model-00004-of-00004.safetensors
├─ config.json
├─ tokenizer.json
├─ tokenizer_config.json
└─ special_tokens_map.json
```

**📖 For detailed offline model preparation instructions, see:**
- `docs/models/huggingface-model-download.md` - Complete guide for downloading and preparing HF models for offline use

---

## Advanced Features

### Prefix Caching

Caches common prompt prefixes across requests:

**Use case**: RAG with repeated system prompts, few-shot examples

**Example:**
```
Request 1: [System: "You are a helpful assistant"] + [User: "Question 1"]
Request 2: [System: "You are a helpful assistant"] + [User: "Question 2"]
                     ↑ This prefix is cached! ↑

# 30-50% faster for requests sharing prefixes
```

**Configuration:**
```python
enable_prefix_caching: True
prefix_caching_hash_algo: "sha256"  # Reproducible cross-language
```

### Speculative Decoding

Draft model generates tokens, main model verifies:

**Benefits**: 2-3x speedup for long outputs

**Status in Cortex**: Planned, not yet implemented in UI

### Embeddings

vLLM supports embedding models:

```python
task: "embed"

# Auto-detects max sequence length from model config
# Uses --task embed flag
# Routes to /v1/embeddings endpoint
```

**Supported models:**
- BERT variants
- Sentence Transformers
- E5, BGE, UAE families
- Custom embedding architectures

---

## Troubleshooting

### Common Issues

**1. OOM (Out of Memory)**

```
Error: "CUDA out of memory"

Solutions:
1. Lower gpu_memory_utilization (0.9 → 0.8)
2. Reduce max_model_len
3. Enable kv_cache_dtype="fp8"
4. Increase tensor_parallel_size
5. Use swap_space_gb or cpu_offload_gb
```

**2. Unsupported Architecture**

```
Error: "Model architecture 'harmony' is not supported"

This is the GPT-OSS issue!

Solutions:
- Use llama.cpp instead (supports any GGUF)
- Wait for vLLM to add architecture support
- Implement custom architecture (advanced)
```

**3. Chat Template Missing**

```
Error: "Chat template not found"

Happens with: Models without chat template in tokenizer_config.json

Cortex handles this:
- Fallback to /v1/completions endpoint
- Converts messages to plain prompt
- Returns normalized chat.completion response
```

**4. Tokenizer Issues**

```
Error: "Tokenizer not found for GGUF"

For GGUF in vLLM:
- Provide tokenizer HF repo: "meta-llama/Llama-3-8B"
- Or hf_config_path to local tokenizer.json
```

---

## Performance Benchmarks (Typical)

### Llama 3 8B on Single L40S:

```
Configuration:
- dtype: bfloat16
- max_model_len: 8192
- gpu_memory_utilization: 0.9

Results:
- Throughput: ~50-70 tokens/sec/request
- Concurrent requests: 30-40 (8K context)
- TTFT (time to first token): 50-100ms
- Latency (128 tokens): ~2-3 seconds
```

### Llama 3 70B on 4x L40S (TP=4):

```
Configuration:
- dtype: bfloat16
- tensor_parallel_size: 4
- max_model_len: 8192
- kv_cache_dtype: fp8

Results:
- Throughput: ~20-30 tokens/sec/request
- Concurrent requests: 10-15 (8K context)
- TTFT: 150-300ms
- Latency (128 tokens): ~5-8 seconds
```

---

## Resource Calculator

Cortex includes a built-in calculator (Models page → Resource Calculator):

**Inputs:**
- Model parameters (7B, 70B, etc.)
- Hidden size, num layers
- Target context length
- Concurrent sequences
- TP size, quantization

**Outputs:**
- Per-GPU memory estimate
- Fits/doesn't fit analysis
- Auto-tuning suggestions
- Downloadable report

**Auto-fit Feature:**
Automatically adjusts settings to fit available VRAM:
1. Enables KV FP8
2. Tries quantization (INT8, then AWQ)
3. Increases TP size
4. Reduces context/sequences
5. Suggests CPU offload/swap if needed

---

## Best Practices

### Development:
- ✅ Start with `enforce_eager=True` (easier debugging)
- ✅ Use small context (4K-8K) initially
- ✅ Monitor logs for warnings
- ✅ Test with single request first

### Production:
- ✅ Disable `enforce_eager` for CUDA graphs
- ✅ Set optimal `max_num_seqs` for workload
- ✅ Enable prefix caching for RAG
- ✅ Use FP8 KV cache on supported GPUs
- ✅ Monitor metrics via Prometheus

### Multi-GPU:
- ✅ Use TP for models that don't fit single GPU
- ✅ Keep TP ≤ 8 (diminishing returns after)
- ✅ Verify NCCL settings for your network
- ✅ Test with synthetic load before production

---

## Integration with Cortex Gateway

### Model Registry

When vLLM container starts:
```python
# Cortex registers model endpoint:
register_model_endpoint(
    served_name="llama-3-8b-instruct",
    url="http://vllm-model-3:8000",
    task="generate"
)

# Gateway routes requests:
POST /v1/chat/completions {"model": "llama-3-8b-instruct"}
→ Proxied to: http://vllm-model-3:8000/v1/chat/completions
```

### Health Monitoring

Cortex polls vLLM health every 15 seconds:
```
GET http://vllm-model-3:8000/health
Response: {"status": "ok"}

# Also discovers models:
GET http://vllm-model-3:8000/v1/models
Response: {"data": [{"id": "llama-3-8b-instruct"}]}
```

### Metrics

vLLM exposes Prometheus metrics on port 8000:
```
# Tokens processed:
vllm:prompt_tokens_total
vllm:generation_tokens_total

# Performance:
vllm:time_to_first_token_seconds
vllm:time_per_output_token_seconds

# Resource usage:
vllm:gpu_cache_usage_perc
vllm:cpu_cache_usage_perc
```

Cortex gateway aggregates and re-exposes these.

---

## Migration from Other Engines

### From Text Generation Inference (TGI):

vLLM is generally faster and more memory-efficient:

```
TGI → vLLM:
- Similar API, minimal code changes
- Better throughput (1.5-3x)
- PagedAttention vs continuous batching
- Easier multi-GPU setup
```

### From llama.cpp:

When to migrate to vLLM:
- ✅ Model has HF checkpoint (not just GGUF)
- ✅ Architecture is supported
- ✅ Need maximum throughput
- ✅ Have sufficient VRAM

When to stay on llama.cpp:
- ✅ GGUF-only model
- ✅ Custom architecture
- ✅ CPU inference priority
- ✅ Simpler deployment

---

## Limitations

### What vLLM Can't Do (Use llama.cpp instead):

1. **Custom Architectures**:
   - Harmony (GPT-OSS 20B/120B)
   - Unreleased experimental models
   - Models with trust_remote_code issues

2. **GGUF-Focused Workflows**:
   - Multi-file GGUF (must merge first)
   - Heavily quantized models (Q4_K_M, Q2_K, etc.)
   - LoRA adapters with GGUF

3. **CPU Inference**:
   - vLLM can run on CPU but very slow
   - llama.cpp much better for CPU workloads

---

## References

- **Official Docs**: https://docs.vllm.ai/
- **GitHub**: https://github.com/vllm-project/vllm
- **Docker Hub**: https://hub.docker.com/r/vllm/vllm-openai
- **Cortex Implementation**: `backend/src/docker_manager.py`
- **Model Form**: `frontend/src/components/models/ModelForm.tsx`

---

**For GPT-OSS 120B and other Harmony architecture models, see**: `llamaCPP.md` (in this directory)  
**For engine comparison and decision matrix, see**: `engine-comparison.md` (in this directory)
