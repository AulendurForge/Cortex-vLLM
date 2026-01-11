# Threat Model

This document identifies threats to Cortex deployments and mitigation strategies.

---

## Assets

### High Value
- **API Keys**: Provide access to inference endpoints
- **Admin Credentials**: Full system control
- **Model Weights**: Proprietary or licensed models
- **User Data**: Organizations, users, usage logs

### Medium Value
- **Configuration**: System settings, CORS, rate limits
- **HuggingFace Tokens**: Access to gated models
- **Database**: All persistent state

---

## Threat Actors

| Actor | Capability | Motivation |
|-------|------------|------------|
| External Attacker | Network access | Data theft, service abuse |
| Malicious User | Valid API key | Quota abuse, data exfiltration |
| Insider | Admin access | Data theft, sabotage |
| Automated Bot | Scripted attacks | Resource exhaustion |

---

## Threats & Mitigations

### T1: Unauthorized API Access
**Threat**: Attacker gains access to inference endpoints without valid credentials.

**Mitigations**:
- API key authentication on all `/v1/*` endpoints
- Keys are hashed before storage
- Scoped permissions limit access
- Rate limiting prevents brute force

### T2: Admin Panel Compromise
**Threat**: Attacker gains access to admin functionality.

**Mitigations**:
- Session-based authentication
- Disable dev bypass in production (`GATEWAY_DEV_ALLOW_ALL_KEYS=false`)
- Strong password requirements
- CORS restrictions prevent CSRF

### T3: API Key Theft
**Threat**: Valid API keys are stolen and misused.

**Mitigations**:
- Keys shown only once at creation
- Keys can be revoked immediately
- Usage logging enables detection
- Scope restrictions limit impact

### T4: Data Exfiltration
**Threat**: Sensitive data extracted from system.

**Mitigations**:
- Database credentials are hashed
- HF tokens redacted in exports
- Network isolation for internal services
- Audit logging for detection

### T5: Denial of Service
**Threat**: System overwhelmed by excessive requests.

**Mitigations**:
- Rate limiting (RPS + burst)
- Concurrent stream limits
- Circuit breaker for failing upstreams
- Request size limits

### T6: Model Container Escape
**Threat**: Malicious model code escapes container.

**Mitigations**:
- Containers run with limited privileges
- Network isolated to cortex_default
- No host filesystem access (read-only mounts)
- Regular image updates

### T7: Supply Chain Attack
**Threat**: Compromised dependencies or images.

**Mitigations**:
- Pin Docker image versions
- Verify checksums for offline packages
- Review model sources
- Monitor for security advisories

### T8: Network Eavesdropping
**Threat**: Traffic intercepted on network.

**Mitigations**:
- TLS termination at reverse proxy
- Internal traffic stays on Docker network
- Sensitive headers not logged

---

## Risk Matrix

| Threat | Likelihood | Impact | Risk Level |
|--------|------------|--------|------------|
| T1: Unauthorized API Access | Medium | High | **High** |
| T2: Admin Compromise | Low | Critical | **High** |
| T3: API Key Theft | Medium | Medium | **Medium** |
| T4: Data Exfiltration | Low | High | **Medium** |
| T5: Denial of Service | High | Medium | **Medium** |
| T6: Container Escape | Very Low | Critical | **Low** |
| T7: Supply Chain | Low | High | **Medium** |
| T8: Eavesdropping | Medium | Medium | **Medium** |

---

## Security Boundaries

```
┌─────────────────────────────────────────────────┐
│                  Internet                        │
└─────────────────────────────────────────────────┘
                      │
                      ▼ (TLS)
┌─────────────────────────────────────────────────┐
│              Reverse Proxy                       │
│         (nginx/traefik - TLS termination)       │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│              Docker Network                      │
│  ┌─────────────┐  ┌─────────────┐               │
│  │   Gateway   │  │  Frontend   │               │
│  │ (auth/rate) │  │    (UI)     │               │
│  └─────────────┘  └─────────────┘               │
│         │                                        │
│         ▼                                        │
│  ┌─────────────┐  ┌─────────────┐               │
│  │  PostgreSQL │  │    Redis    │               │
│  │  (data)     │  │   (cache)   │               │
│  └─────────────┘  └─────────────┘               │
│         │                                        │
│         ▼                                        │
│  ┌─────────────────────────────────────────┐    │
│  │         Model Containers                 │    │
│  │    (vLLM / llama.cpp - isolated)        │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## Compliance Considerations

### For Air-Gapped Deployments
- Offline package includes integrity checksums (SHA256)
- No external network calls after deployment
- All images loaded from verified local files
- Suitable for ITAR, FedRAMP, DoD environments

### For Enterprise
- Audit logs for compliance reporting
- Role-based access control
- API key management with revocation
- Usage tracking for billing/allocation

---

## Recommendations by Environment

### Development
- Dev bypass acceptable for local testing
- Use default credentials for convenience
- Monitor logs for unexpected access

### Staging
- Disable dev bypass
- Use production-like configuration
- Test security controls

### Production
- All mitigations enabled
- TLS required
- Regular security reviews
- Incident response plan documented

---

## See Also

- [Security Guide](security.md) — Implementation details
- [Configuration](../getting-started/configuration.md) — Security settings
- [Admin Setup](../getting-started/admin-setup.md) — Production hardening
