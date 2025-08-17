# System Overview

CORTEX is a secure, OpenAI-compatible gateway that fronts one or more vLLM engines and provides health-aware routing, access control, metering, and administration.

```mermaid
graph TD
  Client[Client / SDK] -->|HTTP: /v1/*| Gateway[FastAPI Gateway]
  subgraph Gateway
    Router[OpenAI Routes] --> Auth[API Key Auth]
    Router --> RL[Rate Limit / Concurrency]
    Router --> Choose[URL Selection]
    Choose --> Upstreams[(vLLM Engines)]
    Gateway --> DB[(Postgres)]
    Gateway --> Redis[(Redis)]
    Gateway --> Prom[Prometheus]
  end
  Health[Health Poller] --> Upstreams
  Health --> Gateway
```

Key concepts:
- OpenAI-compatible API: `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`
- URL selection prefers healthy engines and rotates via round-robin
- Metrics exposed via Prometheus; optional OpenTelemetry traces
- Admin APIs and UI manage users, organizations, keys, models, and usage data

See Backend and Frontend pages for details.
