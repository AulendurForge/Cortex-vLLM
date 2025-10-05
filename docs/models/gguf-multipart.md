# Multi-Part GGUF Files in Cortex

**Date**: October 5, 2025  
**Status**: Production Implementation

---

## Overview

Large GGUF models (e.g., GPT-OSS 120B) are often distributed as **multi-part files** due to file size limits on platforms like HuggingFace. Cortex automatically handles these split files without requiring manual merging.

**Example multi-part naming**:
```
Q4_K_M-GGUF-00001-of-00009.gguf
Q4_K_M-GGUF-00002-of-00009.gguf
...
Q4_K_M-GGUF-00009-of-00009.gguf
```

---

## How Cortex Handles Multi-Part GGUFs

### Automatic Split Loading (Current Implementation)

**Cortex uses llama.cpp's native split-file support:**

1. **Detection**: Backend detects multi-part pattern when starting a model
2. **Validation**: Verifies all expected parts exist in the directory
3. **Selection**: Points llama.cpp to the **first part** (`-00001-of-xxxxx.gguf`)
4. **Auto-Loading**: llama.cpp automatically detects and loads remaining parts
5. **No Merge Required**: Model loads directly from split files

**Benefits**:
- ✅ No manual merge step required
- ✅ No additional disk space needed (no merged copy)
- ✅ Faster model startup (no merge time)
- ✅ Works with any number of parts
- ✅ Native llama.cpp behavior

**Code Location**: `backend/src/routes/models.py:404-474` (`_handle_multipart_gguf_merge`)

---

## User Workflow

### Adding a Multi-Part GGUF Model

**Step 1: Place files in models directory**
```bash
# Example: GPT-OSS 120B Q4_K_M (9 parts)
/var/cortex/models/
└── huihui-ai/
    └── Huihui-gpt-oss-120b-BF16-abliterated/
        └── Q4_K_M-GGUF/
            ├── Q4_K_M-GGUF-00001-of-00009.gguf
            ├── Q4_K_M-GGUF-00002-of-00009.gguf
            ├── Q4_K_M-GGUF-00003-of-00009.gguf
            ├── Q4_K_M-GGUF-00004-of-00009.gguf
            ├── Q4_K_M-GGUF-00005-of-00009.gguf
            ├── Q4_K_M-GGUF-00006-of-00009.gguf
            ├── Q4_K_M-GGUF-00007-of-00009.gguf
            ├── Q4_K_M-GGUF-00008-of-00009.gguf
            └── Q4_K_M-GGUF-00009-of-00009.gguf
```

**Step 2: Create model in Cortex UI**
- Engine: llama.cpp
- Mode: Offline
- Local Path: Browse to any of the split files (or the directory)
- Configure llama.cpp settings (ngl, tensor_split, etc.)

**Step 3: Start model**
- Click "Start"
- Backend detects multi-part pattern
- Validates all 9 parts exist
- Updates `local_path` to point to first part
- Starts llama.cpp container with first part path
- llama.cpp loads all parts automatically

**Step 4: Verify**
- Check logs: Should see "loaded meta data with X key-value pairs" and "additional 8 GGUFs metadata loaded"
- Model state: "running"
- Test endpoint: Click "Test" button or use API

---

## Backend Implementation Details

### Multi-Part Detection

**Pattern Matching**:
```python
# Regex: model-name-00001-of-00009.gguf
multipart_match = re.match(r'(.+)-(\d{5})-of-(\d{5})\.gguf$', filename, re.IGNORECASE)

if multipart_match:
    base_name = multipart_match.group(1)      # "Q4_K_M-GGUF"
    part_number = int(multipart_match.group(2))  # 1
    total_parts = int(multipart_match.group(3))  # 9
```

### Validation

**Before starting the container**:
```python
# Check all expected parts exist
missing = []
for i in range(1, total_parts + 1):
    part_filename = f"{base_name}-{i:05d}-of-{total_parts:05d}.gguf"
    if not os.path.exists(os.path.join(target_dir, part_filename)):
        missing.append(part_filename)

if missing:
    raise Exception(f"Incomplete multi-part GGUF: missing {len(missing)} parts")
```

### Path Resolution

**Docker manager resolves to first part**:
```python
# backend/src/docker_manager.py:_resolve_llamacpp_model_path()
if m.local_path.lower().endswith('.gguf'):
    # Check if sibling multi-part set exists
    parent_dir = os.path.dirname(host_path)
    for name in os.listdir(parent_dir):
        if re.match(r".+-00001-of-\d{5}\.gguf$", name, re.IGNORECASE):
            # Prefer first part so llama.cpp can auto-load rest
            return f"/models/{os.path.relpath(first_part, CORTEX_MODELS_DIR)}"
```

### Legacy Merged Files

**Warning for old concatenated files**:
```python
# Detect legacy merged-*.gguf files from old concat method
legacy_merged = [n for n in os.listdir(target_dir) 
                 if n.lower().endswith('.gguf') and n.startswith('merged-')]
if legacy_merged:
    logger.warning(
        "Detected legacy merged GGUF files: %s (will ignore and use split parts)",
        ", ".join(sorted(legacy_merged))
    )
```

---

## llama.cpp Split-File Support

### How llama.cpp Loads Splits

When you pass the first part to llama-server:
```bash
llama-server -m /models/path/model-00001-of-00009.gguf
```

**llama.cpp automatically**:
1. Detects the split pattern from the filename
2. Searches for remaining parts in the same directory
3. Loads metadata from first part
4. Memory-maps all parts sequentially
5. Treats as a single logical model

**Log Evidence**:
```
llama_model_loader: additional 8 GGUFs metadata loaded.
llama_model_loader: loaded meta data with 37 key-value pairs and 687 tensors
```

### Advantages Over Merging

**Performance**:
- No merge time (saves 5-10 minutes for 120GB models)
- No additional I/O during startup
- Memory-mapping works across all parts

**Disk Space**:
- No duplicate merged file (saves 120GB for GPT-OSS)
- Original splits can be kept for distribution

**Reliability**:
- Native llama.cpp feature (well-tested)
- No risk of corrupt merge
- Simpler code path

---

## Troubleshooting

### "Incomplete multi-part GGUF" Error

**Symptom**: Model fails to start with error about missing parts

**Cause**: Not all split files are present in the directory

**Solution**:
```bash
# Check which parts exist:
ls -lh /var/cortex/models/model-path/*.gguf

# Expected: All parts from 00001 to 0000N
# If missing parts, re-download the complete set
```

### "Invalid split file name" Error

**Symptom**: llama.cpp logs show "error loading model: invalid split file name"

**Cause**: The merged file still contains split metadata (from old concat method)

**Solution**:
```bash
# Remove old merged file and use splits directly:
rm /var/cortex/models/model-path/merged-*.gguf

# Restart model - Cortex will use split files automatically
```

### Model Shows "llamacpp" But Doesn't Appear in Health Page

**Symptom**: Model badge shows correct engine, but health page is empty

**Cause**: Model registry not populated (gateway restart cleared memory)

**Solution**:
```bash
# Restart the model to trigger registration:
# In UI: Click Stop → Click Start
# Or via API:
curl -X POST http://localhost:8084/admin/models/{id}/stop -b cookies.txt
curl -X POST http://localhost:8084/admin/models/{id}/start -b cookies.txt

# Verify registry:
curl http://localhost:8084/admin/upstreams | jq '.registry'
```

### API Calls Return 503 "no_upstreams_available"

**Symptom**: Gateway returns 503 even though model is running

**Cause**: Model not in registry, gateway has no routes

**Solution**:
1. Check model is registered:
   ```bash
   curl http://localhost:8084/v1/models | jq '.data'
   ```
2. If empty, restart the model (see above)
3. Registry should persist across gateway restarts now

---

## Migration from Old Concat Method

### If You Have Legacy Merged Files

**Identifying legacy files**:
```bash
# Look for files named "merged-*.gguf"
find /var/cortex/models -name "merged-*.gguf"
```

**What to do**:
1. **Keep the merged file** if it works (no need to delete)
2. **Or switch to split loading**:
   ```bash
   # Delete merged file
   rm /var/cortex/models/path/merged-Q4_K_M.gguf
   
   # Update model local_path to point to first split
   # In UI: Configure → Local Path → path/Q4_K_M-GGUF-00001-of-00009.gguf
   
   # Restart model
   ```

**Benefits of switching**:
- Saves disk space (no duplicate)
- Uses native llama.cpp feature
- Faster startup (no merge overhead)

---

## Performance Characteristics

### Startup Time Comparison

**Old Method (Concatenation)**:
```
Merge time: 5-10 minutes (120GB model)
+ Load time: 30-60 seconds
= Total: 6-11 minutes
```

**New Method (Split Loading)**:
```
Validation: <1 second (check files exist)
+ Load time: 30-60 seconds
= Total: 30-60 seconds
```

**Improvement**: 10-20x faster startup!

### Runtime Performance

**No performance difference** - llama.cpp memory-maps both merged and split files identically.

**Inference speed**: Same (~8-15 tokens/sec for GPT-OSS 120B Q4_K_M)

---

## Best Practices

### For Administrators

**1. Keep Split Files Organized**:
```bash
# Good structure:
/var/cortex/models/
└── model-name/
    └── Q4_K_M-GGUF/
        ├── Q4_K_M-GGUF-00001-of-00009.gguf
        ├── Q4_K_M-GGUF-00002-of-00009.gguf
        └── ... (all parts together)
```

**2. Verify Completeness Before Adding**:
```bash
# Count parts:
ls /var/cortex/models/model-path/*.gguf | wc -l

# Should match the "of-XXXXX" number in filenames
```

**3. Don't Delete Split Files After "Merging"**:
- Cortex now uses splits directly
- Merged file is unnecessary
- Keep splits for native loading

### For Developers

**1. Registry Persistence**:
- Always persist registry after `register_model_endpoint()`
- Always persist after `unregister_model_endpoint()`
- Ensures routes survive gateway restarts

**2. Multi-Part Detection**:
- Check for pattern: `base-00001-of-NNNNN.gguf`
- Validate all parts exist before starting
- Point to first part, llama.cpp handles the rest

**3. Path Resolution**:
- Prefer first split if multi-part set detected
- Fall back to single file if no splits found
- Validate file existence before container creation

---

## Technical Reference

### File Naming Convention

**Pattern**: `<base-name>-<part>-of-<total>.gguf`

**Examples**:
```
Q4_K_M-GGUF-00001-of-00009.gguf  ✓ Valid
model-Q8_0-00001-of-00014.gguf   ✓ Valid
merged-Q4_K_M.gguf               ✗ Not multi-part (legacy)
model.gguf                        ✗ Not multi-part (single file)
```

### Backend Functions

**Detection**: `_handle_multipart_gguf_merge()` in `backend/src/routes/models.py`
- Called during model start
- Detects pattern, validates parts
- Updates `local_path` to first part

**Resolution**: `_resolve_llamacpp_model_path()` in `backend/src/docker_manager.py`
- Resolves final path for llama-server
- Prefers first split if multi-part set found
- Validates file existence

**Registry**: `register_model_endpoint()` in `backend/src/state.py`
- Registers model URL for gateway routing
- Persisted to `ConfigKV` table
- Loaded on gateway startup

---

## Monitoring and Validation

### Check Model is Using Splits

**Container logs should show**:
```bash
docker logs llamacpp-model-{id} | grep "additional.*GGUF"

# Expected output:
# llama_model_loader: additional 8 GGUFs metadata loaded.
```

### Verify All Parts Loaded

**Check file access**:
```bash
# From gateway container:
docker exec cortex-gateway-1 ls -lh /var/cortex/models/model-path/*.gguf

# Should list all parts
```

### Monitor Performance

**Metrics to track**:
- Startup time: Should be 30-60s (not 5-10 minutes)
- Inference speed: Same as merged file
- Memory usage: Identical to merged file
- GPU utilization: No difference

---

## Comparison: Split Loading vs Merging

| Aspect | Split Loading (Current) | Merging (Old) |
|--------|------------------------|---------------|
| **Startup Time** | 30-60s | 6-11 minutes |
| **Disk Space** | 120GB (splits only) | 240GB (splits + merged) |
| **Complexity** | Low (native llama.cpp) | Medium (custom merge logic) |
| **Reliability** | High (well-tested) | Medium (concat can fail) |
| **Performance** | Same | Same |
| **Maintenance** | None | Manage merged files |

**Winner**: Split loading (faster, simpler, less disk space)

---

## Future Considerations

### If Manual Merge Needed

**Some tools may not support split files**. If you need a merged file:

**Option 1: Official llama.cpp tool**:
```bash
# Build llama.cpp with split tool:
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp
cmake -B build -DGGML_CUDA=ON
cmake --build build --target llama-gguf-split

# Merge:
./build/bin/llama-gguf-split --merge \
  Q4_K_M-GGUF-00001-of-00009.gguf \
  merged-Q4_K_M.gguf
```

**Option 2: Binary concatenation** (Linux/Mac):
```bash
cat Q4_K_M-GGUF-*.gguf > merged-Q4_K_M.gguf
```

**Note**: Cortex doesn't require this - only for external tools.

---

## Related Documentation

- **llama.cpp Guide**: `docs/models/llamaCPP.md`
- **Model Management**: `docs/models/model-management.md`
- **Engine Comparison**: `docs/models/engine-comparison.md`
- **Troubleshooting**: Check container logs via UI or `docker logs llamacpp-model-{id}`

---

## Summary

**Cortex automatically handles multi-part GGUF files** by:
1. ✅ Detecting split pattern
2. ✅ Validating completeness
3. ✅ Pointing to first part
4. ✅ Letting llama.cpp auto-load the rest

**No manual merge required!** Just place all parts in the same directory and start the model.

**Result**: Faster, simpler, more reliable than merging. 🚀
