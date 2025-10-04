### vLLM experiment plan for running openai/gpt-oss-120B (Harmony) on this server

This document captures the host system profile, constraints, known issues from community usage, and a ranked series of experiments to attempt running the 120B model with vLLM. Where a configuration is likely to fail, the expected failure mode is noted so we can iterate quickly.

References used for containerization and running vLLM:
- vLLM Docker deployment docs: https://docs.vllm.ai/en/stable/deployment/docker.html
- Model card: https://huggingface.co/huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated

Note: This repo includes GGUF (Q4_K_M, Q8_0). vLLM now has experimental GGUF support, but it only supports a single-file GGUF artifact. If the GGUF is split across multiple files, merge it into one file first (see below). This path is experimental and may be incompatible with some vLLM features. Reference: https://docs.vllm.ai/en/latest/features/quantization/gguf.html

---

## 1) Host system profile (detected)

- OS: Ubuntu 24.04.2 LTS (noble)
- Kernel: Linux 6.8.0-64-generic
- CPUs: 64 vCPUs (2 x Intel Xeon Gold 6526Y, AVX-512 & AMX present)
- RAM: ~251 GiB (free ~130 GiB at capture time)
- Swap: 8 GiB
- GPUs: 4 x NVIDIA L40S (46,068 MiB VRAM each; compute capability 8.9)
- NVIDIA driver: 570.158.01
- Disk (/): ~3.3 TiB; free ~1.8 TiB
- Python on host: torch not installed (we will rely on the vLLM Docker image)

Implications:
- Aggregate VRAM: ~184 GiB across 4 GPUs. BF16 120B weights are ~240 GiB just for weights, so un-quantized weights will not fit entirely in VRAM. vLLM can spill KV cache to CPU via swap-space, but model weights generally must reside on GPU(s). Therefore, without weight compression/quantization supported by vLLM for this model, a pure-BF16 load is expected to OOM.

---

## 2) Model specifics and risks

- Checkpoint: `huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated` (safetensors shards present locally; GGUF Q4_K_M and Q8_0 directories also present).
- Architecture: The 120B “gpt-oss” family uses a custom implementation often labeled “Harmony” in its config. vLLM supports a fixed set of architectures; custom `trust_remote_code` architectures are typically not supported. If the model requires `trust_remote_code`, vLLM will likely fail to instantiate the model with an unsupported architecture error.
- Quantization: The repo does not provide an AWQ/GPTQ weights-only quantization checkpoint; only GGUF quantizations for llama.cpp are provided. vLLM does not load GGUF directly. This narrows our options for making the 120B fit in 4 x 46 GiB GPUs.

Key risks to watch for:
- Unsupported architecture in vLLM (most likely blocker).
- VRAM shortfall for BF16 weights even with tensor parallelism.
- KV cache memory pressure at higher context lengths (mitigated by `--swap-space`).

---

## 3) Ranked experiment matrix (vLLM first)

All examples assume:
- Model directory (host): `/var/cortex/models/huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated`
- We will use the official `vllm/vllm-openai` Docker image. See vLLM Docker docs: https://docs.vllm.ai/en/stable/deployment/docker.html
- We mount the model directory into the container at `/models/120b` and run the OpenAI-compatible server on port 8000.

Baseline flags explained:
- `--tensor-parallel-size 4`: shard weights/tensors across our 4 GPUs.
- `--gpu-memory-utilization 0.92`: allow vLLM to use ~92% of each GPU VRAM.
- `--swap-space 128`: allow up to ~128 GiB of CPU-side memory for KV cache spillover (does not move weights to CPU; only KV).
- `--max-model-len 8192`: start modest; can adjust.
- `--max-num-seqs 1`: extremely conservative to reduce memory pressure while we confirm a single batch loads.
- `--enforce-eager`: enables eager mode; sometimes helps debugging unsupported ops.

Important: If vLLM rejects the architecture, we expect an immediate failure; proceed to the GGUF track (Section 4).

### Experiment A (most likely to fail fast if unsupported arch)

Command (Docker):
```
docker run --rm --runtime nvidia --gpus all \
  --shm-size=32g --ipc=host \
  -p 8000:8000 \
  -v /var/cortex/models/huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated:/models/120b:ro \
  vllm/vllm-openai:latest \
  --model /models/120b \
  --tensor-parallel-size 4 \
  --gpu-memory-utilization 0.92 \
  --swap-space 128 \
  --max-model-len 8192 \
  --max-num-seqs 1 \
  --enforce-eager
```

Expected outcome: likely “unsupported architecture” or “trust_remote_code is not allowed” error. If it loads, we will then gradually increase concurrency and context.

### Experiment B (dtype fallback)

Same as A, plus explicitly force fp16 if bf16 initialization shows numeric or memory issues:
```
  --dtype float16
```
Expected: still constrained by VRAM for weights; may not make a difference.

### Experiment C (KV cache relief for longer prompts)

If A loads, test longer contexts by increasing `--max-model-len` and monitoring GPU RAM; keep `--swap-space 128` (or raise to 160–192 GiB) to avoid OOM from KV growth.

### Experiment D (if vLLM adds support for Harmony via upstream changes)

Try enabling model-specific flags if upstream release notes mention Harmony/gpt-oss support. Otherwise, expect the same failure as in A.

---

## 4) vLLM GGUF track (single-file GGUF only)

vLLM can serve GGUF models, but only when the model is in a single .gguf file. Support is experimental and under-optimized; test carefully. Doc: https://docs.vllm.ai/en/latest/features/quantization/gguf.html

### 4.1 Merge the model’s multi-part GGUF into a single file

For Q8_0 (preferred per quality requirement), the repo ships shards under `Q8_0-GGUF/`.
Use `llama-gguf-split` (from llama.cpp) to merge into one file, e.g.:
```
llama-gguf-split --merge \
  /var/cortex/models/huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated/Q8_0-GGUF/Q8_0-GGUF-00001-of-00009.gguf \
  /var/cortex/models/huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated/Q8_0-GGUF/gpt-oss-120b.Q8_0.gguf
```
Repeat similarly for Q4_K_M if we need to test lower precision.

Tokenizer selection: pass the tokenizer from the base HF model to avoid conversion. Try `openai/gpt-oss-120b` or `unsloth/gpt-oss-120b-BF16` if the base ID is required.

### 4.2 Serve the single-file GGUF with vLLM (Docker)

```
docker run --rm --runtime nvidia --gpus all \
  --shm-size=32g --ipc=host -p 8000:8000 \
  -v /var/cortex/models/huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated/Q8_0-GGUF:/gguf:ro \
  vllm/vllm-openai:latest \
  --model /gguf/gpt-oss-120b.Q8_0.gguf \
  --tokenizer openai/gpt-oss-120b \
  --tensor-parallel-size 4 \
  --gpu-memory-utilization 0.92 \
  --swap-space 128 \
  --max-model-len 8192 \
  --max-num-seqs 1
```

Notes and risks:
- Single-file GGUF is required; multi-file will not load.
- Feature coverage is limited vs HF checkpoints; performance characteristics differ.
- With Q8_0, estimated weight size ≈ ~120–140 GiB plus overhead. Across 4×46 GiB GPUs this may fit for weights; KV cache growth still requires `--swap-space` for larger contexts.

If GGUF fails or is unstable for this model, proceed to Section 5 (llama.cpp), which is the canonical runtime for GGUF.

---

## 5) Fallback track: GGUF with llama.cpp (CPU+GPU split)

Because the model repo ships GGUF quantizations (Q4_K_M, Q8_0) and because vLLM does not consume GGUF files, llama.cpp is the practical route for CPU+GPU split with these artifacts.

Goals on this host:
- Use Q8_0 GGUF to keep quality high while fitting weights mostly in CPU RAM (~120B params × 1 byte ≈ 120 GiB, plus overheads), and offload a large subset of layers to the 4× L40S GPUs for speed.

Example (single-node, multi-GPU offload sketch):
```
./llama-server \
  -m /var/cortex/models/huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated/Q8_0-GGUF/<merged>.gguf \
  -ngl 60 \
  --tensor-split 0.25,0.25,0.25,0.25 \
  -c 8192 \
  --port 8080
```
Notes:
- `-ngl` sets the number of layers offloaded to GPU (tune based on VRAM usage; with 4 × 46 GiB we can push fairly high).
- `--tensor-split` balances VRAM usage across 4 GPUs.
- For multi-file GGUF, merge/split per the model card instructions.

---

## 5) Observation checklist

- If vLLM fails with “architecture not supported/trust_remote_code”, record exact error and vLLM version.
- When vLLM does load, record GPU memory usage per device and throughput at: batch size 1, 2, and 4; context 4k and 8k.
- For llama.cpp GGUF track, record tokens/s with different `-ngl` and `--tensor-split` settings.

---

## 6) Next steps after a successful configuration

- Wrap the successful command in a systemd unit or compose file for the standalone service.
- Mirror the working flags into Cortex startup once validated.


