# Quickstart (Docker Compose)

This is the fastest way to run CORTEX locally.

## Prerequisites
- Docker and Docker Compose
- Optional: NVIDIA GPU + drivers for running vLLM with CUDA

## Start the stack

```bash
# From repo root
docker compose -f docker.compose.dev.yaml up --build
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
  -d '{"username":"owner","password":"change-me","org_name":"Default"}'
```

Login via UI at `http://localhost:3001/login` or via API:
```bash
curl -X POST http://localhost:8084/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"owner","password":"change-me"}' -i
```
(The response sets a `cortex_session` httpOnly cookie for dev.)

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

## Smoke test script
You can also run `scripts/smoke.sh` after bringing the stack up.

## Stopping
`Ctrl+C` then `docker compose -f docker.compose.dev.yaml down`.
