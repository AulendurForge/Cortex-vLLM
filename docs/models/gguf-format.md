# GGUF Format Guide

**GGUF (GPT-Generated Unified Format)** is the native file format for llama.cpp models. Cortex provides comprehensive GGUF support with smart detection, validation, and metadata extraction.

---

## What is GGUF?

GGUF is a binary format designed for efficient storage and loading of quantized language models. It replaced the older GGML format and offers:

- **Self-contained**: Model weights, tokenizer info, and metadata in a single file
- **Memory-mapped loading**: Fast startup via OS-level memory mapping
- **Quantization support**: Native support for various precision levels
- **Architecture-agnostic**: Can store any model architecture

### GGUF vs SafeTensors

| Aspect | GGUF | SafeTensors |
|--------|------|-------------|
| **Primary Engine** | llama.cpp | vLLM |
| **Quantization** | Built-in (Q4_K_M, Q8_0, etc.) | External (AWQ, GPTQ) |
| **File Count** | Single file or split parts | Multiple shards |
| **Metadata** | Embedded | Separate config.json |
| **Performance** | Optimized for llama.cpp | Native HF Transformers |

---

## Quantization Levels

### Understanding Quantization

Quantization reduces model precision to save memory and disk space. Lower bits = smaller size but potentially lower quality.

### Cortex Quality Indicators

When selecting a GGUF file in Cortex, you'll see quality and speed indicators:

| Quantization | Bits | Quality | Speed | VRAM Savings | Recommended For |
|--------------|------|---------|-------|--------------|-----------------|
| **F16** | 16 | ★★★★★ | ★★☆☆☆ | 0% | Maximum quality, plenty of VRAM |
| **Q8_0** | 8 | ★★★★★ | ★★★☆☆ | 50% | Production use, near-lossless |
| **Q6_K** | 6.5 | ★★★★☆ | ★★★☆☆ | 59% | High quality with good savings |
| **Q5_K_M** | 5.5 | ★★★★☆ | ★★★★☆ | 66% | Balanced quality/speed |
| **Q5_K_S** | 5.5 | ★★★★☆ | ★★★★☆ | 66% | Slightly smaller Q5 variant |
| **Q4_K_M** | 4.5 | ★★★☆☆ | ★★★★★ | 72% | Good balance, tight VRAM |
| **Q4_K_S** | 4.5 | ★★★☆☆ | ★★★★★ | 72% | Smaller Q4 variant |
| **Q4_0** | 4 | ★★★☆☆ | ★★★★★ | 75% | Maximum compression |
| **Q3_K_M** | 3.5 | ★★☆☆☆ | ★★★★★ | 78% | Aggressive compression |
| **Q2_K** | 2.5 | ★☆☆☆☆ | ★★★★★ | 84% | Extreme compression (quality loss) |
| **IQ4_XS** | 4.25 | ★★★★☆ | ★★★★☆ | 73% | imatrix-optimized Q4 |
| **IQ3_M** | 3.4 | ★★★☆☆ | ★★★★★ | 79% | imatrix-optimized Q3 |
| **IQ2_M** | 2.7 | ★★☆☆☆ | ★★★★★ | 83% | imatrix-optimized Q2 |

### Recommendations by Use Case

**Production / Quality-Critical**:
- Use **Q8_0** - Near-lossless, 50% VRAM savings
- Use **Q6_K** - Excellent quality, 60% savings

**Balanced / General Use**:
- Use **Q5_K_M** - Good quality, significant savings
- Use **Q4_K_M** - Acceptable quality, max efficiency

**Constrained VRAM**:
- Use **Q4_K_M** or **Q4_K_S** - Best quality at 4-bit
- Avoid Q3 and below unless necessary

---

## Multi-Part GGUF Files

Large models are often split into multiple files due to platform limits (e.g., HuggingFace's 50GB file size limit).

### Naming Convention

```
model-name-00001-of-00009.gguf
model-name-00002-of-00009.gguf
...
model-name-00009-of-00009.gguf
```

### Cortex Handling

**llama.cpp** (Recommended):
- ✅ Native split-file support
- ✅ Automatic detection of all parts
- ✅ No merge required
- Just point to any part; llama.cpp loads all automatically

**vLLM**:
- ❌ Does NOT support multi-part GGUF
- ⚠️ Must merge into single file first, OR
- ✅ Use SafeTensors instead (if available)
- ✅ Switch to llama.cpp engine

### Smart Engine Guidance

When Cortex detects multi-part GGUF with vLLM selected, it provides guidance:

1. **Switch to SafeTensors** (if available) - Best vLLM performance
2. **Switch to llama.cpp** - Native multi-part support
3. **Merge files manually** - Last resort option

See [Multi-Part GGUF Documentation](gguf-multipart.md) for detailed handling.

---

## GGUF Metadata

Cortex extracts and displays metadata from GGUF file headers:

### Displayed Information

| Field | Description | Example |
|-------|-------------|---------|
| **Architecture** | Model architecture | `llama`, `qwen2`, `mistral` |
| **Context Length** | Maximum tokens | `32K`, `128K` |
| **Layers** | Transformer blocks | `32`, `80` |
| **Hidden Size** | Embedding dimension | `4096`, `8192` |
| **Attention Heads** | Q/KV head counts | `32/8` (GQA) |
| **Vocab Size** | Vocabulary tokens | `128K`, `152K` |

### Architecture Compatibility

Cortex shows compatibility badges for each architecture:

| Architecture | vLLM | llama.cpp | Notes |
|--------------|------|-----------|-------|
| `llama` | ✓ Full | ✓ Full | Best supported |
| `mistral` | ✓ Full | ✓ Full | Best supported |
| `qwen2` | ✓ Full | ✓ Full | Best supported |
| `gemma` | ✓ Full | ✓ Full | |
| `phi3` | ◐ Partial | ✓ Full | Some vLLM limitations |
| `mamba` | ✗ None | ✓ Full | llama.cpp only |
| `rwkv` | ✗ None | ◐ Partial | Limited support |
| `harmony` | ✗ None | ✓ Full | GPT-OSS models |

---

## GGUF Validation

Cortex performs automatic validation when inspecting folders:

### What's Validated

1. **Magic Bytes**: Confirms file starts with `GGUF` (0x47475546)
2. **Version Check**: Supports GGUF v2 and v3
3. **Header Integrity**: Validates tensor and KV pair counts
4. **File Size**: Detects truncated downloads
5. **Legacy Detection**: Identifies old GGML format files

### Validation Status

| Status | Meaning | Action |
|--------|---------|--------|
| ✅ Valid | File passed all checks | Ready to use |
| ⚠️ Warning | Minor issues detected | Review details |
| ❌ Invalid | File is corrupt/incomplete | Re-download |

### Common Issues

**"Invalid magic bytes"**:
- File is not a GGUF file
- May be incomplete download
- May be different format (GGML, SafeTensors)

**"Unsupported version"**:
- Very old GGUF format
- Update llama.cpp or convert file

**"File appears truncated"**:
- Download interrupted
- Re-download the file

---

## Using GGUF in Cortex

### With llama.cpp (Recommended)

1. **Add Model** → Select **llama.cpp** engine
2. **Mode**: Offline
3. **Browse** to your GGUF file or folder
4. Cortex auto-detects:
   - Available quantization levels
   - Multi-part files
   - Model metadata
5. **Select** desired quantization
6. **Configure** llama.cpp settings
7. **Start** model

### With vLLM (Limited Support)

vLLM's GGUF support is **experimental**:

1. **Add Model** → Select **vLLM** engine
2. **Mode**: Offline
3. **Browse** to single-file GGUF
4. **Configure** GGUF Weight Format (auto/gguf/ggml)
5. **Provide tokenizer** (required - from HF repo or local)
6. **Start** model

**vLLM GGUF Limitations**:
- Single-file only (no multi-part)
- Requires external tokenizer
- Performance lower than SafeTensors
- Limited architecture support

---

## Tokenizer Requirements

### llama.cpp

Tokenizer is embedded in GGUF file - **no external tokenizer needed**.

### vLLM with GGUF

Requires external tokenizer:

**Option 1: HuggingFace Repo**
```
Tokenizer: meta-llama/Llama-3.1-8B-Instruct
```

**Option 2: Local Path**
```
Tokenizer: /models/my-model/tokenizer
```

### Tokenizer Suggestions

Cortex suggests tokenizers based on model name:

| Model Pattern | Suggested Tokenizer |
|--------------|---------------------|
| `llama` | `meta-llama/Llama-3.1-8B-Instruct` |
| `mistral` | `mistralai/Mistral-7B-Instruct-v0.3` |
| `qwen` | `Qwen/Qwen2.5-7B-Instruct` |
| `phi` | `microsoft/Phi-3-mini-4k-instruct` |
| `gemma` | `google/gemma-2-9b-it` |

---

## Speculative Decoding (llama.cpp)

Use a smaller "draft" model to accelerate inference:

### Setup

1. Place draft model GGUF alongside main model
2. In llama.cpp configuration, expand **Speculative Decoding**
3. Enter draft model path
4. Configure draft tokens (default: 16)
5. Set acceptance probability (default: 0.5)

### Example Directory

```
/var/cortex/models/
└── my-model/
    ├── main-model-Q8_0.gguf      # Main model (24B)
    └── draft-model-Q8_0.gguf     # Draft model (0.5B)
```

### Benefits

- 1.5-2x throughput improvement
- Same output quality
- Best with matching architectures

See [llama.cpp Guide](llamaCPP.md#speculative-decoding) for details.

---

## Best Practices

### Choosing Quantization

1. **Start with Q8_0** for initial testing
2. **Drop to Q5_K_M** if VRAM constrained
3. **Use Q4_K_M** for production with tight resources
4. **Avoid Q3 and below** unless absolutely necessary

### Engine Selection

1. **Use llama.cpp** for GGUF-only models
2. **Use vLLM** with SafeTensors when available
3. **Check architecture compatibility** before choosing

### File Organization

```
/var/cortex/models/
├── model-name/
│   ├── Q4_K_M/
│   │   └── model-Q4_K_M.gguf
│   ├── Q8_0/
│   │   └── model-Q8_0.gguf
│   └── config.json (optional)
```

---

## Troubleshooting

### "Model fails to load"

1. Check validation status in Cortex
2. Verify complete download (check file sizes)
3. Ensure architecture is supported
4. Check container logs for specific errors

### "Poor generation quality"

1. Try higher quantization (Q8_0 vs Q4_K_M)
2. Verify correct model selected
3. Check tokenizer configuration (vLLM)

### "Out of memory"

1. Use lower quantization (Q4_K_M vs Q8_0)
2. Reduce context size
3. Enable KV cache quantization

---

## Related Documentation

- [llama.cpp Guide](llamaCPP.md) - Full llama.cpp configuration
- [vLLM Guide](vllm.md) - vLLM configuration including GGUF
- [Multi-Part GGUF](gguf-multipart.md) - Split file handling
- [Engine Comparison](engine-comparison.md) - vLLM vs llama.cpp decision guide
- [Offline Deployment](../operations/offline-deployment.md) - Air-gapped GGUF deployment

