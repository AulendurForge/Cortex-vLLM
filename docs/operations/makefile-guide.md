# Cortex Makefile Guide for Administrators

This guide explains how to use the Makefile for simplified administration of Cortex-vLLM.

## Prerequisites

Before using the Makefile commands, ensure you have:

1. **Docker** installed (version 20.10 or later)
2. **Docker Compose** installed (v2.0 or later)
3. **Make** utility (usually pre-installed on Linux/macOS)
4. **Bash** shell (for IP detection script)

To verify prerequisites:
```bash
make install-deps
```

## 🌐 Automatic IP Detection

**Important**: Cortex automatically detects your host machine's IP address and uses it throughout the system.

**What this means for you**:
- ✅ All URLs in terminal output use your real IP (e.g., `192.168.1.181`)
- ✅ CORS is automatically configured for your IP
- ✅ Other devices on your network can access Cortex
- ✅ No manual IP configuration needed

**Check your detected IP**:
```bash
make info

# Output:
# Detected Host IP: 192.168.1.181
# Endpoints:
# Gateway:         http://192.168.1.181:8084
# Admin UI:        http://192.168.1.181:3001
```

> **📌 Always use the IP shown in the output, NOT `localhost`!**

For more details on how IP detection works, see `docs/architecture/ip-detection.md`.

## Getting Started

### First Time Setup

The simplest way to get started:

```bash
# 1. Clone the repository
git clone https://github.com/your-org/Cortex-vLLM.git
cd Cortex-vLLM

# 2. Start everything with one command
make quick-start
```

This will:
- Build all Docker images
- Start all services (gateway, database, Redis, Prometheus)
- Create a default admin user (username: `admin`, password: `admin`)
- Show you the URLs to access the services

### Your First API Call

After quick-start completes:

```bash
# 1. Login to save session cookie
make login
# Enter username: admin
# Enter password: admin

# 2. Create an API key
make create-key
# Copy the token from the output

# 3. Test the API
curl -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:8084/v1/chat/completions \
  -d '{"model":"meta-llama/Llama-3-8B-Instruct","messages":[{"role":"user","content":"Hello!"}]}'
```

## Common Tasks

### Starting and Stopping Services

```bash
# Start all services (detached mode - runs in background)
make up

# Stop all services
make down

# Restart all services
make restart

# View what's running
make status
```

### Viewing Logs

```bash
# View logs from all services
make logs

# View logs from specific service
make logs SERVICE=gateway
make logs SERVICE=postgres
make logs SERVICE=prometheus

# Quick shortcuts
make logs-gateway
make logs-postgres
```

### Checking Health

```bash
# Check health of all services
make health

# This will show:
# - Gateway health endpoint status
# - Container status
# - Prometheus readiness
```

### Managing the Database

```bash
# Backup the database
make db-backup
# Creates backup in backups/cortex_backup_YYYYMMDD_HHMMSS.sql

# Restore from backup
make db-restore BACKUP_FILE=backups/cortex_backup_20240104_120000.sql

# Open PostgreSQL shell
make db-shell

# Reset database (⚠️ DANGER: deletes all data)
make db-reset
```

### Cleaning Up

```bash
# Stop services and remove containers/volumes
make clean

# Also remove managed model containers
make clean-all

# Remove unused Docker resources (free up disk space)
make prune
```

## Advanced Usage

### Environment Selection

Run in production mode:

```bash
make up ENV=prod
make down ENV=prod
```

### Using Profiles for Monitoring

If you have a Linux host with NVIDIA GPUs:

```bash
# Start with Linux host monitoring and GPU metrics
make up PROFILES=linux,gpu

# Verify exporters are running
make health
```

Available profiles:
- `linux` - Enables node-exporter for host CPU/memory/disk metrics
- `gpu` - Enables DCGM exporter for NVIDIA GPU metrics

### Running Tests

```bash
# Run smoke tests
make test

# Test API endpoints
make test-api
```

### Production Deployment Check

Before deploying to production:

```bash
make prod-check

# This will verify:
# - Dev auth is disabled
# - Security settings are configured
# - Required environment variables are set
```

## Complete Command Reference

Run `make help` to see all available commands:

```bash
make help
```

### Service Management
- `make build` - Build Docker images
- `make up` - Start services (background)
- `make up-fg` - Start services (foreground, shows logs)
- `make down` - Stop and remove containers
- `make restart` - Restart all services
- `make stop` - Stop containers
- `make start` - Start stopped containers

### Monitoring & Debugging
- `make logs` - View logs (all services)
- `make logs SERVICE=name` - View specific service
- `make logs-gateway` - Gateway logs
- `make logs-postgres` - Database logs
- `make ps` / `make status` - List containers
- `make health` - Health check all services

### Setup & Configuration
- `make quick-start` - Complete setup in one command
- `make bootstrap` - Create admin user (interactive)
- `make bootstrap-default` - Create default admin
- `make login` - Login and save session
- `make create-key` - Generate API key

### Database Operations
- `make db-backup` - Backup database
- `make db-restore BACKUP_FILE=path` - Restore backup
- `make db-shell` - Open PostgreSQL shell
- `make db-reset` - Reset database

### Cleanup
- `make clean` - Stop and remove volumes
- `make clean-all` - Also remove model containers
- `make prune` - Clean unused Docker resources

### Testing
- `make test` - Run smoke tests
- `make test-api` - Test endpoints

### Development
- `make shell-gateway` - Open shell in gateway
- `make shell-postgres` - Open shell in Postgres
- `make watch` - Watch container status

### Information
- `make help` - Show all commands
- `make info` - Show current configuration
- `make version` - Show version info
- `make install-deps` - Verify dependencies

## Troubleshooting

### "make: command not found"

**Solution**: Install make utility

```bash
# Ubuntu/Debian
sudo apt-get install make

# macOS (usually pre-installed)
xcode-select --install

# Windows WSL
sudo apt-get install make
```

### "Docker daemon is not running"

**Solution**: Start Docker

```bash
# Linux
sudo systemctl start docker

# macOS/Windows
# Start Docker Desktop application
```

### Services won't start

```bash
# Clean everything and start fresh
make clean
make up

# If that doesn't work, check logs
make logs
```

### Can't connect to services

1. Check services are running:
   ```bash
   make status
   ```

2. Check health:
   ```bash
   make health
   ```

3. View logs for errors:
   ```bash
   make logs-gateway
   ```

### Database connection errors

```bash
# Check if Postgres is running
make status

# View Postgres logs
make logs-postgres

# If needed, reset database
make db-reset
```

### Port conflicts

If ports 8084, 9090, or 5432 are already in use:

1. Edit `docker.compose.dev.yaml` to change port mappings
2. Restart services:
   ```bash
   make restart
   ```

### Need to completely reset

```bash
# Nuclear option: remove everything
make clean-all
docker system prune -af --volumes

# Start fresh
make quick-start
```

## Best Practices

### Regular Backups

Set up a cron job for regular backups:

```bash
# Add to crontab (run daily at 2 AM)
0 2 * * * cd /path/to/Cortex-vLLM && make db-backup
```

### Monitor Health

Regularly check service health:

```bash
make health
```

### View Logs Regularly

Keep an eye on logs for errors:

```bash
make logs-gateway | grep ERROR
```

### Before Updates

1. Backup database: `make db-backup`
2. Stop services: `make down`
3. Pull updates: `git pull`
4. Rebuild and start: `make up`

## Quick Reference Card

Print this and keep it handy:

```
┌─────────────────────────────────────────────────┐
│         CORTEX QUICK REFERENCE                  │
├─────────────────────────────────────────────────┤
│ Start:         make up                          │
│ Stop:          make down                        │
│ Restart:       make restart                     │
│ Status:        make status                      │
│ Logs:          make logs                        │
│ Health:        make health                      │
│ Backup DB:     make db-backup                   │
│ Clean:         make clean                       │
│ Help:          make help                        │
├─────────────────────────────────────────────────┤
│ URLs:                                           │
│   Gateway:     http://localhost:8084            │
│   Admin UI:    http://localhost:3001            │
│   Prometheus:  http://localhost:9090            │
│   PgAdmin:     http://localhost:5050            │
└─────────────────────────────────────────────────┘
```

## Support

For more detailed documentation:
- Full docs: https://aulendurforge.github.io/Cortex-vLLM/
- GitHub issues: Report bugs or request features
- README.md: Quick start guide

## Security Notes

**For Production Deployments:**

1. Change default admin password immediately after `quick-start`
2. Set `ENV=prod` when running in production
3. Configure proper CORS origins (not `*`)
4. Enable TLS via reverse proxy (nginx/traefik)
5. Set strong `INTERNAL_VLLM_API_KEY`
6. Disable dev auth: `GATEWAY_DEV_ALLOW_ALL_KEYS=false`
7. Set up regular automated backups
8. Review security checklist: `make prod-check`

---

**Need help?** Run `make help` for a complete list of commands.

