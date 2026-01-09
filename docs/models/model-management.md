# Model Management

## Concepts
- Stored model records in DB (name, served name, task, flags)
- Managed containers named `vllm-model-{id}` or `llamacpp-model-{id}`
- Registry maps served name → URL and task for routing
- **Model files are never deleted by Cortex** - only database records are removed

## Lifecycle
- Create → Start → Apply updates (stop/start) → Stop → Archive/Delete (DB only)

### State Machine

```
┌─────────┐                    ┌──────────┐                    ┌─────────┐
│ stopped │ ─── Start Click ──→│ starting │ ─── Container Up ──→│ loading │
└─────────┘                    └──────────┘                    └─────────┘
     ↑                                                               │
     │                                                               ↓
┌──────────┐                                                   ┌─────────┐
│ stopping │ ←────────────── Stop Click ──────────────────────│ running │
└──────────┘                                                   └─────────┘
     ↓                                │                              │
     │                                ↓                              │
┌─────────┐                      ┌────────┐                          │
│ stopped │                      │ failed │ ←── Error at any stage ──┘
└─────────┘                      └────────┘
```

**States:**
| State | Description |
|-------|-------------|
| `stopped` | No container running, ready to start |
| `starting` | Container creation initiated |
| `loading` | Container running, model loading into GPU memory |
| `running` | Model ready for inference requests |
| `stopping` | Graceful shutdown in progress |
| `failed` | Error occurred, check logs for diagnostics |

**UI Behavior:**
- Polling automatically updates state every few seconds
- Toast notifications appear on state transitions
- "Start" button triggers dry-run validation first

## File Safety Guarantee

**CRITICAL: Cortex never deletes model files from `/var/cortex/models`**

When you delete a model from Cortex:
- ✅ Database record is removed
- ✅ Container is stopped
- ✅ Model is unregistered from routing
- ✅ **Files remain on disk untouched**

This protects manually-placed offline models, which are often:
- Transferred via USB drives in air-gapped environments
- Large files (10-240GB) taking hours to transfer
- Impossible to re-download in classified/restricted networks

**To free disk space:**
Administrators must manually delete files from the filesystem:
```bash
# List models directory
ls -lh /var/cortex/models/

# Manually delete unwanted folders
rm -rf /var/cortex/models/old-model-folder
```

## Base directory helpers
- `GET/PUT /admin/models/base-dir` to set host-visible models directory
- `GET /admin/models/local-folders` and `GET /admin/models/inspect-folder` to assist offline model selection

## Model Preparation
- **📖 HuggingFace Models**: See `docs/models/huggingface-model-download.md` for complete guide on downloading HF models
- **📖 GGUF Models**: See `docs/models/llamaCPP.md` for llama.cpp model preparation
- **📖 vLLM Models**: See `docs/models/vllm.md` for vLLM-specific configuration

## Logs
- `GET /admin/models/{id}/logs` returns recent container logs (for debugging)
- `GET /admin/models/{id}/logs?diagnose=true` returns logs with startup diagnostics

## Dry Run & Pre-Start Validation

The dry-run endpoint validates configuration before starting:

- `POST /admin/models/{id}/dry-run` returns:
  - The vLLM or llama.cpp command that would be executed
  - VRAM estimation and warnings
  - Configuration validation results
  - Quantization compatibility checks

**Frontend Integration:**
When clicking "Start" in the UI, Cortex automatically runs a dry-run first. If warnings are detected (e.g., VRAM concerns, quantization mismatches), the user is prompted to confirm before proceeding.

## Per-Model Metrics

Running models expose metrics via the System Monitor page:
- **Requests running/waiting/swapped** - Current queue status
- **Prompt/generation tokens** - Throughput metrics
- **KV cache utilization** - Memory efficiency
- **GPU cache usage** - VRAM allocation

Access via: Admin UI → System Monitor → Active Models section
API endpoint: `GET /admin/models/metrics`
