# CORTEX

**Enterprise-grade self-hosted LLM inference gateway and model management platform**

CORTEX is an OpenAI-compatible gateway and admin UI for running vLLM and llama.cpp inference engines on your own infrastructure. It provides secure access control, health‑aware routing, usage metering, and a modern admin interface.

---

## 🚀 Quick Start

```bash
make quick-start
# Access at: http://YOUR_IP:3001/login (admin/admin)
```

That's it! Cortex auto-detects your IP, configures CORS, and creates the admin user.

---

## Key Features

### Inference Gateway
- OpenAI-compatible endpoints: `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`
- Multi-engine support: vLLM (GPU) and llama.cpp (CPU/GPU)
- Health checks, circuit breaking, retries, and smart routing
- Streaming responses with time-to-first-token metrics

### Chat Playground
- Interactive web UI for testing running models
- Real-time streaming with performance metrics (tok/s, TTFT)
- Server-side chat persistence (user-scoped, cross-device)
- Context window tracking and visualization

### Enterprise Security
- Multi-tenant access control with organizations, users, and API keys
- IP allowlisting and rate limiting
- Scoped permissions per model or organization
- Audit logging and usage tracking

### Observability
- Prometheus metrics integration
- Per-model inference metrics (requests, tokens, latency)
- GPU utilization and memory monitoring
- System Monitor dashboard with real-time metrics

### Model Management
- Pre-start VRAM estimation and validation
- Startup diagnostics with actionable error fixes
- Model lifecycle management (start, stop, configure)
- Recipe system for configuration templates

### GGUF Support
- Smart engine guidance with automatic recommendations
- GGUF validation, metadata extraction, multi-part support
- Quantization quality indicators (Q4_K_M, Q8_0, etc.)
- Speculative decoding for llama.cpp

### Deployment & Migration
- **Offline/air-gapped deployment** for restricted networks
- Full system export (Docker images, database, configs)
- Model import with dry-run preview
- Database backup and restore via UI or API
- Job management with progress tracking

---

## Documentation Guide

### For Administrators

| I want to... | Read this |
|--------------|-----------|
| Get started quickly | [Quickstart (Docker)](getting-started/quickstart-docker.md) |
| Understand all commands | [Makefile Guide](operations/makefile-guide.md) |
| Configure my deployment | [Configuration](getting-started/configuration.md) |
| Set up for production | [Admin Setup Guide](getting-started/admin-setup.md) |
| Test models interactively | [Chat Playground](features/chat-playground.md) |
| Backup my data | [Backup & Restore](operations/backup-restore.md) |
| Deploy offline | [Offline Deployment](operations/offline-deployment.md) |

### For Developers

| I want to... | Read this |
|--------------|-----------|
| Understand the architecture | [System Overview](architecture/system.md) |
| Work on the backend | [Backend Architecture](architecture/backend.md) |
| Work on the frontend | [Frontend Architecture](architecture/frontend.md) |
| Contribute code | [How to Contribute](contributing/how-to-contribute.md) |
| Follow coding standards | [Coding Standards](contributing/coding-standards.md) |

### For API Users

| I want to... | Read this |
|--------------|-----------|
| Make API calls | [OpenAI-Compatible API](api/openai-compatible.md) |
| Use admin endpoints | [Admin API](api/admin-api.md) |
| Configure models | [Model Management](models/model-management.md) |

### Model Guides

| Engine/Format | Documentation |
|---------------|---------------|
| vLLM | [vLLM Guide](models/vllm.md) |
| llama.cpp | [llama.cpp Guide](models/llamaCPP.md) |
| GGUF files | [GGUF Format](models/gguf-format.md) |
| Multi-part GGUF | [Multi-Part GGUF](models/gguf-multipart.md) |
| Engine selection | [Engine Comparison](models/engine-comparison.md) |
| Download models | [HuggingFace Download](models/huggingface-model-download.md) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Applications                     │
│            (curl, Python SDK, Web Apps, etc.)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     CORTEX Gateway                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ • OpenAI-compatible API  • Auth & Rate Limiting         ││
│  │ • Health-aware routing   • Usage metering               ││
│  │ • Circuit breaking       • Model registry               ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ vLLM Model 1 │ │ vLLM Model 2 │ │llama.cpp Mod │
    │   (GPU)      │ │   (GPU)      │ │   (CPU/GPU)  │
    └──────────────┘ └──────────────┘ └──────────────┘
```

---

## Essential Commands

```bash
# Startup
make quick-start     # First-time setup
make up              # Start services
make down            # Stop services
make restart         # Restart services

# Information
make ip              # Show access URLs
make status          # Container status
make health          # Service health
make logs            # View logs

# Database
make db-backup       # Backup database
make db-restore      # Restore database

# Offline deployment
make prepare-offline # Package for transfer
make load-offline    # Load on target
make verify-offline  # Verify images
```

Run `make help` for all available commands.

---

## Directory Structure

```
docs/
├── getting-started/     # Setup and configuration guides
├── features/            # Feature documentation (Chat Playground, etc.)
├── api/                 # API reference
├── models/              # Model engine documentation
├── operations/          # Operations and maintenance
├── architecture/        # System design docs
├── security/            # Security documentation
├── contributing/        # Contribution guidelines
└── analysis/            # Implementation analysis
```

---

## License

Copyright © 2024-2026 Aulendur Labs. See `LICENSE.txt` and `NOTICE.txt`.
