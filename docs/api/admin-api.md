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
- `POST /admin/models` — create
- `PATCH /admin/models/{id}` — update
- `POST /admin/models/{id}/start|stop|apply|dry-run`
- `GET /admin/models/{id}/logs` — recent logs
- Registry: `GET/POST/DELETE /admin/models/registry`

## Usage
- `GET /admin/usage` — recent requests (filters, pagination)
- `GET /admin/usage/aggregate` — totals by model
- `GET /admin/usage/series` — time series
- `GET /admin/usage/latency` — p50/p95
- `GET /admin/usage/ttft` — streaming TTFT
- `GET /admin/usage/export` — CSV

## System
- `GET /admin/system/summary` — CPU/mem/disk/GPU summary
- `GET /admin/system/throughput` — tokens/sec and RPS
- `GET /admin/system/gpus` — GPU metrics
- `GET /admin/system/host/summary|trends` — node exporter KPIs
- `GET /admin/system/capabilities` — environment detection
- `GET /admin/upstreams` — health snapshots; `POST /admin/upstreams/refresh-health` to probe now

Refer to the OpenAPI spec for request/response schemas.
