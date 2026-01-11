# Security Guide

This document describes Cortex's security posture and best practices for secure deployment.

---

## Authentication

### API Key Authentication
- All `/v1/*` endpoints require API key authentication
- Keys are hashed (SHA-256) before storage
- Keys use prefixes for easy identification (`ctx_`)
- Scopes control access: `chat`, `completions`, `embeddings`

```bash
# API call with authentication
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:8084/v1/chat/completions \
  -d '{"model":"llama","messages":[...]}'
```

### Admin Authentication
- Admin UI uses session cookies (`cortex_session`)
- Development mode: Cookie-based with dev bypass
- Production: Configure external auth or disable dev bypass

```bash
# Disable dev auth bypass in production
GATEWAY_DEV_ALLOW_ALL_KEYS=false
```

---

## Authorization & Scopes

### Path-to-Scope Mapping
| Endpoint | Required Scope |
|----------|----------------|
| `/v1/chat/completions` | `chat` |
| `/v1/completions` | `completions` |
| `/v1/embeddings` | `embeddings` |
| `/admin/*` | Admin session |

### API Key Scopes
```json
{
  "scopes": "chat,completions,embeddings"
}
```

Keys can be restricted to specific scopes for principle of least privilege.

---

## Transport Security

### TLS Configuration
Cortex itself doesn't handle TLS. Deploy behind a reverse proxy:

```nginx
# nginx example
server {
    listen 443 ssl;
    server_name cortex.example.com;
    
    ssl_certificate /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;
    
    location / {
        proxy_pass http://localhost:8084;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### CORS Configuration
```yaml
# Restrict to specific origins
CORS_ALLOW_ORIGINS: https://admin.example.com,https://app.example.com
```

- Avoid using `*` with credentials
- Auto-detection adds your host IP in development
- Review with `docker exec cortex-gateway-1 printenv CORS_ALLOW_ORIGINS`

### Security Headers
Enabled by default:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (when behind TLS proxy)

---

## Rate Limiting

Protect against abuse with Redis-backed rate limiting:

```yaml
RATE_LIMIT_ENABLED: "true"
RATE_LIMIT_RPS: 10          # Requests per second
RATE_LIMIT_BURST: 20        # Burst allowance
RATE_LIMIT_WINDOW_SEC: 60   # Sliding window
```

### Concurrency Limits
Protect model containers from overload:

```yaml
CONCURRENCY_LIMIT_ENABLED: "true"
MAX_CONCURRENT_STREAMS_PER_ID: 5
```

---

## Upstream Security

### Internal API Key
Secure communication between gateway and model containers:

```yaml
INTERNAL_VLLM_API_KEY: "strong-random-key-here"
```

Generate a strong key:
```bash
openssl rand -hex 32
```

---

## Data Security

### Sensitive Data Handling
- API keys are hashed before storage
- HuggingFace tokens are redacted in exports
- Usage logs contain metadata, not request payloads
- Database backups may contain sensitive configuration

### Export Security
When using deployment export:
- HF tokens are redacted (replaced with `[REDACTED]`)
- Export manifests flag when tokens were present
- Reconfigure tokens after import

---

## Production Hardening

### Required Settings
```yaml
# docker.compose.prod.yaml
environment:
  GATEWAY_DEV_ALLOW_ALL_KEYS: "false"
  INTERNAL_VLLM_API_KEY: "your-strong-key"
  CORS_ALLOW_ORIGINS: "https://your-domain.com"
```

### Checklist
- [ ] Disable dev auth bypass
- [ ] Set strong internal API key
- [ ] Configure specific CORS origins
- [ ] Change default admin password
- [ ] Enable TLS via reverse proxy
- [ ] Enable rate limiting
- [ ] Configure firewall rules
- [ ] Enable audit logging
- [ ] Set up backup automation

### Verification
```bash
make prod-check
```

---

## Network Security

### Firewall Rules
Only expose necessary ports:

```bash
# Allow admin UI and API
sudo ufw allow 3001/tcp  # Frontend
sudo ufw allow 8084/tcp  # Gateway

# Block direct access to internal services
sudo ufw deny 5432/tcp   # PostgreSQL
sudo ufw deny 6379/tcp   # Redis
sudo ufw deny 9090/tcp   # Prometheus (or restrict to monitoring)
```

### Docker Network
Model containers communicate via `cortex_default` network:
- Isolated from host network
- Gateway manages model container lifecycle
- Internal ports not exposed to host

---

## Audit & Monitoring

### Usage Logging
All API requests are logged with:
- Request ID
- API key (hashed reference)
- Model name
- Token counts
- Latency
- Status code

### Prometheus Metrics
Security-relevant metrics:
- `gateway_key_auth_allowed_total` — Successful authentications
- `gateway_key_auth_blocked_total` — Blocked requests
- `gateway_requests_total` — Request counts by status

### Log Review
```bash
# Check for auth failures
make logs-gateway | grep -i "auth"

# Check for errors
make logs-gateway | grep -i "error"
```

---

## Incident Response

### Suspected Compromise
1. Revoke affected API keys immediately
2. Review usage logs for anomalies
3. Change admin passwords
4. Rotate `INTERNAL_VLLM_API_KEY`
5. Review and restrict CORS origins

### Key Revocation
```bash
# Via Admin UI: API Keys → Delete
# Via API:
curl -X DELETE http://localhost:8084/admin/keys/{key_id} -b cookies.txt
```

---

## See Also

- [Threat Model](threat-model.md) — Detailed threat analysis
- [Configuration](../getting-started/configuration.md) — Environment variables
- [Admin Setup](../getting-started/admin-setup.md) — Production setup guide
