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
git clone https://github.com/your-org/cortex-vllm.git
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
1. Finds all .tar files in `cortex-offline-images/`
2. Loads each image into Docker's local cache
3. Verifies images loaded successfully
4. Shows summary of cached images

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

1. **Verify checksums** after transfer
   ```bash
   # Generate on online machine
   sha256sum cortex-offline-images/*.tar > checksums.txt
   
   # Verify on offline machine
   sha256sum -c checksums.txt
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

