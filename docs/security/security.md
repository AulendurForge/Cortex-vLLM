# Security Posture

## Authentication
- API key auth for `/v1/*`; keys are hashed and prefixed; scopes enforced by path.
- Dev cookie session for admin routes (`cortex_session`); replace with production auth in secure deployments.

## Authorization & scopes
- Paths map to scopes: `chat`, `completions`, `embeddings`.

## Transport and origins
- Configure TLS at reverse proxy. Set strict `CORS_ALLOW_ORIGINS` and keep credentials aware.
- Security headers middleware enabled by default.

## Rate limiting and concurrency
- Enable Redis-backed limits to mitigate abuse; concurrency caps protect streaming upstreams.

## Upstream auth
- Use `INTERNAL_VLLM_API_KEY` to authenticate gateway → vLLM.

## Data handling
- Usage records store request metadata and token counts; avoid logging sensitive payloads.

## Hardening
- Disable dev auth bypass in production. Restrict admin endpoints. Keep dependencies pinned and updated.
