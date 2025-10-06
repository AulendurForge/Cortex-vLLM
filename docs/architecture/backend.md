# Backend Architecture

FastAPI application (`backend/src/main.py`) with modular routers, services, and middleware.

## Directory Structure

```
backend/src/
├── routes/          # API endpoint routers
│   ├── openai.py    # OpenAI-compatible endpoints
│   ├── admin.py     # Admin system/usage/registry endpoints
│   ├── models.py    # Model lifecycle management
│   ├── keys.py      # API key management
│   ├── users.py     # User management
│   ├── orgs.py      # Organization management
│   └── authn.py     # Authentication endpoints
├── services/        # Business logic services
│   ├── usage_analytics.py      # Usage queries and aggregation
│   ├── system_monitoring.py    # Host/GPU metrics collection
│   ├── model_testing.py        # Model health and testing
│   ├── registry_persistence.py # Registry state management
│   ├── folder_inspector.py     # Local model discovery
│   └── hf_inspector.py         # HuggingFace model inspection
├── schemas/         # Pydantic request/response models
│   ├── admin.py     # Admin endpoint schemas
│   ├── models.py    # Model management schemas
│   └── openai.py    # OpenAI-compatible schemas
├── utils/           # Shared utilities
│   ├── prometheus_utils.py     # Prometheus query helpers
│   └── gguf_utils.py           # GGUF file analysis
├── middleware/      # Request/response middleware
│   ├── ratelimit.py # Rate limiting and concurrency
│   └── usage.py     # Usage tracking
├── auth.py          # Authentication and authorization
├── config.py        # Settings and configuration
├── docker_manager.py # Container lifecycle management
├── health.py        # Background health polling
├── metrics.py       # Prometheus metrics
├── models.py        # SQLAlchemy ORM models
├── state.py         # In-memory state management
└── main.py          # FastAPI application entry point
```

## Core Modules and Responsibilities

### Routes Layer
- `routes/openai.py`: OpenAI-compatible endpoints; streaming proxy; retries; circuit breaker hooks; token usage estimation
- `routes/admin.py`: System metrics, usage analytics, model registry, upstreams health, bootstrap
- `routes/models.py`: Model CRUD, container lifecycle (start/stop), testing, logs, configuration
- `routes/keys.py`: API key creation, listing, revocation
- `routes/users.py`: User management with role-based access
- `routes/orgs.py`: Organization management
- `routes/authn.py`: Login/logout with session cookies

### Services Layer (Business Logic)
- `services/usage_analytics.py`: Database queries for usage records, aggregation, time-series, latency percentiles
- `services/system_monitoring.py`: Host metrics (CPU, memory, disk, network), GPU metrics, system capabilities detection
- `services/model_testing.py`: Model health checks, readiness probes, chat/embedding testing
- `services/registry_persistence.py`: Model registry persistence to ConfigKV table
- `services/folder_inspector.py`: Local model directory scanning and GGUF detection
- `services/hf_inspector.py`: HuggingFace model metadata fetching

### Schemas Layer (Data Validation)
- `schemas/admin.py`: 15+ Pydantic models for admin endpoints (SystemSummary, UsageItem, HostTrends, etc.)
- `schemas/models.py`: Model management request/response schemas
- `schemas/openai.py`: OpenAI-compatible API schemas

### Utils Layer (Shared Utilities)
- `utils/prometheus_utils.py`: Prometheus query functions (instant, range, matrix queries)
- `utils/gguf_utils.py`: GGUF file detection, quantization analysis, multi-part handling

### Infrastructure
- `auth.py`: API key verification, dev cookie session guards for admin routes
- `middleware/ratelimit.py`: Redis-backed per-identifier RPS + sliding-window checks; concurrent stream caps
- `middleware/usage.py`: Persist per-request usage (prompt/completion tokens, status, latency) to Postgres
- `health.py`: Background poller to collect upstream health, latency, and discover models
- `state.py`: In-memory snapshots (circuit breakers, health, registry, LB indices)
- `models.py`: SQLAlchemy ORM for `api_keys`, `users`, `organizations`, `usage`, `models`, `config_kv`
- `docker_manager.py`: Start/stop vLLM and llama.cpp containers; build command flags from model config
- `metrics.py`: Prometheus counters and histograms for requests, latency, selection, and streaming TTFT
- `config.py`: Settings via environment with sensible defaults; helpers for pools and paths

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

## Code Organization Principles

### Separation of Concerns
The backend follows a **layered architecture** to maintain clean separation:

1. **Routes Layer** (`routes/`): HTTP request handling, parameter validation, response formatting
   - Thin controllers that delegate to services
   - No business logic in routes
   - Focus on HTTP concerns only

2. **Services Layer** (`services/`): Business logic and complex operations
   - Database queries and aggregations
   - External API calls (HuggingFace, Prometheus)
   - Complex calculations and data transformations
   - Reusable across multiple routes

3. **Schemas Layer** (`schemas/`): Data validation and serialization
   - Pydantic models for request/response
   - Input validation rules
   - Type safety and documentation

4. **Utils Layer** (`utils/`): Pure functions and helpers
   - No state, no side effects
   - Reusable across services
   - Easy to test in isolation

### File Size Guidelines
- **Routes**: < 700 lines (thin controllers)
- **Services**: < 300 lines per service (focused, single responsibility)
- **Schemas**: < 200 lines (data models only)
- **Utils**: < 250 lines (pure functions)

### Recent Refactoring (October 2025)
Both `routes/models.py` and `routes/admin.py` were refactored to improve maintainability:

**models.py**: 1,382 → 683 lines (50% reduction)
- Extracted: `schemas/models.py`, `services/model_testing.py`, `services/folder_inspector.py`, `services/hf_inspector.py`, `services/registry_persistence.py`, `utils/gguf_utils.py`

**admin.py**: 1,390 → 680 lines (51% reduction)
- Extracted: `schemas/admin.py`, `services/usage_analytics.py`, `services/system_monitoring.py`, `utils/prometheus_utils.py`

**Benefits**:
- Improved code readability and navigation
- Easier testing (isolated services)
- Better code reuse
- Reduced merge conflicts
- Clearer ownership and responsibilities
