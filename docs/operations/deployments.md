# Deployments

This guide covers deployment options for Cortex, from development to production environments.

---

## Quick Start (Recommended)

```bash
make quick-start
```

This single command:
- Auto-detects your host IP
- Configures CORS for network access
- Creates the default admin user
- Enables monitoring on Linux
- Starts all services

---

## Deployment Options

### Development Mode

Best for local development and testing:

```bash
# Using Makefile (recommended)
make up

# Or direct Docker Compose
docker compose -f docker.compose.dev.yaml up --build
```

**Features:**
- Hot-reload for frontend
- Debug logging enabled
- Dev auth bypass available
- SQLite-compatible dev settings

### Production Mode

For production deployments:

```bash
make up ENV=prod

# Or direct
docker compose -f docker.compose.prod.yaml up -d
```

**Required configuration:**
- External PostgreSQL with backups
- External Redis for rate limiting
- Reverse proxy with TLS (nginx/traefik)
- Strong authentication keys
- Restricted CORS origins

### Offline/Air-Gapped

For restricted networks without internet access:

```bash
# On internet-connected machine
make prepare-offline

# Transfer cortex-offline-images/ to target

# On air-gapped machine
make load-offline
make verify-offline
make quick-start
```

See [Offline Deployment Guide](offline-deployment.md) for complete instructions.

---

## Environment Profiles

### Linux Profile
Enables host metrics collection:
```bash
make up PROFILES=linux
```

### GPU Profile
Enables GPU metrics (requires NVIDIA drivers):
```bash
make up PROFILES=gpu
```

### Combined
```bash
make up PROFILES=linux,gpu
```

On Linux with NVIDIA GPUs, `make up` automatically enables both profiles.

---

## Production Checklist

### Security
- [ ] Set `GATEWAY_DEV_ALLOW_ALL_KEYS=false`
- [ ] Configure strong `INTERNAL_VLLM_API_KEY`
- [ ] Set specific `CORS_ALLOW_ORIGINS` (not `*`)
- [ ] Change default admin password
- [ ] Enable TLS via reverse proxy

### Infrastructure
- [ ] External PostgreSQL with backups
- [ ] External Redis for rate limiting
- [ ] Persistent volumes for models
- [ ] Log aggregation configured

### Monitoring
- [ ] Prometheus scraping enabled
- [ ] GPU metrics configured (DCGM exporter)
- [ ] Alerting rules defined
- [ ] Dashboard imported

### Backup
- [ ] Database backups automated
- [ ] Model files backed up
- [ ] Recovery procedure tested

Run `make prod-check` to verify production readiness.

---

## Health Endpoints

| Service | Endpoint | Purpose |
|---------|----------|---------|
| Gateway | `GET /health` | Service health |
| Gateway | `GET /admin/system/summary` | System metrics |
| Prometheus | `GET /api/v1/query` | Metrics queries |
| PostgreSQL | Container healthcheck | Database health |
| Redis | Container healthcheck | Cache health |

---

## Migration Workflows

### Export System Configuration

```bash
# Via Admin UI: Deployment → Export
# Or via API:
curl -X POST http://localhost:8084/admin/deployment/export \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "output_dir": "/var/cortex/exports",
    "include_images": true,
    "include_db": true,
    "include_configs": true
  }'
```

### Import on New System

1. Load Docker images: `make load-offline`
2. Restore database via Admin UI or API
3. Import models via Admin UI
4. Verify with `make health`

See [Backup & Restore](backup-restore.md) for detailed procedures.

---

## Scaling

### Horizontal Gateway Scaling
- Deploy multiple gateway replicas behind load balancer
- Share PostgreSQL and Redis instances
- Configure sticky sessions for streaming

### Model Scaling
- Add models to the registry via Admin UI
- Gateway routes requests to available models
- Use health-aware routing for reliability

See [Scaling & Reliability](scaling.md) for advanced patterns.
