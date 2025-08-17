# vLLM Setup & Tuning

Generation example:
- vllm serve meta-llama/Llama-3-8B-Instruct \
  --dtype auto \
  --gpu-memory-utilization 0.9 \
  --tensor-parallel-size 1 \
  --max-model-len 8192 \
  --max-num-batched-tokens 8192 \
  --generation-config vllm

Embeddings example:
- vllm serve intfloat/e5-mistral-7b-instruct \
  --task embed \
  --dtype auto \
  --gpu-memory-utilization 0.9 \
  --max-model-len 4096

Flags worth tuning:
- --tensor-parallel-size (TP)
- --gpu-memory-utilization (KV cache and weights pre-allocation)
- --max-model-len (per model SLA)
- --max-num-batched-tokens (>8192 for throughput)
- --enable-prefix-caching (gen)