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
- `POST /admin/models` — create new model
- `PATCH /admin/models/{id}` — update configuration
- `POST /admin/models/{id}/start` — start model container
- `POST /admin/models/{id}/stop` — stop model container
- `POST /admin/models/{id}/apply` — apply configuration changes
- `POST /admin/models/{id}/dry-run` — validate config + preview command (also returns VRAM estimation)
- `POST /admin/models/{id}/test` — test model inference
- `GET /admin/models/{id}/readiness` — check model readiness status
- `GET /admin/models/{id}/logs` — recent container logs
- `GET /admin/models/{id}/logs?diagnose=true` — logs with startup diagnostics
- `DELETE /admin/models/{id}` — delete model (database entry only; files preserved)
- Registry: `GET/POST/DELETE /admin/models/registry` — manage model routing registry

### Model States
Models transition through these states: `stopped` → `starting` → `loading` → `running`

Error states: `failed` (check logs for diagnostics)

### Dry-Run Response
The dry-run endpoint returns:
```json
{
  "command": ["vllm", "serve", "--model", "/models/..."],
  "warnings": [
    {"severity": "warning", "category": "vram", "title": "VRAM Warning", "message": "..."}
  ],
  "vram_estimate_gb": 4.5
}
```

## Usage
- `GET /admin/usage` — recent requests (filters, pagination)
- `GET /admin/usage/aggregate` — totals by model
- `GET /admin/usage/series` — time series
- `GET /admin/usage/latency` — p50/p95
- `GET /admin/usage/ttft` — streaming TTFT
- `GET /admin/usage/export` — CSV

## System Monitoring
- `GET /admin/system/summary` — CPU/mem/disk/GPU summary (psutil-based)
- `GET /admin/system/throughput` — tokens/sec, RPS, latency metrics (Prometheus-based)
- `GET /admin/system/gpus` — per-GPU metrics (DCGM or NVML)
- `GET /admin/system/host/summary` — real-time host metrics (Prometheus node-exporter with psutil fallback)
- `GET /admin/system/host/trends` — time-series host metrics (CPU, memory, disk, network)
- `GET /admin/system/capabilities` — environment detection (OS, container, WSL, monitoring providers)
- `GET /admin/models/metrics` — per-model vLLM inference metrics (requests, tokens, latency, cache)

## Upstreams Health
- `GET /admin/upstreams` — health snapshots and model registry
- `POST /admin/upstreams/refresh-health` — trigger on-demand health checks

## Chat Playground API

These endpoints power the Chat Playground UI. They use session cookie authentication (`require_user_session`), not API key authentication.

### Running Models
- `GET /v1/models/running` — list healthy running models for chat selection
- `GET /v1/models/{model_name}/constraints` — get model context limits and defaults

### Chat Sessions
- `GET /v1/chat/sessions` — list user's chat sessions (newest first)
- `POST /v1/chat/sessions` — create a new chat session
- `GET /v1/chat/sessions/{id}` — get session with all messages
- `POST /v1/chat/sessions/{id}/messages` — add message to session
- `DELETE /v1/chat/sessions/{id}` — delete a chat session
- `DELETE /v1/chat/sessions` — clear all user's chat sessions

### Running Model Response

```json
[
  {
    "served_model_name": "Qwen-2-7B-Instruct",
    "task": "generate",
    "engine_type": "vllm",
    "state": "running"
  }
]
```

### Model Constraints Response

```json
{
  "served_model_name": "Qwen-2-7B-Instruct",
  "engine_type": "vllm",
  "task": "generate",
  "context_size": null,
  "max_model_len": 32768,
  "max_tokens_default": 512,
  "request_defaults": null,
  "supports_streaming": true,
  "supports_system_prompt": true
}
```

### Chat Session Response

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "What is Python?",
  "model_name": "Qwen-2-7B-Instruct",
  "engine_type": "vllm",
  "constraints": { "max_model_len": 32768 },
  "messages": [
    {
      "id": 1,
      "role": "user",
      "content": "What is Python?",
      "metrics": null,
      "timestamp": 1704672000000
    },
    {
      "id": 2,
      "role": "assistant",
      "content": "Python is a high-level programming language...",
      "metrics": { "tokens_per_second": 32.5, "ttft_ms": 145 },
      "timestamp": 1704672005000
    }
  ],
  "created_at": 1704672000000,
  "updated_at": 1704672005000
}
```

### Create Session Request

```json
{
  "model_name": "Qwen-2-7B-Instruct",
  "engine_type": "vllm",
  "constraints": { "max_model_len": 32768 }
}
```

### Add Message Request

```json
{
  "role": "user",
  "content": "What is Python?",
  "metrics": { "tokens_per_second": 32.5 }
}
```

## Model Discovery & Inspection
- `GET /admin/models/base-dir` — get current models base directory
- `PUT /admin/models/base-dir` — set models base directory
- `GET /admin/models/local-folders` — list local model directories
- `GET /admin/models/inspect-folder` — inspect folder for GGUF files and metadata
- `GET /admin/models/hf-config` — fetch HuggingFace model configuration

### Inspect Folder Response (Enhanced)

The `/admin/models/inspect-folder` endpoint returns comprehensive analysis:

```json
{
  "has_gguf": true,
  "has_safetensors": true,
  "gguf_groups": [
    {
      "quant_type": "Q8_0",
      "files": ["model-Q8_0.gguf"],
      "total_size_mb": 12800,
      "is_multipart": false,
      "status": "ready",
      "metadata": {
        "architecture": "llama",
        "context_length": 32768,
        "embedding_length": 4096,
        "block_count": 32,
        "attention_head_count": 32,
        "attention_head_count_kv": 8,
        "vocab_size": 128256,
        "file_type": "Q8_0"
      }
    }
  ],
  "safetensor_info": {
    "architecture": "LlamaForCausalLM",
    "model_type": "llama",
    "total_size_mb": 15000,
    "file_count": 4,
    "context_length": 32768,
    "num_layers": 32,
    "hidden_size": 4096,
    "num_attention_heads": 32,
    "vocab_size": 128256
  },
  "engine_recommendation": {
    "recommended_engine": "vllm",
    "recommended_format": "safetensors",
    "reason": "SafeTensors available - vLLM recommended for best performance",
    "has_multipart_gguf": false,
    "has_safetensors": true,
    "has_gguf": true
  },
  "gguf_validation": {
    "total_files": 1,
    "valid_files": 1,
    "invalid_files": 0,
    "errors": []
  }
}
```

### GPU Metrics Response (Enhanced)

The `/admin/system/gpus` endpoint includes Flash Attention compatibility:

```json
[
  {
    "index": 0,
    "name": "NVIDIA GeForce RTX 4090",
    "mem_total_mb": 24576,
    "mem_used_mb": 8192,
    "compute_capability": "8.9",
    "architecture": "Ada Lovelace",
    "flash_attention_supported": true
  }
]
```

| Field | Description |
|-------|-------------|
| `compute_capability` | CUDA compute capability (e.g., "8.9") |
| `architecture` | GPU architecture name (Ampere, Ada, Hopper) |
| `flash_attention_supported` | Whether Flash Attention 2 is supported (SM 80+) |

## Model Fields (llama.cpp Speculative Decoding)

Models with `engine_type: llamacpp` support speculative decoding:

| Field | Type | Description |
|-------|------|-------------|
| `draft_model_path` | string | Path to draft model GGUF inside container |
| `draft_n` | integer | Number of tokens to draft (default: 16) |
| `draft_p_min` | float | Minimum acceptance probability (default: 0.5) |

## Model Fields (vLLM GGUF)

Models with `engine_type: vllm` using GGUF files:

| Field | Type | Description |
|-------|------|-------------|
| `gguf_weight_format` | string | GGUF format type: `auto`, `gguf`, `ggml` |

## Deployment & Migration

Endpoints for exporting/importing Cortex configurations and database.

### Export Operations
- `POST /admin/deployment/export` — Start full deployment export
- `POST /admin/deployment/export-model/{id}` — Export single model
- `POST /admin/deployment/estimate-size` — Estimate export size and check disk space

### Import Operations
- `GET /admin/deployment/model-manifests?output_dir=...` — List available model manifests
- `POST /admin/deployment/import-model` — Import model from manifest (supports `dry_run`)

### Database Operations
- `POST /admin/deployment/check-database-dump` — Check if dump file exists
- `POST /admin/deployment/restore-database` — Restore database from dump

### Job Management
- `GET /admin/deployment/status` — Current job status
- `GET /admin/deployment/jobs` — List job history
- `GET /admin/deployment/jobs/{id}` — Get specific job
- `DELETE /admin/deployment/jobs/{id}` — Cancel running job

### Export Request

```json
{
  "output_dir": "/var/cortex/exports",
  "include_images": true,
  "include_db": true,
  "include_configs": true,
  "include_models_manifest": true,
  "tar_models": false,
  "tar_hf_cache": false,
  "allow_pull_images": true
}
```

### Import Model Request

```json
{
  "output_dir": "/var/cortex/exports",
  "manifest_file": "model-1.json",
  "conflict_strategy": "rename",
  "dry_run": true
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `conflict_strategy` | string | `error` or `rename` (adds "-IMPORTED" suffix) |
| `dry_run` | boolean | Preview import without making changes |

### Database Restore Request

```json
{
  "output_dir": "/var/cortex/exports",
  "backup_first": true,
  "drop_existing": false
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `backup_first` | boolean | `true` | Create safety backup before restore |
| `drop_existing` | boolean | `false` | Drop all tables before restore |

### Job Status Response

```json
{
  "id": "deploy-1234567890",
  "status": "running",
  "job_type": "export",
  "step": "Exporting Docker images",
  "progress": 0.45,
  "started_at": 1736483400.0,
  "estimated_size_bytes": 6452936704,
  "bytes_written": 2903821516,
  "eta_seconds": 120
}
```

### Size Estimation Response

```json
{
  "estimated_bytes": 6452936704,
  "estimated_formatted": "6.0 GB",
  "breakdown": {
    "docker_images": "6.0 GB",
    "database": "10.0 MB"
  },
  "disk_space": {
    "sufficient": true,
    "available_bytes": 868923961344,
    "available_formatted": "809.2 GB",
    "required_formatted": "7.2 GB",
    "safety_margin": 1.2
  }
}
```

Refer to the OpenAPI spec for complete request/response schemas.
