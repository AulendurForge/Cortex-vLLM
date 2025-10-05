"""Folder inspection utilities for model management."""

import os
import json
from typing import List, Dict, Any, Optional
from ..schemas.models import InspectFolderResp
from ..utils.gguf_utils import analyze_gguf_files


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
        has_safe = any(n.lower().endswith('.safetensors') for n in names)
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
        
        # Build response
        out = InspectFolderResp(
            has_safetensors=bool(has_safe),
            gguf_files=ggufs,  # Legacy: keep for backward compatibility
            gguf_groups=gguf_groups,  # New: smart grouped analysis
            tokenizer_files=toks,
            config_files=cfgs,
            warnings=warnings,
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
            warnings=["inspect_error"]
        )
