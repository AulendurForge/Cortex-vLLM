# ADR 001: Never Delete Model Files from Offline Directory

Date: 2025-10-07

## Status
Accepted - CRITICAL SAFETY FIX

## Context

### The Problem

The original `DELETE /admin/models/{model_id}` endpoint automatically deleted model files from the filesystem when a model was removed from Cortex. This caused catastrophic data loss in offline/air-gapped environments:

**Previous Behavior (DANGEROUS):**
```python
# When user clicked "Delete" in UI:
if m.local_path:
    target = os.path.join(base, m.local_path)
    if os.path.isdir(target):
        shutil.rmtree(target, ignore_errors=True)  # ❌ DESTROYS USER'S FILES
```

**Impact:**
- ❌ Model files that users painstakingly transferred into offline environments were permanently deleted
- ❌ In air-gapped deployments, re-downloading is impossible
- ❌ Large models (10-240GB) take hours/days to transfer
- ❌ No recovery mechanism
- ❌ Loss of work and productivity

### Why This Was Unacceptable

1. **Offline Environments Are Special**: In classified/restricted networks, model files cannot be re-downloaded from HuggingFace
2. **Manual Transfer Is Costly**: Users spend hours transferring 10-240GB model files via USB drives or network transfers
3. **Unexpected Behavior**: Users expect "Delete" to remove the model from Cortex, not destroy their files
4. **No Confirmation**: The UI didn't make it clear that files would be deleted
5. **Shared Directories**: Multiple model configurations might reference the same folder

## Decision

**Model files in `/var/cortex/models` must NEVER be automatically deleted by Cortex.**

### New Behavior (SAFE):

```python
# When user clicks "Delete" in UI:
# 1. Stop container (if running)
# 2. Remove database record
# 3. Unregister from routing
# 4. Leave files untouched ✓
```

**Files are preserved on disk** and can be re-added to Cortex at any time without re-transfer.

### Implementation Changes:

1. **Backend** (`backend/src/routes/models.py`):
   - Removed `shutil.rmtree()` calls completely
   - Removed `purge_cache` parameter (was only for HF cache, not offline files)
   - Updated docstring to clarify files are preserved
   - Return message now confirms files are safe

2. **Frontend** (`frontend/app/(admin)/models/page.tsx`):
   - Removed `purgeCache` state variable
   - Simplified delete mutation (no query parameters)
   - Updated confirmation dialog with prominent "✓ Your model files are safe" message
   - Changed button label to "Delete Configuration" for clarity

3. **Documentation** (`docs/api/admin-api.md`):
   - Updated API docs to clarify behavior
   - Added note about files being preserved

## Consequences

### Positive:
- ✅ **Safe by default**: No risk of accidental data loss
- ✅ **Offline-friendly**: Users can experiment with configurations without fear
- ✅ **Reversible**: Models can be re-added instantly
- ✅ **Predictable**: "Delete" means "remove from Cortex", not "destroy files"
- ✅ **Multiple configs**: Users can try different configurations on the same files

### Neutral:
- ⚠️ **Disk space management**: Administrators must manually clean up unused model files
- ⚠️ **Clear communication**: UI now explicitly states files are preserved
- ⚠️ **Documentation**: Admin guides updated to explain manual cleanup

### What Becomes Easier:
- Experimenting with different model configurations
- Testing multiple engine types (vLLM vs llama.cpp) on same files
- Recovering from accidental deletions (just re-add)
- Operating in offline/air-gapped environments

### What Becomes More Difficult:
- Administrators must use `rm -rf /var/cortex/models/folder` to free disk space
- No automated cleanup of unused models (but this is a GOOD trade-off for safety)

## Alternative Considered (and Rejected)

### Option: Opt-in file deletion with `delete_files=true` parameter

**Why rejected:**
- Still too risky - accidents happen
- Users might misunderstand the parameter
- No recovery from mistakes in offline environments
- Better to require explicit manual filesystem operations

## Manual Cleanup Guidance

**For administrators who need to free disk space:**

```bash
# 1. List model files
ls -lh /var/cortex/models/

# 2. Identify unused models (not in Cortex DB)
# Check Models page in UI to see what's registered

# 3. Manually delete unwanted folders
rm -rf /var/cortex/models/old-model-folder

# 4. Verify
ls -lh /var/cortex/models/
```

## Security Implications

This change **improves** security:
- Prevents accidental data loss
- Requires explicit filesystem access for deletion (privilege separation)
- Aligns with principle of least surprise
- Reduces attack surface (malicious deletion via API is no longer possible)

## Rollout Notes

**Breaking Change:** No - this makes the system safer

**Migration Required:** No - existing deployments become safer automatically

**User Impact:** Positive - users gain protection against accidental deletion

## Related Documentation

- `docs/models/model-management.md` - Model lifecycle
- `docs/operations/backup-restore.md` - Data management
- `docs/getting-started/admin-setup.md` - Admin workflows

## Validation

**Before fix:**
```bash
# User deletes model from UI
# Result: Files destroyed ❌
# Recovery: Impossible in offline environment ❌
```

**After fix:**
```bash
# User deletes model from UI
# Result: DB entry removed, files preserved ✓
# Recovery: Re-add model, instant ✓
```

## Conclusion

**Model files are precious, especially in offline environments. Cortex must protect them at all costs.**

This ADR establishes the principle that **Cortex manages model containers and database records, but does not own or delete model files**. Files are the administrator's responsibility and must be managed through explicit filesystem operations.
