# Scaling & Reliability

## Pools and selection
- Configure generation and embeddings pools via env.
- `choose_url` prefers healthy endpoints (within TTL) and round-robins among pool members.

## Circuit breaker
- Disabled by default. When enabled, opens after N failures and cools down before retry.
- Health poller resets breaker on success.

## Retries and timeouts
- Non-stream requests retry transient httpx errors with small backoff.
- Streamed requests avoid retries by design; concurrency is capped.

## Rate limiting and concurrency
- Enable rate limit with Redis; configure RPS, burst, sliding window.
- Limit concurrent streaming requests per identifier to protect engines.

## Horizontal scaling
- Scale gateway replicas; ensure shared Redis and Postgres.
- Scale vLLM engines; add to pools or managed via model registry.

## Observability
- Track latencies, TTFT, error rates, selection distribution.
- Alert on health TTL expiration and breaker open durations.
