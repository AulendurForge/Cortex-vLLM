# Backend (Gateway)

- FastAPI app providing OpenAI-compatible endpoints:
  - POST /v1/chat/completions
  - POST /v1/completions
  - POST /v1/embeddings
- Validates API key, rate-limits (stub), routes to vLLM gen/emb pools.
- Uses httpx async client; internal vLLM API key for backend-to-engine calls.

ENV (see apps/backend/.env.example):
- VLLM_GEN_URLS, VLLM_EMB_URLS (comma-separated pool URLs)
- INTERNAL_VLLM_API_KEY (optional)
- GATEWAY_DEV_ALLOW_ALL_KEYS=true (dev convenience)
- REQUEST_MAX_BODY_BYTES