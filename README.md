<img src="frontend/src/assets/Aulendur%20LLC%20Dark%20Logo%20with%20Text_NoBackground.png" alt="Aulendur LLC" align="right" width="80" />

<p align="center">
  <img src="frontend/src/assets/cortex%20logo%20and%20text%20black.png" alt="CORTEX" width="360" />
</p>

# CORTEX

OpenAI-compatible gateway and admin UI for running vLLM engines on your own infrastructure. Built and maintained by Aulendur LLC.

- OpenAI-compatible endpoints: `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`
- Health-aware routing, circuit breaking, retries
- Usage metering, admin APIs/UI for users, orgs, keys, models
- Prometheus metrics; optional Redis and OpenTelemetry

## Documentation
Full documentation (guides, architecture, API reference, operations):

- Docs site: https://aulendurforge.github.io/Cortex-vLLM/
  - If not yet live, enable GitHub Pages: Repo → Settings → Pages → "Build and deployment: GitHub Actions". The URL will appear there after the first successful docs workflow run.

## Quickstart (Docker)
```bash
# From repo root
docker compose -f docker.compose.dev.yaml up --build
# Health
curl http://localhost:8084/health
# Bootstrap admin (one-time)
curl -X POST http://localhost:8084/admin/bootstrap-owner \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin","org_name":"Default"}'
# Sign in at the UI (dev cookie session)
# http://localhost:3001/login (admin / admin)
# Create API key
curl -X POST http://localhost:8084/admin/keys -H 'Content-Type: application/json' -d '{"scopes":"chat,completions,embeddings"}'
# Call API (replace YOUR_TOKEN)
curl -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \
  http://localhost:8084/v1/chat/completions \
  -d '{"model":"meta-llama/Llama-3-8B-Instruct","messages":[{"role":"user","content":"Hello!"}]}'
```

### Optional: Host + GPU monitoring
- Install NVIDIA driver and NVIDIA Container Toolkit on the host.
- Start exporters with compose profiles and Prometheus:
```bash
export COMPOSE_PROFILES=linux,gpu
docker compose -f docker.compose.dev.yaml up -d prometheus node-exporter dcgm-exporter
```
- Verify `http://localhost:9090/targets` shows the exporters as UP.
- Gateway system endpoints:
```bash
curl http://localhost:8084/admin/system/summary
curl http://localhost:8084/admin/system/gpus
```

### CORS (dev)
If the UI reports a CORS error when calling the gateway, ensure the gateway is allowing your UI origin. In `docker.compose.dev.yaml` we set:

```
CORS_ALLOW_ORIGINS: http://localhost:3001,http://127.0.0.1:3001
```
Recreate the gateway after edits:
```bash
docker compose -f docker.compose.dev.yaml up -d --build gateway
```

For local dev and advanced deployment, see the Docs → Getting Started.

## Contributing
Please see the docs (Contributing) for local setup, coding standards, and PR guidelines.

## License
Copyright © [{{CURRENT_YEAR}}] Aulendur LLC. See `LICENSE.txt` and `NOTICE.txt`.