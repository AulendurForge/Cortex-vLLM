# Threat Model (initial)

## Assets
- API keys, upstream internal key, usage records, model registry

## Entry points
- Public `/v1/*` endpoints
- Admin `/admin/*` endpoints
- Health poller calling upstreams

## Risks & mitigations
- Credential abuse: enable rate limits/concurrency caps; rotate keys; restrict IPs
- SSRF via registry/health: validate URLs; restrict internal networks; use allowlists in production
- CORS misconfiguration: avoid `*` with credentials; set allowlist
- Leakage via logs: avoid logging request bodies; keep usage minimal
- DoS on upstreams: breaker, TTL health, backpressure via concurrency caps

## Next steps
- Add SSO-backed admin auth; formal URL allowlist for registries; secrets management guidance.
