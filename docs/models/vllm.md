# vLLM Guide

CORTEX orchestrates vLLM engines either online (remote repo) or offline (local files).

## Modes
- Online: `repo_id` (e.g., `meta-llama/Llama-3-8B-Instruct`), optional shared HF cache
- Offline: `local_path` under models base dir; supports GGUF and safetensors

## Key flags (mapped by `docker_manager.py`)
- `--task embed` for embeddings models
- `--dtype`, `--tensor-parallel-size`, `--gpu-memory-utilization`, `--max-model-len`
- Advanced: `--max-num-batched-tokens`, `--kv-cache-dtype`, `--quantization`, `--block-size`, `--swap-space`, `--cpu-offload-gb`, `--enable-prefix-caching`, `--enable-chunked-prefill`
- GGUF extras: `--tokenizer`, `--hf-config-path`

## GPU requirements
- NVIDIA runtime on host; optional DCGM exporter for metrics

## Admin UI flows
- Create model (online/offline), start/stop/apply changes, view logs, add to registry by served name
