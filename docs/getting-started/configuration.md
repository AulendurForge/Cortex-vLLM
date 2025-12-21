# Configuration

CORTEX is configured primarily via environment variables. Defaults are defined in `backend/src/config.py`.

> Tip: create a `.env` file in `backend/` for local overrides.

## Core settings

| Variable | Default | Description |
|---|---|---|
| `VLLM_GEN_URLS` | `http://localhost:8001` | Comma-separated base URLs for generation pool |
| `VLLM_EMB_URLS` | `http://localhost:8002` | Comma-separated base URLs for embeddings pool |
| `INTERNAL_VLLM_API_KEY` | `` | Token used by gateway to call private vLLM upstreams |
| `GATEWAY_DEV_ALLOW_ALL_KEYS` | `True` | Dev bypass for API key auth (set to `False` in prod) |
| `REQUEST_MAX_BODY_BYTES` | `1048576` | Max request size (bytes); 413 if exceeded |
| `RATE_LIMIT_ENABLED` | `False` | Enable rate limit checks (Redis required) |
| `RATE_LIMIT_RPS` | `10` | Requests per second allowed per identifier |
| `RATE_LIMIT_BURST` | `20` | Additional burst per second |
| `RATE_LIMIT_WINDOW_SEC` | `0` | Sliding window length (0 disables) |
| `RATE_LIMIT_MAX_REQUESTS` | `0` | Max requests within sliding window |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection URL |
| `CONCURRENCY_LIMIT_ENABLED` | `False` | Limit concurrent streams per identifier |
| `MAX_CONCURRENT_STREAMS_PER_ID` | `5` | Max concurrent streaming requests |
| `CB_ENABLED` | `False` | Enable circuit breaker |
| `CB_FAILURE_THRESHOLD` | `5` | Failures before opening breaker |
| `CB_COOLDOWN_SEC` | `30` | Cooldown period after breaker trips |
| `HEALTH_CHECK_TTL_SEC` | `10` | Health snapshot TTL used in routing |
| `HEALTH_CHECK_PATH` | `/health` | Upstream health path |
| `HEALTH_POLL_SEC` | `15` | Background health poll cadence |
| `OTEL_ENABLED` | `False` | Enable OpenTelemetry tracing |
| `OTEL_SERVICE_NAME` | `cortex-gateway` | OTel service.name |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `` | OTLP HTTP endpoint |
| `TOKEN_ESTIMATION_ENABLED` | `True` | Estimate token counts when upstream doesn’t return usage |
| `PROMETHEUS_URL` | `http://prometheus:9090` | Prometheus base URL |
| `CORS_ENABLED` | `True` | Enable CORS middleware |
| `CORS_ALLOW_ORIGINS` | `http://localhost:3001` | Allowed origins (comma-separated or `*`) |
| `SECURITY_HEADERS_ENABLED` | `True` | Add secure headers on responses |
| `DATABASE_URL` | `postgresql+asyncpg://cortex:cortex@postgres:5432/cortex` | Async SQLAlchemy URL |
| `ADMIN_BOOTSTRAP_USERNAME` | `` | Optional owner bootstrap username |
| `ADMIN_BOOTSTRAP_PASSWORD` | `` | Optional owner bootstrap password |
| `ADMIN_BOOTSTRAP_ORG` | `` | Optional org name on bootstrap |
| `CORTEX_MODELS_DIR` | `/var/cortex/models` | Container-visible models directory |
| `HF_CACHE_DIR` | `/var/cortex/hf-cache` | Container-visible Hugging Face cache |
| `CORTEX_MODELS_DIR_HOST` | same as `CORTEX_MODELS_DIR` | Host path for models (Docker bind) |
| `HF_CACHE_DIR_HOST` | same as `HF_CACHE_DIR` | Host path for HF cache (Docker bind) |
| `VLLM_IMAGE` | `vllm/vllm-openai:latest` | Image used for managed model containers (for offline reproducibility, pin to a tested tag and cache it via `make prepare-offline`) |

## Security guidance
- In production, set `GATEWAY_DEV_ALLOW_ALL_KEYS=false` and configure API keys.
- Restrict `CORS_ALLOW_ORIGINS` to the actual frontend origins; avoid `*` with credentials.
- Use strong `INTERNAL_VLLM_API_KEY` when upstreams are network-reachable.

## Compose profiles
- `linux` enables the node-exporter; `gpu` enables the DCGM exporter and requests GPU access for containers that need it.
- Enable per command or via env:
```bash
# one-off
docker compose -f docker.compose.dev.yaml --profile linux --profile gpu up -d

# persistent for the shell
export COMPOSE_PROFILES=linux,gpu
docker compose -f docker.compose.dev.yaml up -d
```

## CORS notes (dev)
- When the UI runs at `http://localhost:3001`, ensure the gateway allows that origin:
```
CORS_ALLOW_ORIGINS=http://localhost:3001,http://127.0.0.1:3001
```
- Preflight check (should return Access-Control-Allow-Origin):
```bash
curl -i -X OPTIONS http://localhost:8084/auth/login \
  -H 'Origin: http://localhost:3001' \
  -H 'Access-Control-Request-Method: POST'
```
