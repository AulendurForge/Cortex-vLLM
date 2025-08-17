# Architecture

## System overview
- Public API Gateway exposes OpenAI-compatible endpoints; authenticates API keys, enforces rate limits/quotas, meters usage, and routes to private vLLM engines.
- Separate vLLM pools for text generation and embeddings.
- Admin UI (later) for org/user/key/model/usage management.
- Postgres for control data; Redis for rate limiting; Prometheus/Grafana for metrics; optional OTel traces.

## Components
- Gateway (FastAPI)
  - AuthN: user API keys (for /v1/*)
  - RBAC and admin APIs added later
  - Routing: choose pool by model/task; retries and circuit breakers
  - Metering: request/usage events persisted (later)
- vLLM Engines
  - Generation pool: `vllm serve <model>`
  - Embeddings pool: `vllm serve <model> --task embed`
- Data stores (later)
  - Postgres: orgs, users, keys, models, quotas, usage, audits
  - Redis: rate limit counters, concurrency locks
- Observability
  - Prometheus scrape gateway and vLLM; Grafana dashboards
  - OTel traces (gateway→engine spans; optional)

## Core tables (later)
- organizations, users, api_keys, models, quotas, usage, audit_logs

## Security
- Engines are private; gateway uses an internal token to call engines.
- Keys hashed; shown once; masked thereafter.
- Request size/timeout limits; per-key IP allowlists (later).

## Scaling
- Gateway and engines scale horizontally.
- Prefer data-parallel replicas for small models; TP for large models.

## K8s path (later)
- Helm charts; GPU node pools; Ingress TLS; Prometheus stack.