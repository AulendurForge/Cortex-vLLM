"""HuggingFace model configuration inspection."""

import os
import httpx
from typing import Optional, List, Dict, Any
from ..schemas.models import HfConfigResp


async def fetch_hf_config(repo_id: str) -> HfConfigResp:
    """Fetch and parse config.json from HuggingFace repository.
    
    Args:
        repo_id: HuggingFace repo ID (e.g., "meta-llama/Llama-2-7b")
        
    Returns:
        HfConfigResp with parsed architecture info
        
    Raises:
        HTTPException: If config cannot be fetched
    """
    urls = [
        f"https://huggingface.co/{repo_id}/resolve/main/config.json",
        f"https://huggingface.co/{repo_id}/raw/main/config.json",
    ]
    
    headers = {}
    try:
        token = os.environ.get('HUGGING_FACE_HUB_TOKEN', '')
        if token:
            headers['Authorization'] = f"Bearer {token}"
    except Exception:
        pass
    
    parsed = None
    async with httpx.AsyncClient(timeout=6.0) as client:
        last_err = None
        for u in urls:
            try:
                r = await client.get(u, headers=headers)
                if r.status_code < 400:
                    parsed = r.json()
                    break
                last_err = r.text
            except Exception as e:
                last_err = str(e)
    
    if not isinstance(parsed, dict):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="config_not_found")
    
    def _get_int(keys: List[str]) -> Optional[int]:
        """Extract integer value from config by trying multiple keys."""
        for k in keys:
            try:
                v = parsed.get(k)
                if isinstance(v, int):
                    return v
            except Exception:
                pass
        return None
    
    out = HfConfigResp()
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
