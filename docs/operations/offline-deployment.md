# Offline Deployment Guide

## Overview

Cortex supports fully offline/air-gapped deployments for environments without internet access, such as:

- Classified networks (DoD, government)
- Air-gapped research facilities
- Restricted corporate networks
- High-security data centers
- Remote locations with no connectivity

This guide explains how to prepare, transfer, and deploy Cortex in completely offline environments.

### Using the Admin UI "Deployment" page (recommended for migrations)

If you already have a running Cortex instance (online or staging) and want to migrate it to an offline machine,
you can use the Admin UI:

- **Admin UI → Deployment**: Generates an "offline migration package" directory on disk that can include:
  - Docker images (gateway/frontend + engines + infra)
  - Database dump (pg_dump)
  - Manifests for models/config (with secrets redacted)
  - Optional large archives (model weights and HF cache)

This is intended for the workflow:
online/staging instance → validate models/config → export package → transfer → import on offline instance.

---

## How Offline Operation Works

### What Needs Internet Access?

**During Normal Deployment** (online mode):
1. **Docker base images** - vLLM and llama.cpp container images (~8-12 GB each)
2. **Infrastructure images** - Python, Node.js, PostgreSQL, Redis, Prometheus (~1-2 GB total)
3. **Model weights** - Only if downloading from HuggingFace (can be pre-transferred)

**What Cortex Does Differently Offline**:
- Uses pre-cached Docker images (loaded from tar files)
- Serves models from local `/var/cortex/models` directory
- Never attempts to pull images from internet registries
- Validates GGUF tokenizer availability before model start
- Provides startup diagnostics with actionable fixes
- Fails gracefully with helpful error messages

### Current Limitation (Addressed in This Guide)

**Before offline support**:
```
User starts model → Cortex checks for image → Not found → docker pull → ❌ FAILS (no internet)
```

**With offline support**:
```
User starts model → Cortex checks for image → Found in cache → ✓ Starts immediately
```

---

## Preparation Steps

### Prerequisites

- **Online machine** with Docker and internet access
- **Offline machine** where Cortex will run
- **Transfer method**: USB drive, secure file transfer, physical media, sneakernet
- **Storage**: ~20-25 GB free space for Docker images

---

## Step 1: Prepare Offline Package (Online Machine)

On a machine with internet access:

```bash
# Clone Cortex repository
git clone https://github.com/AulendurForge/Cortex-vLLM.git
cd cortex-vllm

# Download and package all required Docker images
make prepare-offline
```

**What this does**:
1. Downloads vLLM inference engine image (~8-12 GB)
2. Downloads llama.cpp inference engine image (~3-5 GB)
3. Downloads all infrastructure images (Python, Node, Postgres, Redis, Prometheus)
4. Downloads monitoring images (node-exporter, dcgm-exporter, cadvisor)
5. Saves all images as tar files in `cortex-offline-images/` directory
6. Creates manifest.json with package metadata

**Output**:
```
cortex-offline-images/
├── vllm-openai-v0.6.3.tar          (8-12 GB)
├── llamacpp-server-cuda.tar        (3-5 GB)
├── python-3.11-slim.tar            (150 MB)
├── node-18-alpine.tar              (180 MB)
├── postgres-16.tar                 (350 MB)
├── redis-7.tar                     (110 MB)
├── prometheus-v2.47.0.tar          (220 MB)
├── node-exporter-v1.6.1.tar        (25 MB)
├── dcgm-exporter.tar               (450 MB)
├── cadvisor-v0.47.0.tar            (250 MB)
├── registry-2.tar                  (25 MB)
├── manifest.json                   (metadata)
└── README.txt                      (instructions)
```

**Total package size**: ~14-19 GB (uncompressed)

### Optional: Compress Package

```bash
# Compress for faster transfer (reduces to ~8-12 GB)
tar -czf cortex-offline-package.tar.gz cortex-offline-images/

# Or use better compression (slower but smaller)
tar -cJf cortex-offline-package.tar.xz cortex-offline-images/
```

---

## Step 2: Transfer Package (Offline Machine)

Transfer the following to your offline machine:

### Required Files:
1. **cortex-vllm/** - Complete repository (code, configs, scripts)
2. **cortex-offline-images/** - Docker image package
3. **Model files** - Any models for `/var/cortex/models` (if using offline models)

### Transfer Methods:

**USB Drive** (most common):
```bash
# On online machine
cp -r cortex-vllm /media/usb/
cp -r cortex-offline-images /media/usb/

# On offline machine
cp -r /media/usb/cortex-vllm ~/
cp -r /media/usb/cortex-offline-images ~/cortex-vllm/
```

**Secure File Transfer** (if temporary network available):
```bash
# Using SCP
scp -r cortex-offline-images/ user@offline-machine:/home/user/cortex-vllm/

# Using rsync (resume support)
rsync -avP cortex-offline-images/ user@offline-machine:/home/user/cortex-vllm/cortex-offline-images/
```

**Physical Media** (maximum security):
- Burn to DVD/Blu-ray
- External SSD/HDD
- Network-isolated file transfer appliance

---

## Step 3: Load Docker Images (Offline Machine)

On your offline machine:

```bash
cd cortex-vllm

# Load all images from package
make load-offline
```

**What this does**:
1. Verifies checksums of all tar files (if `checksums.sha256` exists)
2. Finds all .tar files in `cortex-offline-images/`
3. Loads each image into Docker's local cache
4. **Post-load verification**: Confirms expected images exist in Docker
5. Reports critical vs optional missing images
6. Shows summary of cached images

**Post-load verification** automatically reads expected images from the manifest and verifies they exist after loading. Critical images (vLLM, llama.cpp, postgres, redis) will cause the script to exit with an error if missing.

**Expected output**:
```
Loading vllm-openai-v0.6.3.tar (10.2 GB)... ✓
Loading llamacpp-server-cuda.tar (4.1 GB)... ✓
Loading python-3.11-slim.tar (148 MB)... ✓
...
Successfully loaded: 11
Failed: 0
✓ All images loaded successfully!
```

---

## Step 4: Verify Offline Readiness

```bash
# Check that all required images are cached
make verify-offline
```

**Expected output** (when ready):
```
Checking required images...

  vllm/vllm-openai:v0.6.3                          ✓ (10.2 GB)
  ghcr.io/ggml-org/llama.cpp:server-cuda           ✓ (4.1 GB)
  python:3.11-slim                                 ✓ (148 MB)
  node:18-alpine                                   ✓ (182 MB)
  postgres:16                                      ✓ (357 MB)
  redis:7                                          ✓ (117 MB)
  prom/prometheus:v2.47.0                          ✓ (224 MB)
  
✓ READY FOR OFFLINE OPERATION

All required images are cached locally.
You can deploy Cortex in a fully offline environment.
```

---

## Step 5: Configure Offline Mode

Enable offline mode to prevent any internet access attempts:

```bash
# Add to backend/.env
echo "OFFLINE_MODE=True" >> backend/.env

# Or edit backend/.env directly:
nano backend/.env
```

Add these lines:
```bash
# Offline/Air-gapped deployment
OFFLINE_MODE=True                    # Prevent internet access for image pulls
OFFLINE_MODE_AUTO_DETECT=False       # Disable auto-detection (we know we're offline)
REQUIRE_IMAGE_PRECACHE=True          # Strict: only use cached images
```

---

## Step 6: Deploy Cortex

```bash
# Start all services
make quick-start

# Or step-by-step:
make up
make bootstrap-default
```

**Verification**:
```bash
# Check services are running
make status

# Check health
make health

# View Docker image cache status (via API)
curl http://localhost:8084/admin/system/docker-images | jq .
```

---

## Offline Deployment Checklist

### Preparation (Online Machine)
- [ ] Clone Cortex repository
- [ ] Run `make prepare-offline`
- [ ] Verify package created (cortex-offline-images/)
- [ ] Check package size (~15-20 GB)
- [ ] Transfer model files to USB/media (if using offline models)
- [ ] Document versions in manifest.json

### Transfer
- [ ] Copy cortex-vllm/ repository to transfer media
- [ ] Copy cortex-offline-images/ to transfer media
- [ ] Copy model files to transfer media (optional)
- [ ] Verify checksums/integrity (optional but recommended)

### Deployment (Offline Machine)
- [ ] Transfer all files to offline machine
- [ ] Run `make load-offline`
- [ ] Run `make verify-offline` (should show all ✓)
- [ ] Configure offline mode in backend/.env
- [ ] Place models in /var/cortex/models (if using)
- [ ] Run `make quick-start`
- [ ] Verify services running: `make status`
- [ ] Test model deployment via web UI

---

## Troubleshooting

### "Image not found" Error When Starting Model

**Symptom**:
```
Error: Docker image 'vllm/vllm-openai:<tag>' is not available locally.
System is in OFFLINE MODE - cannot download from internet.
```

**Solution**:
```bash
# Check what's cached
docker images

# If vLLM image missing, load it
docker load -i cortex-offline-images/vllm-openai-v0.6.3.tar

# Verify
make verify-offline
```

### Network Detection Issues

**Symptom**: Cortex tries to pull images even in offline environment

**Solution**:
```bash
# Force offline mode
echo "OFFLINE_MODE=True" >> backend/.env
echo "OFFLINE_MODE_AUTO_DETECT=False" >> backend/.env

# Restart
make restart
```

### Partial Image Loading

**Symptom**: Some images failed to load

**Solution**:
```bash
# Load failed images individually
docker load -i cortex-offline-images/<failed-image>.tar

# Check for corruption
md5sum cortex-offline-images/*.tar

# Re-download if corrupted
```

### Version Mismatch

**Symptom**: Image versions don't match configuration

**Solution**:
```bash
# Check manifest
cat cortex-offline-images/manifest.json

# Update config to match cached versions
nano backend/.env
# Set VLLM_IMAGE and LLAMACPP_IMAGE to match manifest versions
```

---

## Version Management

### Central Version Configuration

Cortex uses a central version file to ensure consistency across all scripts:

```bash
# scripts/versions.env - Single source of truth
CORTEX_VLLM_VERSION="${CORTEX_VLLM_VERSION:-latest}"
CORTEX_LLAMACPP_TAG="${CORTEX_LLAMACPP_TAG:-server-cuda}"
```

All scripts (`prepare-offline-deployment.sh`, `verify-offline-images.sh`) automatically source this file.

### Pinning Versions for Production

For production/offline deployments, pin specific versions:

```bash
# Edit scripts/versions.env
CORTEX_VLLM_VERSION="v0.8.0"
CORTEX_LLAMACPP_TAG="server-cuda"

# Or set environment variables
export CORTEX_VLLM_VERSION="v0.8.0"
make prepare-offline
```

### Version Override Hierarchy

1. **Environment variables** (highest priority): `VLLM_VERSION`, `LLAMACPP_TAG`
2. **Cortex versions**: `CORTEX_VLLM_VERSION`, `CORTEX_LLAMACPP_TAG` 
3. **scripts/versions.env** defaults
4. **Hardcoded fallbacks** (lowest priority): `"latest"`, `"server-cuda"`

### Keeping Versions Synchronized

When updating versions:

1. Update `scripts/versions.env` 
2. Update `backend/.env` (if set explicitly)
3. Run `make prepare-offline` to cache new images
4. Run `make verify-offline` to confirm
5. Update `backend/src/config.py` default if needed

---

## Advanced: Local Docker Registry

For organizations deploying Cortex on multiple offline machines:

### Setup Local Registry

```bash
# Start local registry
docker run -d -p 5000:5000 --restart=always \
  --name local-registry \
  -v /var/lib/docker-registry:/var/lib/registry \
  registry:2

# Tag images for local registry
docker tag vllm/vllm-openai:v0.6.3 localhost:5000/vllm-openai:v0.6.3
docker tag ghcr.io/ggml-org/llama.cpp:server-cuda localhost:5000/llamacpp:server-cuda

# Push to local registry
docker push localhost:5000/vllm-openai:v0.6.3
docker push localhost:5000/llamacpp:server-cuda
```

### Configure Cortex to Use Local Registry

```bash
# backend/.env
VLLM_IMAGE=localhost:5000/vllm-openai:v0.6.3
LLAMACPP_IMAGE=localhost:5000/llamacpp:server-cuda
OFFLINE_MODE=False  # Can leave offline mode off since registry is local
```

**Benefits**:
- Distribute images to multiple machines easily
- Centralized image management
- Standard Docker workflow

**Requirements**:
- Registry container running on offline network
- All machines can reach registry IP:5000
- Storage for registry data (~20+ GB)

---

## Updating Offline Deployment

### When to Update

- Security patches released for vLLM or llama.cpp
- New features in engine versions
- Infrastructure updates (Python, Postgres, etc.)

### Update Process

```bash
# On internet-connected machine
cd cortex-vllm
git pull  # Get latest Cortex code

# Check for version updates in backend/src/config.py
cat backend/src/config.py | grep "_IMAGE"

# Prepare new offline package with updated versions
make prepare-offline

# Transfer updated package to offline machine
# On offline machine:
make load-offline
make verify-offline

# Update configuration if versions changed
nano backend/.env

# Restart with new images
make restart
```

---

## Security Considerations

### Benefits of Offline Operation

✅ **No internet exposure** - Attack surface reduced  
✅ **Version control** - No silent updates from registries  
✅ **Supply chain security** - Images verified before transfer  
✅ **Compliance** - Meets air-gap requirements (ITAR, EAR)  
✅ **Audit trail** - All images tracked in manifest  

### Best Practices

1. **Verify checksums** after transfer (automatic)
   
   Cortex now automatically generates and verifies SHA256 checksums for all exported files.
   
   ```bash
   # Checksums are automatically generated during export
   # Located at: {output_dir}/checksums.sha256
   
   # During load, checksums are automatically verified:
   make load-offline
   # Output: "Verifying file checksums..."
   # db/cortex.sql ✓
   # manifest.json ✓
   # manifests/models.json ✓
   
   # To skip verification (not recommended):
   VERIFY_CHECKSUMS=false make load-offline
   
   # Manual verification:
   cd cortex-offline-images
   sha256sum -c checksums.sha256
   ```

2. **Pin specific versions** (don't use :latest)
   ```bash
   # In backend/src/config.py
   VLLM_IMAGE = "vllm/vllm-openai:v0.6.3"  # Not :latest
   ```

3. **Document image provenance**
   - Record where images were downloaded from
   - Note download date and verification steps
   - Maintain change log for updates

4. **Test before deployment**
   - Test offline package on non-production system first
   - Verify all functionality works
   - Document any issues found

---

## File Size Reference

### Docker Images

| Image | Purpose | Approximate Size |
|-------|---------|-----------------|
| vllm/vllm-openai | vLLM inference engine | 8-12 GB |
| llama.cpp | llama.cpp inference engine | 3-5 GB |
| python:3.11-slim | Backend runtime | 150 MB |
| node:18-alpine | Frontend runtime | 180 MB |
| postgres:16 | Database | 350 MB |
| redis:7 | Cache | 110 MB |
| prometheus | Metrics | 220 MB |
| node-exporter | Host metrics | 25 MB |
| dcgm-exporter | GPU metrics | 450 MB |
| cadvisor | Container metrics | 250 MB |
| **Total** | | **~14-19 GB** |

### Compression Ratios

- **Uncompressed**: 14-19 GB
- **gzip (.tar.gz)**: ~8-12 GB (40-50% reduction)
- **xz (.tar.xz)**: ~6-9 GB (50-60% reduction, slower)

### Model Files

Model files are separate from Docker images:

| Model | Quantization | Approximate Size |
|-------|-------------|-----------------|
| Llama-3-8B | FP16 | ~16 GB |
| Llama-3-70B | FP16 | ~140 GB |
| GPT-OSS-120B | Q8_0 | ~120 GB |
| Mistral-7B | Q4_K_M | ~4 GB |

---

## Common Scenarios

### Scenario 1: Initial Offline Deployment

**Situation**: First-time deployment in air-gapped environment

**Steps**:
1. Prepare offline package (online)
2. Transfer everything
3. Load images
4. Configure offline mode
5. Deploy

**Timeline**: 1-2 hours (plus transfer time)

---

### Scenario 2: Adding New Model (Offline)

**Situation**: Want to add a new model to existing offline Cortex

**Steps**:
```bash
# Model files already in /var/cortex/models
# Docker images already cached
# Just configure via web UI:

1. Login to Cortex UI (http://<host-ip>:3001)
2. Navigate to Models page
3. Click "Add Model"
4. Select "Offline" mode
5. Choose model folder
6. Configure and Start
```

**No internet required** - uses existing cached images!

---

### Scenario 3: Updating to Newer vLLM Version

**Situation**: New vLLM version released, want to update

**Steps**:
```bash
# On online machine
export VLLM_VERSION=v0.7.0  # New version
make prepare-offline

# Transfer cortex-offline-images/ to offline machine

# On offline machine
make load-offline
make verify-offline

# Update config
echo "VLLM_IMAGE=vllm/vllm-openai:v0.7.0" >> backend/.env

# Restart
make restart
```

---

## API Reference

### Check Image Cache Status

```bash
# Get Docker image cache status
curl http://localhost:8084/admin/system/docker-images \
  -H "Cookie: cortex_session=admin" \
  | jq .
```

**Response**:
```json
{
  "offline_mode": true,
  "offline_ready": true,
  "engines": {
    "vllm": {
      "image": "vllm/vllm-openai:v0.6.3",
      "cached": true,
      "size_mb": 10240.5,
      "created": "2024-09-15T10:30:00Z"
    },
    "llamacpp": {
      "image": "ghcr.io/ggml-org/llama.cpp:server-cuda",
      "cached": true,
      "size_mb": 4096.2,
      "created": "2024-09-10T08:15:00Z"
    }
  },
  "infrastructure": [...],
  "summary": {
    "critical_images_cached": true,
    "total_images_checked": 11,
    "cached_count": 11
  },
  "recommendations": [
    "✓ All critical images cached. System is ready for offline operation."
  ]
}
```

---

### Deployment Job Management

Cortex maintains job history for deployment operations:

```bash
# Get current/latest job status
curl http://localhost:8084/admin/deployment/status -b /tmp/cookies.txt | jq .

# List recent jobs (last 20)
curl http://localhost:8084/admin/deployment/jobs -b /tmp/cookies.txt | jq .

# Get specific job by ID
curl http://localhost:8084/admin/deployment/jobs/{job_id} -b /tmp/cookies.txt | jq .

# Cancel a running job
curl -X DELETE http://localhost:8084/admin/deployment/jobs/{job_id} -b /tmp/cookies.txt | jq .
```

**Job Types**: `export`, `model_export`, `db_restore`

**Job Statuses**: `pending`, `running`, `completed`, `failed`, `cancelled`

---

### Disk Space Estimation

Before starting a large export, estimate the required space:

```bash
curl -X POST http://localhost:8084/admin/deployment/estimate-size \
  -H "Content-Type: application/json" \
  -b /tmp/cookies.txt \
  -d '{
    "output_dir": "/var/cortex/exports",
    "include_images": true,
    "include_db": true,
    "tar_models": true,
    "tar_hf_cache": false
  }' | jq .
```

**Response**:
```json
{
  "estimated_bytes": 45000000000,
  "estimated_formatted": "41.9 GB",
  "breakdown": {
    "docker_images": "6.0 GB",
    "database": "10.0 MB",
    "models": "35.8 GB"
  },
  "disk_space": {
    "sufficient": true,
    "available_bytes": 800000000000,
    "available_formatted": "745.1 GB",
    "required_bytes": 54000000000,
    "required_formatted": "50.3 GB",
    "safety_margin": 1.2
  }
}
```

---

### HF Token Handling on Import

When importing models that originally had HuggingFace tokens configured:

1. Tokens are redacted during export for security
2. Import warnings indicate if a token was present
3. After import, configure the token in **Admin → Models → Edit**

**Import dry-run response**:
```json
{
  "dry_run": true,
  "warnings": [
    "⚠️ HF_TOKEN REQUIRED: This model had an HF token configured which was redacted for security. After import, go to Admin → Models → Edit and add your Hugging Face token."
  ],
  "can_import": true
}
```

---

## Configuration Reference

### backend/.env (Offline Mode)

```bash
# Offline/Air-gapped Configuration
OFFLINE_MODE=True                    # Prevent all internet access for images
OFFLINE_MODE_AUTO_DETECT=False       # Disable auto-detection
REQUIRE_IMAGE_PRECACHE=True          # Strict: only cached images allowed
IMAGE_PULL_TIMEOUT=600               # Not used in offline mode

# Docker Images (must match cached versions)
VLLM_IMAGE=vllm/vllm-openai:v0.6.3
LLAMACPP_IMAGE=ghcr.io/ggml-org/llama.cpp:server-cuda

# Model storage (offline models)
CORTEX_MODELS_DIR=/var/cortex/models
CORTEX_MODELS_DIR_HOST=/var/cortex/models
```

### backend/.env (Online with Fallback)

```bash
# Online mode with offline fallback
OFFLINE_MODE=False                   # Allow image pulls
OFFLINE_MODE_AUTO_DETECT=True        # Auto-detect if network unavailable
REQUIRE_IMAGE_PRECACHE=False         # Pull if needed

# Docker Images
VLLM_IMAGE=vllm/vllm-openai:v0.6.3
LLAMACPP_IMAGE=ghcr.io/ggml-org/llama.cpp:server-cuda
```

---

## Compliance & Auditing

### For Regulated Environments

**Image Provenance Documentation**:

Create a provenance record for audit trails:

```bash
# Generate image manifest with hashes
docker images --format "{{.Repository}}:{{.Tag}}" | while read img; do
  echo "Image: $img"
  docker image inspect $img --format '  ID: {{.Id}}'
  docker image inspect $img --format '  Created: {{.Created}}'
  docker image inspect $img --format '  Size: {{.Size}}'
  echo ""
done > image-provenance.txt
```

**Security Scanning** (perform on online machine before transfer):

```bash
# Scan images for vulnerabilities
docker scan vllm/vllm-openai:v0.6.3 > vllm-scan-report.txt
docker scan ghcr.io/ggml-org/llama.cpp:server-cuda > llamacpp-scan-report.txt

# Include scan reports in transfer package
```

**Change Control**:

Maintain records of:
- Image versions deployed
- Transfer date and method
- Verification results (checksums)
- Approval signatures
- Deployment notes

---

## Performance Considerations

### Offline vs Online Comparison

| Metric | Online Mode | Offline Mode |
|--------|------------|--------------|
| **First model start** | 10-20 min (image pull + start) | 30-60 sec (start only) |
| **Subsequent starts** | 30-60 sec (cached) | 30-60 sec (cached) |
| **Deployment reliability** | Depends on network | 100% reliable |
| **Storage required** | Minimal (~2 GB cache) | ~20-25 GB (full cache) |

**Conclusion**: Offline mode is actually **faster** and **more reliable** after initial setup!

---

## Disaster Recovery

### Backing Up Image Cache

```bash
# Backup Docker image cache
mkdir -p backups/docker-images
docker save $(docker images --format "{{.Repository}}:{{.Tag}}") \
  -o backups/docker-images/all-images-backup.tar

# Or backup specific images
docker save vllm/vllm-openai:v0.6.3 \
  -o backups/docker-images/vllm-v0.6.3-backup.tar
```

### Restoring from Backup

```bash
# Restore all images
docker load -i backups/docker-images/all-images-backup.tar

# Or restore specific image
docker load -i backups/docker-images/vllm-v0.6.3-backup.tar
```

### Database Backup and Restore

Cortex provides built-in database backup and restore capabilities for migration and disaster recovery.

#### Exporting Database (via API)

```bash
# Full deployment export (includes database dump)
curl -X POST http://localhost:8084/admin/deployment/export \
  -H "Cookie: cortex_session=admin" \
  -H "Content-Type: application/json" \
  -d '{
    "output_dir": "/var/cortex/exports",
    "include_db": true,
    "include_configs": true,
    "include_models_manifest": true
  }'
```

This creates a `db/cortex.sql` file in the output directory containing a full PostgreSQL dump.

#### Restoring Database (via API)

```bash
# Restore database from dump file
curl -X POST http://localhost:8084/admin/deployment/restore-database \
  -H "Cookie: cortex_session=admin" \
  -H "Content-Type: application/json" \
  -d '{
    "output_dir": "/var/cortex/exports",
    "backup_first": true,
    "drop_existing": true
  }'
```

**Parameters:**
- `output_dir`: Directory containing the `db/cortex.sql` dump file
- `backup_first`: Create a safety backup before restore (default: true)
- `drop_existing`: Drop existing tables before restore for a clean slate (default: false)

**⚠️ Warning**: Database restore with `drop_existing: true` will **permanently delete** all existing data. Always enable `backup_first` unless you're certain.

#### Restore via Admin UI

1. Navigate to **Admin → Deployment**
2. In the **Database Restore** section (red card):
   - Set the import directory path
   - Optionally change the dump file path (default: `db/cortex.sql`)
   - Click **Restore Database**
3. Monitor progress in the deployment status panel

#### Safety Backups

When `backup_first: true`, Cortex automatically creates a backup at:
```
{output_dir}/db/pre_restore_backup/cortex_backup_{timestamp}.sql
```

To restore from a safety backup:
```bash
curl -X POST http://localhost:8084/admin/deployment/restore-database \
  -H "Cookie: cortex_session=admin" \
  -H "Content-Type: application/json" \
  -d '{
    "output_dir": "/var/cortex/exports",
    "db_file": "db/pre_restore_backup/cortex_backup_1234567890.sql",
    "backup_first": false,
    "drop_existing": true
  }'
```

#### Manual Database Operations

For advanced scenarios, you can use PostgreSQL tools directly:

```bash
# Connect to database container
docker exec -it cortex-postgres-1 psql -U cortex -d cortex

# Manual backup
docker exec cortex-postgres-1 pg_dump -U cortex cortex > backup.sql

# Manual restore (drop existing first)
docker exec -i cortex-postgres-1 psql -U cortex -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker exec -i cortex-postgres-1 psql -U cortex cortex < backup.sql
```

#### PostgreSQL 16 Compatibility Notes

Cortex uses PostgreSQL 16, which includes `\restrict` and `\unrestrict` commands in `pg_dump` output. These are session-based security features that can cause issues when restoring to a different PostgreSQL instance.

**Automatic handling:** The restore-database API automatically strips these commands, ensuring compatibility across different PostgreSQL 16 instances.

**Manual restore:** If restoring manually, strip these commands first:

```bash
# Strip \restrict commands for cross-instance compatibility
sed -i '/^\\restrict/d;/^\\unrestrict/d' backup.sql

# Then restore
docker exec -i cortex-postgres-1 psql -U cortex cortex < backup.sql
```

---

## Advanced: Image Layer Deduplication

### Understanding Docker Layers

Docker images are built from layers. Each layer represents a set of filesystem changes (adding files, installing packages, etc.). When you have multiple images that share a common base, they share those base layers.

**How Cortex images share layers:**

```
┌─────────────────────────────────────────────────────────────────┐
│                  vLLM Image (~8-12 GB)                         │
├─────────────────────────────────────────────────────────────────┤
│  vLLM application layer (~3-4 GB)                              │
├─────────────────────────────────────────────────────────────────┤
│  Python dependencies layer (~1-2 GB)                           │
├─────────────────────────────────────────────────────────────────┤
│  CUDA toolkit layer (~3-4 GB)                       ◄── SHARED │
├─────────────────────────────────────────────────────────────────┤
│  Ubuntu base layer (~200 MB)                        ◄── SHARED │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              llama.cpp Image (~3-5 GB)                         │
├─────────────────────────────────────────────────────────────────┤
│  llama.cpp application layer (~1-2 GB)                         │
├─────────────────────────────────────────────────────────────────┤
│  CUDA toolkit layer (~3-4 GB)                       ◄── SHARED │
├─────────────────────────────────────────────────────────────────┤
│  Ubuntu base layer (~200 MB)                        ◄── SHARED │
└─────────────────────────────────────────────────────────────────┘
```

Both vLLM and llama.cpp images typically share:
- **Ubuntu/Debian base layer** (~200 MB)
- **CUDA toolkit layer** (~3-4 GB)
- **Common system libraries**

### Current Export Behavior

When using `make prepare-offline`, each image is saved independently:

```bash
docker save vllm/vllm-openai:latest -o vllm-openai-latest.tar
docker save ghcr.io/ggml-org/llama.cpp:server-cuda -o llamacpp-server-cuda.tar
```

**Result:** Shared layers are duplicated across tar files.

| File | Size | Notes |
|------|------|-------|
| vllm-openai-latest.tar | ~10 GB | Contains full CUDA stack |
| llamacpp-server-cuda.tar | ~4 GB | Contains CUDA stack again (duplicate) |
| **Total** | **~14 GB** | ~3-4 GB duplicated |

### Optimized Export: Combined Save

Docker's `save` command can export multiple images to a single tar file, automatically deduplicating shared layers:

```bash
# Optimized: save both images to one tar file
docker save vllm/vllm-openai:latest ghcr.io/ggml-org/llama.cpp:server-cuda \
  -o cortex-engines-combined.tar
```

**Result:** Shared layers are stored once.

| File | Size | Savings |
|------|------|---------|
| cortex-engines-combined.tar | ~11 GB | ~3 GB saved |

### Estimated Space Savings

| Image Combination | Independent | Combined | Savings |
|-------------------|-------------|----------|---------|
| vLLM + llama.cpp | ~14 GB | ~11 GB | ~20-25% |
| vLLM + llama.cpp + infra | ~16 GB | ~12 GB | ~25% |
| Multiple vLLM versions (v0.6.3, v0.7.0) | ~20 GB | ~14 GB | ~30% |

**Note:** Actual savings depend on how images were built. Images from the same maintainer or built on similar base images will share more layers.

### Using Combined Saves

#### Manual Combined Export

```bash
# Navigate to offline images directory
cd cortex-offline-images

# Export engine images together (largest savings)
docker save \
  vllm/vllm-openai:latest \
  ghcr.io/ggml-org/llama.cpp:server-cuda \
  -o engines-combined.tar

# Export infrastructure images together
docker save \
  postgres:16 \
  redis:7 \
  prom/prometheus:v2.47.0 \
  prom/node-exporter:v1.6.1 \
  -o infrastructure-combined.tar

# Generate checksums
sha256sum engines-combined.tar infrastructure-combined.tar > checksums.sha256
```

#### Loading Combined Images

```bash
# Combined tar files load the same way
docker load -i engines-combined.tar
docker load -i infrastructure-combined.tar

# All images from the combined tar are now available
docker images | grep -E "vllm|llama"
```

### Trade-offs

| Approach | Pros | Cons |
|----------|------|------|
| **Independent saves** (default) | - Simpler to manage<br>- Can update one image without re-exporting others<br>- Easier to debug | - Larger total size<br>- More transfer time |
| **Combined saves** | - Smaller total size<br>- Faster transfer<br>- Less disk space needed | - Must re-export all images to update one<br>- Harder to identify issues with specific images |

### Recommendations

**Use independent saves (default) when:**
- You have plenty of storage and bandwidth
- You frequently update individual images
- You want simpler troubleshooting
- You're transferring via fast networks or local drives

**Use combined saves when:**
- Storage or bandwidth is constrained
- You're doing a full migration (all images at once)
- Transfer is over slow networks or physical media
- You're creating a "golden" offline package for multiple deployments

### Verifying Layer Sharing

To check if your images share layers:

```bash
# List layers in each image
docker image inspect vllm/vllm-openai:latest --format '{{.RootFS.Layers}}' | tr ',' '\n' | wc -l
docker image inspect ghcr.io/ggml-org/llama.cpp:server-cuda --format '{{.RootFS.Layers}}' | tr ',' '\n' | wc -l

# Find common layers
comm -12 \
  <(docker image inspect vllm/vllm-openai:latest --format '{{.RootFS.Layers}}' | tr ' ' '\n' | sort) \
  <(docker image inspect ghcr.io/ggml-org/llama.cpp:server-cuda --format '{{.RootFS.Layers}}' | tr ' ' '\n' | sort)
```

### Script for Optimized Export

For frequent deployments, you can use this helper script:

```bash
#!/bin/bash
# scripts/prepare-offline-optimized.sh

OUTPUT_DIR="${1:-cortex-offline-images}"
mkdir -p "$OUTPUT_DIR"

echo "=== Exporting Engine Images (combined) ==="
docker save \
  vllm/vllm-openai:${CORTEX_VLLM_VERSION:-latest} \
  ghcr.io/ggml-org/llama.cpp:${CORTEX_LLAMACPP_TAG:-server-cuda} \
  -o "$OUTPUT_DIR/engines-combined.tar"

echo "=== Exporting Infrastructure Images (combined) ==="
docker save \
  postgres:16 \
  redis:7 \
  prom/prometheus:v2.47.0 \
  -o "$OUTPUT_DIR/infrastructure-combined.tar"

echo "=== Generating checksums ==="
cd "$OUTPUT_DIR"
sha256sum *.tar > checksums.sha256

echo "=== Done ==="
du -sh *.tar
```

---

## Multi-Machine Deployment

### Using Local Registry (Recommended)

For deploying Cortex on multiple machines in an offline network:

**Setup** (on one offline machine):

```bash
# Load registry image
docker load -i cortex-offline-images/registry-2.tar

# Start local registry
docker run -d -p 5000:5000 --restart=always \
  --name local-registry \
  -v /var/lib/docker-registry:/var/lib/registry \
  registry:2

# Populate registry with all images
for tar in cortex-offline-images/*.tar; do
    docker load -i "$tar"
done

# Tag and push to local registry
docker tag vllm/vllm-openai:v0.6.3 <registry-ip>:5000/vllm-openai:v0.6.3
docker push <registry-ip>:5000/vllm-openai:v0.6.3

docker tag ghcr.io/ggml-org/llama.cpp:server-cuda <registry-ip>:5000/llamacpp:server-cuda
docker push <registry-ip>:5000/llamacpp:server-cuda
```

**On other machines**:

```bash
# Configure to use local registry
echo "VLLM_IMAGE=<registry-ip>:5000/vllm-openai:v0.6.3" >> backend/.env
echo "LLAMACPP_IMAGE=<registry-ip>:5000/llamacpp:server-cuda" >> backend/.env
echo "OFFLINE_MODE=False" >> backend/.env  # Can use online mode with local registry

# Start Cortex
make quick-start
```

---

## FAQ

### Q: Can I use Cortex completely offline?

**A**: Yes! After loading the Docker image package, Cortex can operate completely offline. You only need internet to:
1. Download the initial offline package (once)
2. Update to newer versions (periodically)

### Q: How much storage do I need?

**A**: Minimum ~25-30 GB:
- Docker images: ~15-20 GB
- Model files: Varies (e.g., 120 GB for GPT-OSS 120B)
- Database: 1-5 GB (grows with usage)
- Logs: 1-2 GB

### Q: Can I delete tar files after loading?

**A**: Yes, but keep them for disaster recovery:
```bash
# After successful load and verification
mkdir -p backups/offline-package-YYYYMMDD
mv cortex-offline-images/ backups/offline-package-YYYYMMDD/
```

### Q: What if model containers can't communicate with the gateway?

**A**: Model containers must be on the same Docker network as the gateway (typically `cortex_default`). Cortex automatically:
1. Checks if the network exists before starting model containers
2. Creates the network if missing (with a warning)
3. Falls back to Docker's default bridge network if creation fails

If you're having connectivity issues:
```bash
# Verify network exists
docker network ls | grep cortex_default

# If missing, restart Cortex (this creates the network)
make restart

# Manually check network connectivity
docker exec -it cortex-gateway-1 curl -s http://<model-container-name>:8000/health
```

### Q: What if I need a different vLLM version?

**A**: Update the package preparation:
```bash
# On online machine
export VLLM_VERSION=v0.7.0
make prepare-offline
# Transfer and load as before
```

### Q: Do model files need to be included in offline package?

**A**: No - model files are separate. Transfer them independently to `/var/cortex/models`:
```bash
# Example: Transfer GPT-OSS 120B
cp -r /online-storage/gpt-oss-120b/ /var/cortex/models/
```

### Q: Can I mix offline and online modes?

**A**: Yes! Use `OFFLINE_MODE_AUTO_DETECT=True`:
- When online: Pulls images automatically
- When offline: Uses cached images only
- Best of both worlds for intermittent connectivity

---

## Support & Resources

### Documentation
- `OFFLINE_CAPABILITY_ANALYSIS.md` - Technical analysis
- `README.md` - Quick start guide
- `Makefile` - Run `make help` for commands

### Scripts
- `scripts/prepare-offline-deployment.sh` - Create offline package
- `scripts/load-offline-deployment.sh` - Load package
- `scripts/verify-offline-images.sh` - Verify readiness

### Commands
```bash
make prepare-offline   # Prepare package (online machine)
make load-offline      # Load package (offline machine)
make verify-offline    # Verify readiness
make offline-status    # Check current status
```

---

## Conclusion

Cortex's offline deployment capability enables:

✅ **True air-gapped operation** - No internet dependency  
✅ **Fast deployments** - No download wait times  
✅ **Predictable behavior** - Pinned versions  
✅ **High security** - No external dependencies  
✅ **Compliance ready** - Meets strict regulatory requirements  

The offline workflow is production-ready and tested for environments requiring maximum isolation and security.

