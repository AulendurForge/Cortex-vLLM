# Backup & Restore

Cortex provides multiple methods for backing up and restoring your data, including command-line tools and a web-based Admin UI.

## Quick Reference

| Method | Command/Location | Best For |
|--------|------------------|----------|
| **Makefile** | `make db-backup` / `make db-restore` | Daily operations |
| **Admin UI** | Deployment page → Database Restore | Migration workflows |
| **API** | `POST /admin/deployment/restore-database` | Automation |
| **Manual** | `pg_dump` / `psql` | Custom workflows |

---

## PostgreSQL Database

### Backup via Makefile (Recommended)

```bash
# Create timestamped backup
make db-backup

# Output: backups/cortex_backup_20260110_143000.sql
```

Backups are stored in the `backups/` directory with timestamps.

### Restore via Makefile

```bash
# List available backups
ls -la backups/

# Restore from specific backup
make db-restore BACKUP_FILE=backups/cortex_backup_20260110_143000.sql
```

### Restore via Admin UI

The Admin UI provides a guided database restore experience:

1. Navigate to **Admin → Deployment**
2. Scroll to **Database Restore** section
3. Enter the directory containing your export (e.g., `/var/cortex/exports`)
4. Click **Check** to verify the dump file exists
5. Configure options:
   - **Backup First**: Creates a safety backup before restore (recommended)
   - **Drop Existing**: Drops all tables before restore (for clean import)
6. Click **Restore Database**
7. Monitor progress in the job status panel

### Restore via API

```bash
# Check if dump file exists
curl -X POST http://localhost:8084/admin/deployment/check-database-dump \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"output_dir": "/var/cortex/exports"}'

# Restore database
curl -X POST http://localhost:8084/admin/deployment/restore-database \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "output_dir": "/var/cortex/exports",
    "backup_first": true,
    "drop_existing": false
  }'

# Check job status
curl http://localhost:8084/admin/deployment/status -b cookies.txt
```

### API Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `output_dir` | string | required | Directory containing `db/cortex_dump.sql` |
| `backup_first` | boolean | `true` | Create safety backup before restore |
| `drop_existing` | boolean | `false` | Drop all tables before restore |

### Manual Backup/Restore

For custom workflows or direct database access:

```bash
# Backup
docker exec cortex-postgres-1 pg_dump -U cortex cortex > backup.sql

# Restore
docker exec -i cortex-postgres-1 psql -U cortex cortex < backup.sql
```

---

## Automated Backups

Set up daily automated backups with cron:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/Cortex-vLLM && make db-backup

# Optional: Add weekly cleanup (keep last 7 days)
0 3 * * 0 find /path/to/Cortex-vLLM/backups -name "*.sql" -mtime +7 -delete
```

---

## What Gets Backed Up

### Database Contents
- **Users**: Admin accounts, passwords, roles
- **Organizations**: Org hierarchy and settings
- **API Keys**: All generated keys and scopes
- **Models**: Model configurations (not weights)
- **Usage**: Request logs and token counts
- **Config KV**: Model registry, system settings

### NOT in Database Backups
- Model weight files (stored in `CORTEX_MODELS_DIR`)
- HuggingFace cache (stored in `HF_CACHE_DIR`)
- Docker images (use `make prepare-offline` for these)

---

## Model Files

Model weights are stored on disk and should be backed up separately:

```bash
# Default locations
CORTEX_MODELS_DIR=/var/cortex/models
HF_CACHE_DIR=/var/cortex/hf-cache

# Backup model files
tar -czvf models_backup.tar.gz /var/cortex/models

# Restore model files
tar -xzvf models_backup.tar.gz -C /
```

---

## Full System Migration

For migrating Cortex to a new machine, use the **Deployment Export/Import** feature:

### On Source Machine

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

### Transfer Package

```bash
# Copy export directory to new machine
rsync -avz /var/cortex/exports/ user@newmachine:/var/cortex/exports/
```

### On Target Machine

```bash
# Load Docker images
make load-offline

# Restore database
# Via Admin UI: Deployment → Database Restore
# Or via API (see above)

# Import models
# Via Admin UI: Deployment → Import Model
```

See [Offline Deployment Guide](offline-deployment.md) for complete migration workflows.

---

## Best Practices

### Before Major Changes
```bash
make db-backup  # Always backup first
```

### Before Updates
```bash
make db-backup
git pull
make restart
```

### Recovery Checklist
1. ✅ Stop services: `make down`
2. ✅ Restore database: `make db-restore BACKUP_FILE=...`
3. ✅ Verify models exist in `CORTEX_MODELS_DIR`
4. ✅ Start services: `make up`
5. ✅ Verify: `make health`

---

## Troubleshooting

### "relation already exists" during restore
Use `drop_existing: true` option to drop tables before restore:
```bash
curl -X POST http://localhost:8084/admin/deployment/restore-database \
  -d '{"output_dir": "/var/cortex/exports", "drop_existing": true}'
```

### Restore fails silently
Check job status and logs:
```bash
curl http://localhost:8084/admin/deployment/status -b cookies.txt
make logs-gateway | grep -i restore
```

### Backup file not found
Ensure the dump file exists at `{output_dir}/db/cortex_dump.sql`:
```bash
docker exec cortex-gateway-1 ls -la /var/cortex/exports/db/
```
