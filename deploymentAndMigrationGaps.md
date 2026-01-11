# Deployment & Migration Gaps Analysis

**Date**: 2026-01-11  
**Analyst**: AI Review with End-to-End Testing  
**Test Environment**: RTX 3060 Laptop (6GB VRAM), Ubuntu Linux

---

## Test Environment

### Available Test Models
Located in `/var/cortex/models/`:
| Model | Type | Size | Use Case |
|-------|------|------|----------|
| `alamios_Mistral-Small-3.1-DRAFT-0.5B-GGUF` | GGUF | ~0.5B | GGUF/offline testing, speculative decoding draft |
| `Qwen3-0.6B` | SafeTensors | ~0.6B | Standard vLLM testing |
| `Qwen3-1.7B` | SafeTensors | ~1.7B | vLLM testing |

### Hardware Constraints
- **GPU:** NVIDIA GeForce RTX 3060 (Laptop)
- **VRAM:** 6144 MiB total (~5GB usable)
- **Driver:** 580.95.05
- **CUDA:** 13.0

**Implications:**
- Must use small models only (< 3B parameters)
- Set `gpu_memory_utilization` to 0.7-0.8
- No multi-GPU testing possible
- Use `--enforce-eager` to reduce memory overhead
- Flash Attention 2 NOT supported (requires SM 80+, RTX 3060 is SM 86 but laptop variant may have issues)

### Scripts
- **MAKEFILE**: Use our makefile scripts to do things like clearing out the database if schema changes are necessary (`make clean-all`) or rebuilding the application to pick up new code (`make quick-start`)

---

## Executive Summary

After comprehensive analysis of the deployment and migration system including:
- Docker container export/import best practices research
- PostgreSQL backup/restore patterns
- vLLM/llama.cpp deployment patterns
- End-to-end testing of export/import workflow

**Testing Performed:**
- ✅ Single model export (manifest only) - PASSED
- ✅ Full deployment export (DB + configs + manifests) - PASSED  
- ✅ Model import with conflict renaming - PASSED
- ✅ Verify-offline-images script - PASSED (with version warnings)
- ⚠️ Database restore - NOT IMPLEMENTED
- ⚠️ Image tar integrity verification - NOT IMPLEMENTED

---

## Priority Legend
- **P0 (Critical)**: Blocks offline deployment, causes data loss, or security issue
- **P1 (High)**: Significant UX/reliability issue, workaround exists
- **P2 (Medium)**: Nice-to-have improvement, minor inconvenience
- **P3 (Low)**: Enhancement, optimization, or documentation gap

---

## P0 - Critical Gaps (Blockers)

### GAP-D1: No Database Restore Mechanism
**Status**: 🔴 NOT IMPLEMENTED

**Description:**  
The deployment export creates a `pg_dump` at `/var/cortex/exports/db/cortex.sql`, but there is **no corresponding import/restore functionality**. Administrators must manually restore the database, which is error-prone and undocumented.

**Current Behavior:**
```bash
# Export works:
curl -X POST /admin/deployment/export -d '{"include_db": true}' # Creates db/cortex.sql

# No import endpoint or script exists
```

**Risk:** Without database restore, migration loses:
- All model configurations
- API keys
- Users/orgs
- Usage metrics
- ConfigKV settings

**Acceptance Criteria:**
- [ ] `POST /admin/deployment/import-db` endpoint exists
- [ ] Endpoint accepts `output_dir` parameter pointing to export directory
- [ ] Pre-restore validation checks PostgreSQL version compatibility
- [ ] Option to `--drop-existing` or `--merge` data
- [ ] Progress reporting via job status API
- [ ] Backup of existing DB before restore (safety net)
- [ ] Documentation in `docs/operations/offline-deployment.md`

**Testing Steps:**
1. Export full deployment with DB
2. `make clean` to reset database
3. `make up` to start fresh instance
4. Call import-db endpoint
5. Verify all models, users, keys restored
6. Verify model can start and serve requests

**Recommended Implementation:**
```python
# backend/src/services/deployment_manager.py
async def import_database_from_dump(
    output_dir: str,
    drop_existing: bool = False,
    backup_first: bool = True,
) -> dict:
    """Restore database from pg_dump export."""
    ...
```

---

### GAP-D2: Version Mismatch Between Scripts and Config
**Status**: 🔴 INCONSISTENT

**Description:**  
Critical version mismatch between offline preparation scripts and runtime config:

| Source | vLLM Version | llama.cpp Tag |
|--------|--------------|---------------|
| `config.py` | `latest` | `server-cuda` |
| `verify-offline-images.sh` | `v0.6.3` | `server-cuda` |
| `prepare-offline-deployment.sh` | `latest` (default) | `server-cuda` |
| `_collect_images_to_export()` | Uses runtime config | Uses runtime config |

**Risk:**
- Verify script will FAIL on fresh installs using "latest"
- Offline package may not include images actually needed
- Version drift causes "image not found" errors

**Acceptance Criteria:**
- [ ] Single source of truth for engine image versions
- [ ] `verify-offline-images.sh` reads versions from config or env
- [ ] `prepare-offline-deployment.sh` accepts VERSION env vars
- [ ] Documentation warns about version pinning for reproducibility
- [ ] CI test validates version consistency

**Testing Steps:**
1. Set `VLLM_IMAGE=vllm/vllm-openai:v0.8.0` in `.env`
2. Run `make verify-offline` - should check for v0.8.0
3. Run `make prepare-offline` - should pull v0.8.0
4. Verify consistency between all scripts

**Recommended Fix:**
```bash
# verify-offline-images.sh - read from config
VLLM_VERSION=${VLLM_IMAGE##*:}  # Extract tag from full image name
VLLM_VERSION=${VLLM_VERSION:-"latest"}
```

---

### GAP-D3: No Checksum/Integrity Verification for Exports
**Status**: 🔴 NOT IMPLEMENTED

**Description:**  
Exported tar files (Docker images, model archives) have no SHA256 checksums. This is a **security and reliability gap** for air-gapped environments where tampered files could go undetected.

**Risk:**
- Corrupted transfers undetected
- Tampered images in secure environments (DoD, ITAR violation)
- Silent failures when loading corrupted tars

**Acceptance Criteria:**
- [ ] `manifest.json` includes SHA256 hash for each tar file
- [ ] `prepare-offline-deployment.sh` generates checksums
- [ ] `load-offline-deployment.sh` verifies checksums before loading
- [ ] Export job generates checksums for all artifacts
- [ ] UI displays checksum verification status

**Testing Steps:**
1. Run full export
2. Verify `manifest.json` contains `sha256` fields
3. Corrupt a tar file (truncate)
4. Run load script - should FAIL with checksum mismatch
5. Load with `--skip-verify` flag (optional override)

**Recommended Implementation:**
```json
// manifest.json addition
{
  "images": [
    {
      "file": "vllm-openai-latest.tar",
      "sha256": "abc123...",
      "size_bytes": 10234567890
    }
  ]
}
```

```bash
# load-offline-deployment.sh addition
verify_checksum() {
    local file="$1"
    local expected="$2"
    local actual=$(sha256sum "$file" | cut -d' ' -f1)
    [ "$actual" = "$expected" ]
}
```

---

## P1 - High Priority Gaps

### GAP-D4: No Image Load Verification After Import
**Status**: 🟠 PARTIAL

**Description:**  
After running `make load-offline`, images are loaded but there's no verification that:
1. All expected images from manifest were successfully loaded
2. Loaded images match expected tags
3. Images are functional (not corrupted layers)

**Current Behavior:**
```bash
make load-offline  # Loads images
# No verification that vllm/vllm-openai:latest actually exists after load
```

**Acceptance Criteria:**
- [ ] `load-offline-deployment.sh` verifies each loaded image exists
- [ ] Compare loaded image digests against manifest
- [ ] Report which images succeeded/failed
- [ ] Exit with non-zero if critical images missing

**Testing Steps:**
1. Run `make load-offline` 
2. Verify script confirms each image loaded successfully
3. Delete an image manually: `docker rmi postgres:16`
4. Run verify - should detect missing image

---

### GAP-D5: Database Dump Contains Session/Security Artifacts  
**Status**: 🟠 POTENTIAL ISSUE

**Description:**  
The `pg_dump` output includes a `\restrict` command with what appears to be a session key:
```sql
\restrict 8gLfjyZFAqak5zZZpqxhba5e4dxadDHiHMlcL7NOYCW0Tqv1TRUaPUL2gtCqVdD
```

This may cause issues when restoring on a different PostgreSQL instance or leak session information.

**Acceptance Criteria:**
- [ ] Investigate what `\restrict` does (PostgreSQL extension?)
- [ ] Determine if this blocks restore on vanilla PostgreSQL
- [ ] Strip or document security implications
- [ ] Test restore on fresh PostgreSQL container

**Testing Steps:**
1. Export database
2. Spin up fresh PostgreSQL container
3. Attempt restore: `psql < cortex.sql`
4. Document any errors related to `\restrict`

---

### GAP-D6: No Dry-Run/Validation for Model Import
**Status**: 🟠 NOT IMPLEMENTED

**Description:**  
The import endpoint immediately creates a model record without previewing:
- What will be created
- What conflicts exist
- Whether local_path exists on disk
- Whether engine image is available

**Acceptance Criteria:**
- [ ] `POST /admin/deployment/import-model?dry_run=true` returns preview
- [ ] Preview shows: new model config, conflicts, warnings
- [ ] Validates `local_path` exists before import
- [ ] Validates engine image availability
- [ ] UI shows preview before confirming import

**Testing Steps:**
1. Call import with `dry_run=true`
2. Verify response shows what would be created
3. Verify response shows any conflicts
4. Confirm no database changes made

---

### GAP-D7: Model Container Network Fallback Not Verified
**Status**: 🟠 UNTESTED

**Description:**  
Model containers are hard-coded to join `cortex_default` network:
```python
host_config_kwargs["network"] = "cortex_default"
```

If this network doesn't exist (e.g., renamed compose project), containers may fail to communicate with gateway.

**Acceptance Criteria:**
- [ ] Verify network exists before container creation
- [ ] Create network if missing (with warning)
- [ ] Fallback to bridge network with documented behavior
- [ ] Test container-to-gateway communication post-import

**Testing Steps:**
1. Delete `cortex_default` network: `docker network rm cortex_default`
2. Start a model
3. Verify error handling or fallback behavior
4. Test model health endpoint reachable from gateway

---

## P2 - Medium Priority Gaps

### GAP-D8: Single Export Job Queue
**Status**: 🟡 LIMITATION

**Description:**  
Only one deployment job can run at a time. Subsequent requests return current job status:
```python
if _JOB and _JOB.status in ("running", "pending"):
    return _job_to_dict(_JOB)
```

**Impact:** Cannot export multiple models in parallel, no job history.

**Acceptance Criteria:**
- [ ] Support concurrent export jobs (or queue)
- [ ] Job history endpoint: `GET /admin/deployment/jobs`
- [ ] Cancel job endpoint: `DELETE /admin/deployment/jobs/{id}`

---

### GAP-D9: No Progress Estimation for Large Exports
**Status**: 🟡 PARTIAL

**Description:**  
Progress is best-effort without real size tracking:
```python
set_step("archiving_models", 0.70)  # Hard-coded progress values
```

**Impact:** Large exports (100GB+ models) show misleading progress.

**Acceptance Criteria:**
- [ ] Estimate total size before export
- [ ] Report bytes written vs estimated
- [ ] ETA calculation for large archives

---

### GAP-D10: No HF Token Guidance on Import
**Status**: 🟡 DOCUMENTATION GAP

**Description:**  
Exported manifests redact `hf_token` for security, but there's no guidance on:
- How to re-provide tokens after import
- Which models need tokens
- Private model access requirements

**Acceptance Criteria:**
- [ ] Import response warns if model had token redacted
- [ ] Documentation explains token re-configuration
- [ ] UI prompt for token when starting imported model needing auth

---

### GAP-D11: Export Doesn't Validate Disk Space
**Status**: 🟡 NOT IMPLEMENTED

**Description:**  
Export can fail mid-way if disk runs out of space. No pre-check for available space.

**Acceptance Criteria:**
- [ ] Estimate required space before export
- [ ] Check available disk space
- [ ] Warn or fail early if insufficient space
- [ ] Cleanup partial exports on failure

---

## P3 - Low Priority Gaps (Enhancements)

### GAP-D12: No Incremental Export Support
**Status**: ⚪ ENHANCEMENT

**Description:**  
Full export every time, even if only one model changed. For large deployments, this is wasteful.

**Acceptance Criteria:**
- [ ] Track last export timestamp
- [ ] Export only changed models/configs
- [ ] Incremental tar archives

---

### GAP-D13: Image Layer Deduplication Not Documented
**Status**: ⚪ DOCUMENTATION

**Description:**  
vLLM and llama.cpp images share base layers. Current export saves each image independently, potentially duplicating layers.

**Acceptance Criteria:**
- [ ] Document layer sharing behavior
- [ ] Consider `docker save image1 image2 -o combined.tar` approach
- [ ] Estimate space savings

---

### GAP-D14: No Export/Import CLI Tool
**Status**: ⚪ ENHANCEMENT

**Description:**  
All export/import requires running services and HTTP calls. A standalone CLI would help scripted migrations.

**Acceptance Criteria:**
- [ ] `cortex-migrate export --output-dir /path`
- [ ] `cortex-migrate import --from /path`
- [ ] Works without running gateway (direct DB access)

---

### GAP-D15: Custom Docker Network Config Not Preserved
**Status**: ⚪ EDGE CASE

**Description:**  
If users configure custom Docker networks (e.g., for multi-host deployments), export doesn't capture network configuration.

**Acceptance Criteria:**
- [ ] Export includes network configuration manifest
- [ ] Import recreates custom networks
- [ ] Document network migration requirements

---

## Testing Checklist

### Pre-Migration Testing (Source Environment)
- [ ] All models in `stopped` state
- [ ] Database backup exists: `make db-backup`
- [ ] Export directory has sufficient space (estimate: images + models + 20%)
- [ ] All required engine images cached: `make verify-offline`

### Export Testing
```bash
# 1. Full deployment export (no images for speed)
curl -X POST http://localhost:8084/admin/deployment/export \
  -H "Content-Type: application/json" \
  -d '{"output_dir":"/var/cortex/exports","include_images":false}'

# 2. Wait for completion
curl http://localhost:8084/admin/deployment/status

# 3. Verify artifacts created
docker exec cortex-gateway-1 ls -la /var/cortex/exports/
```

### Import Testing (Simulated Target Environment)
```bash
# 1. Scan available manifests
curl "http://localhost:8084/admin/deployment/model-manifests?output_dir=/var/cortex/exports"

# 2. Import model with conflict renaming
curl -X POST http://localhost:8084/admin/deployment/import-model \
  -H "Content-Type: application/json" \
  -d '{
    "output_dir":"/var/cortex/exports",
    "manifest_file":"model-17.json",
    "conflict_strategy":"rename"
  }'

# 3. Verify imported model
curl http://localhost:8084/admin/models | jq '.[] | select(.name | contains("IMPORTED"))'

# 4. Start imported model
curl -X POST http://localhost:8084/admin/models/{id}/start

# 5. Test model functionality
curl -X POST http://localhost:8084/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"imported-model-name","messages":[{"role":"user","content":"test"}]}'
```

### Full Migration Test (When DB Restore Implemented)
- [ ] Export with all options enabled
- [ ] `make clean` to reset environment  
- [ ] `make load-offline` to restore images
- [ ] Restore database from dump
- [ ] `make up` to start services
- [ ] Verify all models, users, keys present
- [ ] Start a model and verify functionality

---

## Implementation Priority Recommendation

### Sprint 1 (Critical Path)
1. **GAP-D1**: Database restore endpoint
2. **GAP-D2**: Version synchronization
3. **GAP-D3**: Checksum verification

### Sprint 2 (Reliability)
4. **GAP-D4**: Image load verification
5. **GAP-D6**: Dry-run for import
6. **GAP-D7**: Network fallback handling

### Sprint 3 (Polish)
7. **GAP-D5**: Database dump investigation
8. **GAP-D8**: Job queue improvements
9. **GAP-D9**: Progress estimation
10. **GAP-D10**: Token guidance documentation

### Backlog
- GAP-D11 through GAP-D15

---

## References

- [Docker Best Practices for Image Migration](https://docs.docker.com/build/building/best-practices/)
- [PostgreSQL pg_dump Documentation](https://www.postgresql.org/docs/current/app-pgdump.html)
- [vLLM Deployment Guide](https://docs.vllm.ai/en/latest/getting_started/installation.html)
- Internal: `docs/operations/offline-deployment.md`
- Internal: `backend/src/services/deployment_manager.py`
