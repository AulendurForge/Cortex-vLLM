from prometheus_client import Counter, Histogram

# Request-level metrics
REQ_COUNT = Counter("gateway_requests_total", "Total requests", ["route", "status"]) 
LATENCY = Histogram("gateway_request_latency_seconds", "Request latency", ["route"]) 

# Upstream interaction metrics
UPSTREAM_LATENCY = Histogram("gateway_upstream_latency_seconds", "Upstream latency by path", ["path"]) 
UPSTREAM_LATENCY_BY_UPSTREAM = Histogram(
    "gateway_upstream_latency_by_upstream_seconds",
    "Upstream latency by path and base_url",
    ["path", "base_url"],
)
STREAM_TTFT_SECONDS = Histogram(
    "gateway_stream_ttft_seconds",
    "Time to first token (first upstream chunk) for streaming routes",
    ["path"],
)
UPSTREAM_SELECTED = Counter(
    "gateway_upstream_selected_total",
    "Count of upstream selections by path and base_url",
    ["path", "base_url"],
)

# Auth decision metrics
KEY_AUTH_ALLOWED = Counter(
    "gateway_key_auth_allowed_total",
    "API key auth accepted",
    ["reason"],
)
KEY_AUTH_BLOCKED = Counter(
    "gateway_key_auth_blocked_total",
    "API key auth blocked",
    ["reason"],
)


