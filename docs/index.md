# CORTEX

**Enterprise-grade self-hosted LLM inference gateway and model management platform**

CORTEX is an OpenAI-compatible gateway and admin UI for running vLLM and llama.cpp inference engines on your own infrastructure. It provides secure access control, health‑aware routing, usage metering, and a modern admin interface.

## Key Features

### 🚀 Inference Gateway
- OpenAI-compatible endpoints: `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`
- Multi-engine support: vLLM (GPU) and llama.cpp (CPU/GPU)
- Health checks, circuit breaking, retries, and smart routing
- Streaming responses with time-to-first-token metrics

### 🔐 Enterprise Security
- Multi-tenant access control with organizations, users, and API keys
- IP allowlisting and rate limiting
- Scoped permissions per model or organization
- Audit logging and usage tracking

### 📊 Observability
- Prometheus metrics integration
- Per-model inference metrics (requests, tokens, latency)
- GPU utilization and memory monitoring
- System Monitor dashboard with real-time metrics

### 🔧 Model Management
- Pre-start VRAM estimation and validation
- Startup diagnostics with actionable error fixes
- Model lifecycle management (start, stop, configure)
- Recipe system for configuration templates
- Offline/air-gapped deployment support

### ⚙️ Advanced vLLM Configuration
- Attention backend selection
- V1/V2 engine control
- Quantization (AWQ, GPTQ, FP8, INT8)
- Debug logging and trace modes
- Custom startup arguments and environment variables

## Getting Started

1. Read the **[Quickstart (Docker)](getting-started/quickstart-docker.md)** to run the stack locally
2. Follow the **[Admin Setup Guide](getting-started/admin-setup.md)** to configure your first model
3. Explore the **[Model Management](models/model-management.md)** documentation
4. Call the API via curl or SDKs using your generated API key

## Quick Links

| Category | Documentation |
|----------|---------------|
| **Getting Started** | [Quickstart (Docker)](getting-started/quickstart-docker.md) • [Configuration](getting-started/configuration.md) |
| **API** | [OpenAI-Compatible](api/openai-compatible.md) • [Admin API](api/admin-api.md) |
| **Models** | [vLLM Guide](models/vllm.md) • [llama.cpp Guide](models/llamaCPP.md) • [HuggingFace Download](models/huggingface-model-download.md) |
| **Operations** | [Deployments](operations/deployments.md) • [Offline Deployment](operations/offline-deployment.md) • [Makefile Guide](operations/makefile-guide.md) |
| **Architecture** | [System Overview](architecture/system.md) • [Backend](architecture/backend.md) • [Frontend](architecture/frontend.md) |
| **Security** | [Security Guide](security/security.md) • [Threat Model](security/threat-model.md) |
| **Contributing** | [How to Contribute](contributing/how-to-contribute.md) • [Coding Standards](contributing/coding-standards.md) |

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
    │   (GPU)      │ │   (GPU)      │ │   (CPU)      │
    └──────────────┘ └──────────────┘ └──────────────┘
```

## License and Ownership

Copyright © 2024-2025 Aulendur Labs. Licensed under the terms in `LICENSE.txt`. See `NOTICE.txt` for attributions.
