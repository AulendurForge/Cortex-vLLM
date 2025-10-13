# Model Management

## Concepts
- Stored model records in DB (name, served name, task, flags)
- Managed containers named `vllm-model-{id}` or `llamacpp-model-{id}`
- Registry maps served name → URL and task for routing
- **Model files are never deleted by Cortex** - only database records are removed

## Lifecycle
- Create → Start → Apply updates (stop/start) → Stop → Archive/Delete (DB only)

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

## Dry run
- `POST /admin/models/{id}/dry-run` returns vLLM or llama.cpp command that would be executed
