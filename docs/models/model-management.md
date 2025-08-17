# Model Management

## Concepts
- Stored model records in DB (name, served name, task, flags)
- Managed containers named `vllm-model-{id}`
- Registry maps served name → URL and task for routing

## Lifecycle
- Create → Start → Apply updates (stop/start) → Stop → Archive/Delete

## Base directory helpers
- `GET/PUT /admin/models/base-dir` to set host-visible models directory
- `GET /admin/models/local-folders` and `GET /admin/models/inspect-folder` to assist offline model selection

## Logs
- `GET /admin/models/{id}/logs` returns recent container logs (for debugging)

## Dry run
- `POST /admin/models/{id}/dry-run` returns vLLM command that would be executed
