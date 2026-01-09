# Observability

CORTEX exposes Prometheus metrics and optionally OpenTelemetry traces.

## Prometheus metrics
From `backend/src/metrics.py`:
- `gateway_requests_total{route,status}` — request counts
- `gateway_request_latency_seconds{route}` — request latencies (histogram)
- `gateway_upstream_latency_seconds{path}` — upstream call latency
- `gateway_upstream_latency_by_upstream_seconds{path,base_url}` — latency per upstream
- `gateway_stream_ttft_seconds{path}` — time-to-first-token for streaming
- `gateway_upstream_selected_total{path,base_url}` — selection counts
- `gateway_key_auth_allowed_total{reason}` / `gateway_key_auth_blocked_total{reason}` — auth decisions
- `gateway_upstream_health{base_url}` — health poller status (gauge)

vLLM exporters and node/DCGM exporters can be scraped for GPU and host metrics.

## Per-Model vLLM Metrics

The gateway aggregates metrics from running vLLM containers:

**Endpoint:** `GET /admin/models/metrics`

**Available Metrics:**
| Metric | Description |
|--------|-------------|
| `num_requests_running` | Active inference requests |
| `num_requests_waiting` | Queued requests |
| `num_requests_swapped` | Requests swapped to CPU |
| `prompt_tokens_total` | Total input tokens processed |
| `completion_tokens_total` | Total output tokens generated |
| `time_to_first_token_seconds_sum/count` | TTFT latency metrics |
| `gpu_cache_usage_perc` | KV cache memory utilization |

**Frontend Access:**
Admin UI → System Monitor → "🤖 Active Models" accordion section

## Dashboards
- Provide Grafana dashboards for gateway KPIs (latency, errors, selection, TTFT) and system metrics.
- System Monitor page provides real-time views of host, GPU, and model metrics

## Tracing (optional)
- Enable OTel via env; spans propagated through FastAPI and httpx when configured.
