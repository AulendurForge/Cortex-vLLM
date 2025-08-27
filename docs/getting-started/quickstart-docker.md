# Quickstart (Docker Compose)

This is the fastest way to run CORTEX locally.

## Prerequisites
- Docker and Docker Compose
- Optional: NVIDIA GPU + drivers for running vLLM with CUDA

## Start the stack

```bash
# From repo root
# Basic (CPU, no exporters):
docker compose -f docker.compose.dev.yaml up --build

# Linux host metrics (node-exporter) and GPU metrics (DCGM exporter):
# Prereqs: NVIDIA driver + NVIDIA Container Toolkit installed.
# Enable profiles once, or pass them per command.
export COMPOSE_PROFILES=linux,gpu
docker compose -f docker.compose.dev.yaml up -d --build
```

Services exposed:
- Gateway (FastAPI): `http://localhost:8084`
- Prometheus: `http://localhost:9090`
- PgAdmin: `http://localhost:5050` (admin@local / admin)

Health check:
```bash
curl http://localhost:8084/health
```

## Bootstrap an admin and login (dev cookie)
```bash
curl -X POST http://localhost:8084/admin/bootstrap-owner \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin","org_name":"Default"}'
```

Login via UI at `http://localhost:3001/login` or via API:
```bash
curl -X POST http://localhost:8084/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' -i
```
(The response sets a `cortex_session` httpOnly cookie for dev.)

If the UI reports a CORS error, ensure the gateway allows your UI origin. In `docker.compose.dev.yaml`, the gateway sets:

```
CORS_ALLOW_ORIGINS: http://localhost:3001,http://127.0.0.1:3001
```
Recreate the gateway after edits:

```bash
docker compose -f docker.compose.dev.yaml up -d --build gateway
```

## Create an API key
```bash
curl -X POST http://localhost:8084/admin/keys \
  -H 'Content-Type: application/json' \
  -d '{"scopes":"chat,completions,embeddings"}'
```
Copy the returned `token` immediately; it is shown once.

## Make an API call
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:8084/v1/chat/completions \
  -d '{"model":"meta-llama/Llama-3-8B-Instruct","messages":[{"role":"user","content":"Hello!"}]}'
```

## GPU monitoring (optional)
- Start exporters with profiles (see above). Verify targets in Prometheus at `http://localhost:9090/targets`.
- Gateway endpoints to inspect from the CLI:
```bash
curl http://localhost:8084/admin/system/gpus
curl http://localhost:8084/admin/system/summary
```

## Smoke test script
You can also run `scripts/smoke.sh` after bringing the stack up.

## Stopping
`Ctrl+C` then `docker compose -f docker.compose.dev.yaml down`.

## Reset to a fresh state (wipe dev databases)
```bash
docker compose -f docker.compose.dev.yaml down -v
docker ps -a --filter "name=vllm-model-" -q | xargs -r docker rm -f
docker compose -f docker.compose.dev.yaml up -d --build
```
