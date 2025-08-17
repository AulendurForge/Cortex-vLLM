# Backend Architecture

FastAPI application (`backend/src/main.py`) with modular routers and middleware.

## Modules and responsibilities
- `routes/openai.py`: OpenAI-compatible endpoints; streaming proxy; retries; circuit breaker hooks; token usage estimation.
- `auth.py`: API key verification, dev cookie session guards for admin routes.
- `middleware/ratelimit.py`: Redis-backed per-identifier RPS + sliding-window checks; concurrent stream caps.
- `middleware/usage.py`: Persist per-request usage (prompt/completion tokens, status, latency) to Postgres.
- `health.py`: Background poller to collect upstream health, latency, and discover models.
- `state.py`: In-memory snapshots (circuit breakers, health, registry, LB indices).
- `models.py`: SQLAlchemy ORM for `api_keys`, `users`, `organizations`, `usage`, `models`, `config_kv`.
- `docker_manager.py`: Start/stop vLLM containers and build command flags from model config.
- `metrics.py`: Prometheus counters and histograms for requests, latency, selection, and streaming TTFT.
- `config.py`: Settings via environment with sensible defaults; helpers for pools and paths.

## Request lifecycle
1. `x-request-id` assigned if missing.
2. Security headers + size limits applied.
3. For `/v1/*`: API key auth → rate limit/concurrency → choose upstream URL → forward JSON or stream.
4. Usage recorded with token counts (from upstream or estimated).
5. Metrics updated per route and upstream.

## Error shape
Gateway returns `{ error: { code, message }, request_id }` for errors; clients should log the `request_id`.

## Health and routing
- Health snapshots are refreshed in the background and cached.
- `choose_url` prefers healthy endpoints within TTL; otherwise falls back to pool round-robin.
- Circuit breaker opens after configurable consecutive failures and cools down before retry.

## Persistence & migrations
- Dev uses `Base.metadata.create_all()` on startup.
- Production should move to Alembic migrations in `backend/alembic/`.
