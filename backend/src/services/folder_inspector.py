"""Folder inspection utilities for model management."""

import os
import json
from typing import List, Dict, Any, Optional
from ..schemas.models import InspectFolderResp, EngineRecommendation, GGUFValidationSummary, SafeTensorInfo
from ..utils.gguf_utils import analyze_gguf_files, GGUFGroup, validate_gguf_files_in_directory


def compute_gguf_validation_summary(target_dir: str) -> GGUFValidationSummary | None:
    """Compute GGUF validation summary for a directory (Gap #5).
    
    Args:
        target_dir: Directory containing GGUF files
        
    Returns:
        GGUFValidationSummary or None if no GGUF files
    """
    validation_results = validate_gguf_files_in_directory(target_dir)
    
    if not validation_results:
        return None
    
    total = len(validation_results)
    valid = sum(1 for r in validation_results.values() if r.is_valid)
    invalid = total - valid
    
    warnings: List[str] = []
    errors: List[str] = []
    
    for filename, result in validation_results.items():
        if result.error:
            errors.append(f"{filename}: {result.error}")
        if result.warning:
            warnings.append(f"{filename}: {result.warning}")
    
    return GGUFValidationSummary(
        total_files=total,
        valid_files=valid,
        invalid_files=invalid,
        warnings=warnings,
        errors=errors
    )


def compute_engine_recommendation(
    has_safetensors: bool,
    gguf_groups: List[GGUFGroup],
    gguf_files: List[str]
) -> EngineRecommendation:
    """Compute smart engine recommendation based on folder contents.
    
    Decision Matrix:
    - Multi-part GGUF + SafeTensors available -> vLLM with SafeTensors (best performance)
    - Multi-part GGUF only -> llama.cpp (native split-file support)
    - Single GGUF + SafeTensors -> vLLM with SafeTensors (recommended) or either
    - Single GGUF only -> either (llama.cpp preferred for GGUF optimization)
    - SafeTensors only -> vLLM (best performance)
    
    Args:
        has_safetensors: Whether SafeTensors files are present
        gguf_groups: Analyzed GGUF groups
        gguf_files: List of GGUF filenames
        
    Returns:
        EngineRecommendation with guidance
    """
    has_gguf = len(gguf_files) > 0 or len(gguf_groups) > 0
    has_multipart = any(g.is_multipart for g in gguf_groups)
    
    # Check if there's a single-file GGUF that vLLM can use
    has_single_file_gguf = any(not g.is_multipart and g.can_use for g in gguf_groups)
    vllm_gguf_compatible = has_single_file_gguf
    
    options: List[Dict[str, Any]] = []
    
    # Determine recommendation and build options
    if has_multipart and has_safetensors:
        # Best case: Use SafeTensors with vLLM
        recommended = "vllm"
        reason = "Multi-part GGUF detected. SafeTensors available - use vLLM for best performance."
        options = [
            {
                "engine": "vllm",
                "format": "safetensors",
                "label": "✓ Recommended: Use SafeTensors with vLLM",
                "description": "Best performance, native HuggingFace format support",
                "is_recommended": True
            },
            {
                "engine": "llamacpp",
                "format": "gguf",
                "label": "Alternative: Use GGUF with llama.cpp",
                "description": "Native multi-part GGUF support, no extra disk space needed",
                "is_recommended": False
            }
        ]
    elif has_multipart and not has_safetensors:
        # Only option: llama.cpp for multi-part GGUF
        recommended = "llamacpp"
        reason = "Multi-part GGUF detected. llama.cpp recommended for native split-file loading (vLLM only supports single-file GGUF)."
        options = [
            {
                "engine": "llamacpp",
                "format": "gguf",
                "label": "✓ Recommended: Use llama.cpp",
                "description": "Native multi-part GGUF support, automatic split-file loading",
                "is_recommended": True
            },
            {
                "engine": "vllm",
                "format": "gguf",
                "label": "⚠️ vLLM (requires manual merge)",
                "description": "vLLM only supports single-file GGUF. You would need to merge files first using llama-gguf-split.",
                "is_recommended": False,
                "requires_merge": True
            }
        ]
    elif has_gguf and has_safetensors:
        # Single GGUF + SafeTensors: recommend vLLM with SafeTensors
        recommended = "vllm"
        reason = "SafeTensors available. vLLM with SafeTensors offers best performance. GGUF available as alternative."
        options = [
            {
                "engine": "vllm",
                "format": "safetensors",
                "label": "✓ Recommended: Use SafeTensors with vLLM",
                "description": "Best performance, native HuggingFace format",
                "is_recommended": True
            },
            {
                "engine": "llamacpp",
                "format": "gguf",
                "label": "Alternative: Use GGUF with llama.cpp",
                "description": "Best GGUF support, aggressive quantization options",
                "is_recommended": False
            },
            {
                "engine": "vllm",
                "format": "gguf",
                "label": "Alternative: Use GGUF with vLLM",
                "description": "Experimental GGUF support (lower performance than SafeTensors)",
                "is_recommended": False
            }
        ]
    elif has_gguf and not has_safetensors:
        # GGUF only: prefer llama.cpp
        recommended = "llamacpp"
        reason = "GGUF files only. llama.cpp recommended for optimal GGUF support and quantization."
        options = [
            {
                "engine": "llamacpp",
                "format": "gguf",
                "label": "✓ Recommended: Use llama.cpp",
                "description": "Best GGUF support, native quantization handling",
                "is_recommended": True
            }
        ]
        if vllm_gguf_compatible:
            options.append({
                "engine": "vllm",
                "format": "gguf",
                "label": "Alternative: Use vLLM (experimental)",
                "description": "Experimental GGUF support. Requires external tokenizer.",
                "is_recommended": False
            })
    elif has_safetensors:
        # SafeTensors only
        recommended = "vllm"
        reason = "SafeTensors model. vLLM recommended for best performance."
        options = [
            {
                "engine": "vllm",
                "format": "safetensors",
                "label": "✓ Recommended: Use vLLM",
                "description": "Best performance with PagedAttention and continuous batching",
                "is_recommended": True
            }
        ]
    else:
        # No recognized model files
        recommended = "either"
        reason = "No SafeTensors or GGUF files detected. Check folder contents."
        options = []
    
    return EngineRecommendation(
        recommended=recommended,
        reason=reason,
        has_multipart_gguf=has_multipart,
        has_safetensors=has_safetensors,
        has_gguf=has_gguf,
        vllm_gguf_compatible=vllm_gguf_compatible,
        options=options
    )


def inspect_model_folder(target_dir: str) -> InspectFolderResp:
    """Inspect a folder for model files and configuration.
    
    Args:
        target_dir: Absolute path to folder to inspect
        
    Returns:
        InspectFolderResp with file inventory and parsed config
        
    Raises:
        Exception: If folder cannot be read
    """
    try:
        names = []
        for name in os.listdir(target_dir):
            try:
                names.append(name)
            except Exception:
                pass
        
        # Detect file types
        safetensor_files = sorted([n for n in names if n.lower().endswith('.safetensors')])
        has_safe = len(safetensor_files) > 0
        ggufs = sorted([n for n in names if n.lower().endswith('.gguf')])
        toks = sorted([n for n in names if n.lower() in ('tokenizer.json', 'tokenizer.model', 'tokenizer_config.json')])
        cfgs = sorted([n for n in names if n.lower() in ('config.json', 'generation_config.json', 'special_tokens_map.json')])
        
        # Warnings
        warnings: List[str] = []
        if len(toks) > 1:
            warnings.append("multiple_tokenizer_files_detected")
        
        # Parse config.json if present
        parsed = None
        try:
            cfg_path = os.path.join(target_dir, 'config.json')
            if os.path.isfile(cfg_path):
                with open(cfg_path, 'r', encoding='utf-8') as f:
                    parsed = json.load(f)
        except Exception:
            parsed = None
        
        def _get_int(keys: List[str]) -> Optional[int]:
            """Extract integer value from config by trying multiple keys."""
            for k in keys:
                try:
                    v = parsed.get(k) if parsed else None
                    if isinstance(v, int):
                        return v
                except Exception:
                    pass
            return None
        
        # Perform smart GGUF analysis
        gguf_groups = analyze_gguf_files(target_dir)
        
        # Compute smart engine recommendation (Gap #2)
        engine_recommendation = compute_engine_recommendation(has_safe, gguf_groups, ggufs)
        
        # Compute GGUF validation summary (Gap #5)
        gguf_validation = compute_gguf_validation_summary(target_dir) if ggufs else None
        
        # Add validation errors to warnings
        if gguf_validation and gguf_validation.invalid_files > 0:
            warnings.append(f"gguf_validation_errors: {gguf_validation.invalid_files} file(s) failed validation")
        
        # Build SafeTensor info if present
        safetensor_info: SafeTensorInfo | None = None
        if has_safe:
            # Calculate total size
            total_bytes = 0
            for sf in safetensor_files:
                try:
                    total_bytes += os.path.getsize(os.path.join(target_dir, sf))
                except Exception:
                    pass
            total_size_gb = round(total_bytes / (1024**3), 2)
            
            # Extract architecture info from config
            architecture: str | None = None
            model_type: str | None = None
            vocab_size: int | None = None
            max_position_embeddings: int | None = None
            torch_dtype: str | None = None
            tie_word_embeddings: bool | None = None
            
            if parsed:
                try:
                    archs = parsed.get('architectures', [])
                    if archs and isinstance(archs, list) and len(archs) > 0:
                        architecture = archs[0]
                    model_type = parsed.get('model_type')
                    vocab_size = parsed.get('vocab_size')
                    max_position_embeddings = parsed.get('max_position_embeddings')
                    torch_dtype = parsed.get('torch_dtype')
                    tie_word_embeddings = parsed.get('tie_word_embeddings')
                except Exception:
                    pass
            
            safetensor_info = SafeTensorInfo(
                files=safetensor_files,
                total_size_gb=total_size_gb,
                file_count=len(safetensor_files),
                architecture=architecture,
                model_type=model_type,
                vocab_size=vocab_size,
                max_position_embeddings=max_position_embeddings,
                torch_dtype=torch_dtype,
                tie_word_embeddings=tie_word_embeddings
            )
        
        # Build response
        out = InspectFolderResp(
            has_safetensors=bool(has_safe),
            safetensor_info=safetensor_info,  # Detailed SafeTensor info
            gguf_files=ggufs,  # Legacy: keep for backward compatibility
            gguf_groups=gguf_groups,  # New: smart grouped analysis
            tokenizer_files=toks,
            config_files=cfgs,
            warnings=warnings,
            engine_recommendation=engine_recommendation,
            gguf_validation=gguf_validation,
        )
        
        # Extract model architecture info from config
        if parsed:
            try:
                if isinstance(parsed.get('params'), (int, float)):
                    try:
                        out.params_b = float(parsed.get('params')) / 1e9
                    except Exception:
                        pass
                out.hidden_size = _get_int(['hidden_size', 'n_embd'])
                out.num_hidden_layers = _get_int(['num_hidden_layers', 'n_layer'])
                out.num_attention_heads = _get_int(['num_attention_heads', 'n_head'])
            except Exception:
                pass
        
        return out
        
    except Exception:
        return InspectFolderResp(
            has_safetensors=False,
            gguf_files=[],
            gguf_groups=[],
            tokenizer_files=[],
            config_files=[],
            warnings=["inspect_error"],
            engine_recommendation=None
        )
