FROM vllm/vllm-openai:latest

# Optional: pin vLLM extras if needed in future
# RUN uv pip install --system vllm[audio]==0.9.0

# Default command will be provided at runtime, e.g.:
# docker run --runtime nvidia --gpus all \
#   --shm-size=32g --ipc=host -p 8000:8000 \
#   -v /var/cortex/models/huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated:/models/120b:ro \
#   vllm-standalone:latest \
#   --model /models/120b --tensor-parallel-size 4 --gpu-memory-utilization 0.92 \
#   --swap-space 128 --max-model-len 8192 --max-num-seqs 1 --enforce-eager


