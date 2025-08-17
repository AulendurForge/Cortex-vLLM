# Deployments

## Dev (recommended)
Run via Docker Compose:
```bash
docker compose -f docker.compose.dev.yaml up --build
```

## Production
Use `docker.compose.prod.yaml` as a starting point and apply:
- External Postgres and Redis with backups
- Reverse proxy with TLS (nginx/traefik)
- Set secure env: `GATEWAY_DEV_ALLOW_ALL_KEYS=false`, strong `INTERNAL_VLLM_API_KEY`, strict `CORS_ALLOW_ORIGINS`
- Persistent volumes for models and HF cache

## Profiles and GPUs
- Enable exporters and GPU scheduling using compose profiles (see the compose file comments)
- Ensure NVIDIA runtime is configured on the host; DCGM exporter for GPU metrics

## Health and readiness
- Gateway `/health` and Prometheus `/api/v1/*` endpoints used by monitoring

## Environment
Document environment variables in Configuration; mount `.env` securely in deployments.
