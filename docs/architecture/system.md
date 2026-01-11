# System Overview

CORTEX is an enterprise-grade, self-hosted LLM inference gateway and model management platform. It provides OpenAI-compatible APIs fronting vLLM and llama.cpp engines with health-aware routing, access control, metering, and administration.

## Architecture Diagram

```mermaid
graph TD
  Client[Client / SDK] -->|HTTP: /v1/*| Gateway[FastAPI Gateway]
  Admin[Admin UI] -->|HTTP: /admin/*| Gateway
  Chat[Chat Playground] -->|HTTP: /v1/chat/*| Gateway
  
  subgraph Gateway
    Router[OpenAI Routes] --> Auth[API Key Auth]
    ChatRouter[Chat Routes] --> SessionAuth[Session Auth]
    Router --> RL[Rate Limit / Concurrency]
    Router --> Choose[URL Selection]
    Choose --> Models
    Gateway --> DB[(Postgres)]
    Gateway --> Redis[(Redis)]
    Gateway --> Prom[Prometheus]
  end
  
  subgraph Models[Model Containers]
    vLLM1[vLLM Model 1]
    vLLM2[vLLM Model 2]
    LLAMA[llama.cpp Model]
  end
  
  Health[Health Poller] --> Models
  DockerMgr[Docker Manager] --> Models
```

## Key Capabilities

### Inference Gateway
- **OpenAI-compatible API**: `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`
- **Multi-engine support**: vLLM (GPU) and llama.cpp (CPU/GPU)
- **Health-aware routing**: Prefers healthy engines, round-robin load balancing
- **Streaming support**: Server-sent events with TTFT metrics

### Chat Playground
- **Interactive testing**: Web UI for testing running models
- **Real-time metrics**: Tokens/second, time-to-first-token, context usage
- **Server-side persistence**: User-scoped chat history stored in database
- **Cross-device access**: Access chat history from any machine

### Model Management
- **Lifecycle management**: Create, configure, start, stop, delete models
- **Pre-start validation**: VRAM estimation, configuration dry-run
- **Startup diagnostics**: Actionable error fixes for common failures
- **Model states**: `stopped` → `starting` → `loading` → `running` (or `failed`)

### Security & Access Control
- **Multi-tenant**: Organizations, users, API keys with scoped permissions
- **Rate limiting**: Per-key limits with Redis backend
- **IP allowlisting**: Restrict API access by IP range

### Observability
- **Prometheus metrics**: Gateway, per-model, and system metrics
- **Usage analytics**: Token counts, latency percentiles, TTFT
- **System monitoring**: CPU, memory, disk, GPU utilization

### Operational Features
- **Offline/air-gapped deployment**: Pre-cached Docker images
- **Recipe system**: Save and share model configurations
- **Configuration validation**: Quantization, GPU selection checks

## Data Flow

```
1. Client Request → Gateway (FastAPI)
2. Auth/Rate Limit Check
3. Model Registry Lookup (by served_name)
4. Route to Container (vllm-model-{id} or llamacpp-model-{id})
5. Response → Client (with usage metrics)
6. Usage record → Database
```

## Technology Stack

| Component | Technology |
|-----------|------------|
| Gateway | FastAPI (Python 3.11+) |
| Frontend | Next.js 14 (React) |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Metrics | Prometheus |
| vLLM Engine | vllm/vllm-openai container |
| llama.cpp Engine | ggml-org/llama.cpp container |

See [Backend Architecture](backend.md) and [Frontend Architecture](frontend.md) for details.
