# Model Management

## Concepts
- Stored model records in DB (name, served name, task, flags)
- Managed containers named `vllm-model-{id}` or `llamacpp-model-{id}`
- Registry maps served name → URL and task for routing
- **Model files are never deleted by Cortex** - only database records are removed

## Lifecycle
- Create → Start → Apply updates (stop/start) → Stop → Archive/Delete (DB only)

### State Machine

```
┌─────────┐                    ┌──────────┐                    ┌─────────┐
│ stopped │ ─── Start Click ──→│ starting │ ─── Container Up ──→│ loading │
└─────────┘                    └──────────┘                    └─────────┘
     ↑                                                               │
     │                                                               ↓
┌──────────┐                                                   ┌─────────┐
│ stopping │ ←────────────── Stop Click ──────────────────────│ running │
└──────────┘                                                   └─────────┘
     ↓                                │                              │
     │                                ↓                              │
┌─────────┐                      ┌────────┐                          │
│ stopped │                      │ failed │ ←── Error at any stage ──┘
└─────────┘                      └────────┘
```

**States:**
| State | Description |
|-------|-------------|
| `stopped` | No container running, ready to start |
| `starting` | Container creation initiated |
| `loading` | Container running, model loading into GPU memory |
| `running` | Model ready for inference requests |
| `stopping` | Graceful shutdown in progress |
| `failed` | Error occurred, check logs for diagnostics |

**UI Behavior:**
- Polling automatically updates state every few seconds
- Toast notifications appear on state transitions
- "Start" button triggers dry-run validation first

## File Safety Guarantee

**CRITICAL: Cortex never deletes model files from `/var/cortex/models`**

When you delete a model from Cortex:
- ✅ Database record is removed
- ✅ Container is stopped
- ✅ Model is unregistered from routing
- ✅ **Files remain on disk untouched**

This protects manually-placed offline models, which are often:
- Transferred via USB drives in air-gapped environments
- Large files (10-240GB) taking hours to transfer
- Impossible to re-download in classified/restricted networks

**To free disk space:**
Administrators must manually delete files from the filesystem:
```bash
# List models directory
ls -lh /var/cortex/models/

# Manually delete unwanted folders
rm -rf /var/cortex/models/old-model-folder
```

## Base directory helpers
- `GET/PUT /admin/models/base-dir` to set host-visible models directory
- `GET /admin/models/local-folders` and `GET /admin/models/inspect-folder` to assist offline model selection

## Model Preparation
- **📖 HuggingFace Models**: See `docs/models/huggingface-model-download.md` for complete guide on downloading HF models
- **📖 GGUF Models**: See `docs/models/gguf-format.md` for GGUF format guide and `docs/models/llamaCPP.md` for llama.cpp configuration
- **📖 vLLM Models**: See `docs/models/vllm.md` for vLLM-specific configuration

## Smart Engine Guidance

Cortex automatically analyzes model folders and provides intelligent recommendations for engine and format selection.

### How It Works

When you browse to a model folder in offline mode, Cortex:

1. **Scans for file types**: GGUF, SafeTensors, PyTorch
2. **Analyzes GGUF files**: Detects quantization, multi-part splits, validates headers
3. **Extracts metadata**: Architecture, context length, layer count
4. **Computes recommendations**: Based on file availability and engine compatibility

### Engine Recommendation Matrix

| Scenario | SafeTensors | GGUF Type | Recommended Engine | Reason |
|----------|-------------|-----------|-------------------|--------|
| Both available | ✅ | Single | vLLM + SafeTensors | Best performance |
| Both available | ✅ | Multi-part | vLLM + SafeTensors | vLLM can't load multi-part GGUF |
| GGUF only | ❌ | Single | llama.cpp | Native GGUF support |
| GGUF only | ❌ | Multi-part | llama.cpp | Only engine with multi-part support |
| SafeTensors only | ✅ | ❌ | vLLM | Native format |

### Guidance UI Components

**Engine Guidance Banner**: Appears in the model form when recommendations apply:

- **⚠️ Warning**: Multi-part GGUF with vLLM selected (incompatible)
- **💡 Tip**: SafeTensors available with GGUF selected
- **✅ Recommended**: Suggested engine/format combination

**One-Click Actions**:
- "Switch to SafeTensors" - Changes format selection
- "Switch to llama.cpp" - Changes engine selection

### GGUF Validation

Cortex validates GGUF files during folder inspection:

| Check | What It Detects |
|-------|-----------------|
| Magic bytes | Invalid/corrupt files |
| Version | Unsupported GGUF versions |
| Header integrity | Truncated downloads |
| Legacy format | Old GGML files |

**Validation Status**:
- ✅ **Valid**: All files passed checks
- ⚠️ **Warning**: Minor issues detected
- ❌ **Invalid**: Corrupt or incomplete files

### GGUF Metadata Extraction

For valid GGUF files, Cortex extracts and displays:

| Metadata | Example | Description |
|----------|---------|-------------|
| Architecture | `llama` | Model architecture type |
| Context Length | `32K` | Maximum context window |
| Layers | `32` | Number of transformer layers |
| Hidden Size | `4096` | Embedding dimension |
| Attention Heads | `32/8` | Q heads / KV heads (GQA) |
| Vocab Size | `128K` | Vocabulary size |

### Architecture Compatibility

Cortex shows compatibility badges for each detected architecture:

| Status | vLLM | llama.cpp | Meaning |
|--------|------|-----------|---------|
| ✓ Green | Full | Full | Both engines fully support |
| ◐ Yellow | Partial | Full | Some vLLM limitations |
| ⚡ Orange | Experimental | Full | Experimental vLLM support |
| ✗ Red | None | Full | llama.cpp only |

### Quantization Quality Indicators

When selecting GGUF quantization levels, Cortex shows:

- **Quality bars** (1-5 stars): Output quality rating
- **Speed bars** (1-5 stars): Inference speed rating
- **Bits per weight**: Compression level
- **Description**: What the quantization is best for

See [GGUF Format Guide](gguf-format.md) for detailed quantization information.

## Logs
- `GET /admin/models/{id}/logs` returns recent container logs (for debugging)
- `GET /admin/models/{id}/logs?diagnose=true` returns logs with startup diagnostics

## Dry Run & Pre-Start Validation

The dry-run endpoint validates configuration before starting:

- `POST /admin/models/{id}/dry-run` returns:
  - The vLLM or llama.cpp command that would be executed
  - VRAM estimation and warnings
  - Configuration validation results
  - Quantization compatibility checks

**Frontend Integration:**
When clicking "Start" in the UI, Cortex automatically runs a dry-run first. If warnings are detected (e.g., VRAM concerns, quantization mismatches), the user is prompted to confirm before proceeding.

## Per-Model Metrics

Running models expose metrics via the System Monitor page:
- **Requests running/waiting/swapped** - Current queue status
- **Prompt/generation tokens** - Throughput metrics
- **KV cache utilization** - Memory efficiency
- **GPU cache usage** - VRAM allocation

Access via: Admin UI → System Monitor → Active Models section
API endpoint: `GET /admin/models/metrics`
