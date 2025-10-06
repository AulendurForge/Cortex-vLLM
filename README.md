<img src="frontend/src/assets/Aulendur%20LLC%20Dark%20Logo%20with%20Text_NoBackground.png" alt="Aulendur LLC" align="right" width="80" />

<p align="center">
  <img src="frontend/src/assets/cortex%20logo%20and%20text%20black.png" alt="CORTEX" width="360" />
</p>

# CORTEX

OpenAI-compatible gateway and admin UI for running vLLM and llama.cpp inference engines on your own infrastructure. Built and maintained by Aulendur LLC.

- OpenAI-compatible endpoints: `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`
- Health-aware routing, circuit breaking, retries
- Usage metering, admin APIs/UI for users, orgs, keys, models
- Prometheus metrics; optional Redis and OpenTelemetry

## ⚡ No Configuration Required!

**Cortex automatically:**
- ✅ Detects your host IP address (even without Makefile!)
- ✅ Configures CORS for network access
- ✅ Creates default admin user (admin/admin) on first startup
- ✅ Enables monitoring on Linux systems (host + GPU metrics)
- ✅ Sets up the database and services
- ✅ Works from any device on your network

**Just run `make quick-start` and you're done!**

## Documentation

**📚 Quick Start**:
- `START_HERE.md` - **START HERE** - 5-minute quick start guide
- `README.md` - This file (overview and quick reference)
- `Makefile` - Run `make help` to see all commands

**🌐 Full Documentation** (guides, architecture, API reference, operations):
- Docs site: https://aulendurforge.github.io/Cortex-vLLM/
- Local docs: Browse the `docs/` directory for comprehensive guides
  - Getting Started: Setup, configuration, admin guides
  - Architecture: System design, IP detection, configuration flow
  - Models: vLLM, llama.cpp, engine comparison
  - Operations: Makefile guide, deployment, scaling
  - API: OpenAI-compatible and admin endpoints
  - Security: Security posture and threat model

## Quick Start (Recommended)

**For administrators - simplified one-command setup:**

```bash
# 1. Install prerequisites (if not already installed)
# Ubuntu/Debian:
sudo apt-get update && sudo apt-get install -y make docker.io docker-compose-plugin

# CentOS/RHEL:
sudo yum install -y make docker docker-compose-plugin

# Verify prerequisites:
make --version     # Should show GNU Make
docker --version   # Should show Docker

# 2. Start everything with one command
make quick-start

# That's it! Cortex will automatically detect your host IP and display the URLs.
# Access the Admin UI using the IP address shown (NOT localhost)
# Example output:
# ✓ Cortex is ready!
# Login at: http://192.168.1.181:3001/login (admin/admin)
```

> **⚠️ IMPORTANT**: While `docker compose` will now work standalone (with automatic IP detection), using `make` commands is **strongly recommended** for the best experience. The Makefile provides additional features like automatic monitoring enablement, better error messages, and helpful output.

> **📌 Important**: Always use the **host machine's IP address** shown in the output, not `localhost`. The IP is automatically detected when you run `make` commands. Users on your network will access Cortex using this IP address.

**Check your host IP:**

```bash
make ip            # Prominently displays your host IP and URLs
make info          # Shows full configuration including IP
```

**Verify everything is working:**

```bash
make validate      # Complete configuration validation (IP, CORS, services, network)
make ip            # Show host IP and access URLs
make health        # Check service health
```

**Common operations:**

```bash
make help          # See all available commands
make status        # Check if services are running
make logs          # View logs from all services
make stop          # Stop services
make restart       # Restart services
make clean         # Remove everything and start fresh
```

**Monitoring (automatic on Linux):**

```bash
make up                        # Auto-enables linux,gpu profiles on Linux with NVIDIA
make monitoring-status         # Check monitoring stack health
make info                      # See what's auto-detected
```

On Linux systems with NVIDIA GPUs, Cortex automatically enables:
- **node-exporter**: Host CPU, memory, disk, and network metrics
- **dcgm-exporter**: GPU utilization, memory, and temperature
- **cadvisor**: Container resource usage

All metrics visible in the **System Monitor** page of the Admin UI.

> **🔍 How IP Detection Works**: Cortex automatically detects your host machine's LAN IP address (e.g., `192.168.1.181` or `10.1.10.241`) and configures CORS to accept requests from that IP. This allows users on your network to access the Admin UI. The detection excludes Docker bridge networks and loopback addresses.

<details>
<summary><b>📚 All Available Commands</b> (click to expand)</summary>

### Service Management
- `make up` - Start all services in background
- `make down` - Stop and remove all containers
- `make restart` - Restart all services
- `make stop` - Stop containers (without removing)
- `make start` - Start existing stopped containers

### Monitoring & Debugging
- `make status` - Show running containers
- `make health` - Check health of all services
- `make logs` - Follow logs from all services
- `make logs SERVICE=gateway` - View specific service logs
- `make logs-gateway` - Gateway logs shortcut
- `make logs-postgres` - Database logs shortcut

### Setup & Configuration
- `make bootstrap` - Create admin user (interactive)
- `make bootstrap-default` - Create default admin (admin/admin)
- `make login` - Login and save session
- `make create-key` - Generate new API key

### Database Operations
- `make db-backup` - Backup database to `backups/` folder
- `make db-restore BACKUP_FILE=backups/cortex_backup_*.sql` - Restore from backup
- `make db-shell` - Open PostgreSQL shell
- `make db-reset` - Reset database (⚠️ deletes all data)

### Cleanup
- `make clean` - Stop services and remove volumes
- `make clean-all` - Also remove model containers
- `make prune` - Remove unused Docker resources

### Testing
- `make test` - Run smoke tests
- `make test-api` - Test API endpoints

### Environment Options
- `ENV=dev` (default) or `ENV=prod` - Choose environment
- `PROFILES=linux,gpu` - Enable monitoring profiles

**Examples:**
```bash
# Production deployment
make up ENV=prod

# Development with GPU monitoring
make up PROFILES=linux,gpu

# View gateway logs only
make logs SERVICE=gateway

# Backup before making changes
make db-backup
```

</details>

### Troubleshooting

**Can't access the UI from another computer?**
1. Get your host IP: `make info`
2. Use that IP (e.g., `http://192.168.1.181:3001`), NOT `localhost`
3. Ensure the other computer is on the same network
4. Check firewall allows ports 3001 and 8084

**Services won't start?**
```bash
make clean        # Clean up everything
make install-deps # Verify Docker is installed
make up           # Try starting again
make status       # Check container status
```

**Can't access the UI even from the host machine?**
- Check services are running: `make status`
- Check health: `make health`
- View logs: `make logs-gateway`
- Verify your IP: `make info` (use the shown IP, not localhost)

**CORS errors in browser?**
- The detected IP is automatically added to CORS whitelist
- Check `make info` to see your current IP
- If your IP changed, restart: `make restart`

**Need to reset everything?**
```bash
make clean-all    # Remove everything
make quick-start  # Start fresh
```

## Advanced Quickstart (Docker)
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
CORS_ALLOW_ORIGINS: http://10.1.10.241:3001,http://localhost:3001,http://127.0.0.1:3001
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