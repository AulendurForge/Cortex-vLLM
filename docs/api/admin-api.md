# Admin API

Admin endpoints require a dev cookie session (or future production auth) and are under `/admin`.

## Keys
- `GET /admin/keys` — list API keys (filters: org_id, user_id, q, sort)
- `POST /admin/keys` — create new key (returns token once)
- `DELETE /admin/keys/{id}` — revoke

Example:
```bash
curl -X POST "$GATEWAY/admin/keys" -H 'Content-Type: application/json' -d '{"scopes":"chat,completions,embeddings"}'
```

## Organizations
- `GET /admin/orgs`, `POST /admin/orgs`, `PATCH /admin/orgs/{id}`, `DELETE /admin/orgs/{id}`
- `GET /admin/orgs/lookup` for select inputs

## Users
- `GET /admin/users`, `POST /admin/users`, `PATCH /admin/users/{id}`, `DELETE /admin/users/{id}`
- `GET /admin/users/lookup`

## Models
- `GET /admin/models` — list stored models
- `POST /admin/models` — create new model
- `PATCH /admin/models/{id}` — update configuration
- `POST /admin/models/{id}/start` — start model container
- `POST /admin/models/{id}/stop` — stop model container
- `POST /admin/models/{id}/apply` — apply configuration changes
- `POST /admin/models/{id}/dry-run` — preview vLLM command
- `POST /admin/models/{id}/test` — test model inference
- `GET /admin/models/{id}/readiness` — check model readiness
- `GET /admin/models/{id}/logs` — recent container logs
- `DELETE /admin/models/{id}` — delete model
- Registry: `GET/POST/DELETE /admin/models/registry` — manage model routing registry

## Usage
- `GET /admin/usage` — recent requests (filters, pagination)
- `GET /admin/usage/aggregate` — totals by model
- `GET /admin/usage/series` — time series
- `GET /admin/usage/latency` — p50/p95
- `GET /admin/usage/ttft` — streaming TTFT
- `GET /admin/usage/export` — CSV

## System Monitoring
- `GET /admin/system/summary` — CPU/mem/disk/GPU summary (psutil-based)
- `GET /admin/system/throughput` — tokens/sec, RPS, latency metrics (Prometheus-based)
- `GET /admin/system/gpus` — per-GPU metrics (DCGM or NVML)
- `GET /admin/system/host/summary` — real-time host metrics (Prometheus node-exporter with psutil fallback)
- `GET /admin/system/host/trends` — time-series host metrics (CPU, memory, disk, network)
- `GET /admin/system/capabilities` — environment detection (OS, container, WSL, monitoring providers)

## Upstreams Health
- `GET /admin/upstreams` — health snapshots and model registry
- `POST /admin/upstreams/refresh-health` — trigger on-demand health checks

## Model Discovery & Inspection
- `GET /admin/models/base-dir` — get current models base directory
- `PUT /admin/models/base-dir` — set models base directory
- `GET /admin/models/local-folders` — list local model directories
- `GET /admin/models/inspect-folder` — inspect folder for GGUF files and metadata
- `GET /admin/models/hf-config` — fetch HuggingFace model configuration

Refer to the OpenAPI spec for request/response schemas.
