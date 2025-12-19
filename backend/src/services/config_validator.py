"""Configuration validation for dry-run checks.

Validates model configuration BEFORE starting container to catch issues early.
Focus on VRAM estimation and custom args validation.

Phase 3 feature - see cortexSustainmentPlan.md
"""

import logging
from typing import Dict, List, Optional, Tuple, Any
from pydantic import BaseModel
from ..models import Model

logger = logging.getLogger(__name__)


class ValidationWarning(BaseModel):
    """A validation warning with severity and suggested fix."""
    severity: str  # 'error' | 'warning' | 'info'
    category: str  # 'memory' | 'args' | 'config'
    title: str
    message: str
    fix: Optional[str] = None


class DryRunResult(BaseModel):
    """Result of dry-run validation."""
    valid: bool
    warnings: List[ValidationWarning]
    vram_estimate: Optional[Dict[str, Any]] = None
    command_preview: Optional[List[str]] = None


def estimate_vram_usage(m: Model, gpu_count: int = 1) -> Dict[str, Any]:
    """Estimate VRAM usage for a model configuration.
    
    Simple heuristic-based estimation (not precise, but catches obvious issues).
    
    Args:
        m: Model configuration
        gpu_count: Number of GPUs (for TP sharding)
        
    Returns:
        Dict with VRAM estimates per GPU
    """
    # Rough parameter count estimation from model path/name
    params_b = 7.0  # Default assumption
    
    # Try to guess from name
    name_lower = (m.name or m.local_path or m.repo_id or '').lower()
    if '70b' in name_lower or '72b' in name_lower:
        params_b = 70.0
    elif '30b' in name_lower or '34b' in name_lower:
        params_b = 30.0
    elif '13b' in name_lower or '14b' in name_lower:
        params_b = 13.0
    elif '20b' in name_lower:
        params_b = 20.0
    elif '9b' in name_lower or '8b' in name_lower:
        params_b = 8.0
    elif '7b' in name_lower:
        params_b = 7.0
    elif '3b' in name_lower:
        params_b = 3.0
    
    # Bytes per parameter based on dtype
    dtype = (m.dtype or 'bfloat16').lower()
    bytes_per_param = 2.0  # fp16/bf16
    if 'fp8' in dtype or 'int8' in dtype:
        bytes_per_param = 1.0
    elif 'fp32' in dtype:
        bytes_per_param = 4.0
    
    # Quantization reduces weight memory
    quant = (m.quantization or '').lower()
    if 'awq' in quant or 'gptq' in quant:
        bytes_per_param *= 0.25  # 4-bit
    elif 'int8' in quant or 'fp8' in quant:
        bytes_per_param *= 0.5
    
    # Base model weights
    model_weights_gb = (params_b * 1e9 * bytes_per_param) / (1024 ** 3)
    
    # KV cache estimation
    max_len = m.max_model_len or 8192
    max_seqs = getattr(m, 'max_num_seqs', None) or 256
    kv_bytes_per_token = 2.0  # Default
    
    kv_cache_dtype = getattr(m, 'kv_cache_dtype', None) or ''
    if 'fp8' in kv_cache_dtype.lower():
        kv_bytes_per_token = 1.0
    
    # Rough KV cache: tokens * layers * hidden_size * 2 (K+V) * bytes_per_elem
    # Simplification: ~2 bytes per token per billion params for fp16
    kv_cache_gb = (max_len * max_seqs * params_b * kv_bytes_per_token) / (1024 ** 3)
    
    # Tensor parallel sharding
    tp_size = m.tp_size or 1
    if tp_size > 1:
        model_weights_gb /= tp_size
        kv_cache_gb /= tp_size
    
    # Overhead (activation memory, fragmentation, etc.)
    overhead_gb = (model_weights_gb + kv_cache_gb) * 0.15
    
    # Total per GPU
    total_per_gpu_gb = model_weights_gb + kv_cache_gb + overhead_gb
    
    # Apply gpu_memory_utilization factor
    gpu_mem_util = m.gpu_memory_utilization or 0.9
    required_vram_gb = total_per_gpu_gb / gpu_mem_util
    
    return {
        "params_b": params_b,
        "model_weights_gb": round(model_weights_gb, 2),
        "kv_cache_gb": round(kv_cache_gb, 2),
        "overhead_gb": round(overhead_gb, 2),
        "total_per_gpu_gb": round(total_per_gpu_gb, 2),
        "required_vram_gb": round(required_vram_gb, 2),
        "gpu_count": tp_size,
        "note": "Estimate only - actual usage may vary by ±20%",
    }


def validate_model_config(m: Model, available_gpus: List[Dict] = None) -> List[ValidationWarning]:
    """Validate model configuration and return warnings.
    
    Catches common issues:
    - VRAM insufficient
    - Custom args conflicts
    - GPU count mismatches
    
    Args:
        m: Model to validate
        available_gpus: List of GPU info dicts with mem_total_mb, mem_used_mb
        
    Returns:
        List of validation warnings
    """
    warnings = []
    
    # 1. VRAM Validation
    try:
        vram_est = estimate_vram_usage(m, m.tp_size or 1)
        required_gb = vram_est["required_vram_gb"]
        
        if available_gpus:
            for i, gpu in enumerate(available_gpus[:m.tp_size or 1]):
                total_gb = (gpu.get('mem_total_mb') or 0) / 1024
                used_gb = (gpu.get('mem_used_mb') or 0) / 1024
                free_gb = total_gb - used_gb
                
                if required_gb > free_gb:
                    warnings.append(ValidationWarning(
                        severity='error',
                        category='memory',
                        title=f'Insufficient VRAM on GPU {i}',
                        message=f'Estimated need: {required_gb:.1f} GB, Available: {free_gb:.1f} GB',
                        fix='Reduce GPU Memory Utilization, Max Context Length, or enable KV cache quantization (--kv-cache-dtype fp8)'
                    ))
                elif required_gb > free_gb * 0.9:
                    warnings.append(ValidationWarning(
                        severity='warning',
                        category='memory',
                        title=f'Tight VRAM on GPU {i}',
                        message=f'Estimated need: {required_gb:.1f} GB, Available: {free_gb:.1f} GB (little headroom)',
                        fix='Consider reducing GPU Memory Utilization slightly for safety margin'
                    ))
    except Exception as e:
        logger.warning(f"VRAM estimation failed: {e}")
    
    # 2. Custom Args Validation
    try:
        from ..utils import validate_custom_startup_args, FORBIDDEN_CUSTOM_ARGS, REQUEST_TIME_PARAMS
        import json
        
        custom_args_json = getattr(m, 'engine_startup_args_json', None)
        if custom_args_json:
            custom_args = json.loads(custom_args_json)
            
            # Check for forbidden args
            for arg in custom_args:
                flag = arg.get('flag', '').lower()
                
                if flag in FORBIDDEN_CUSTOM_ARGS:
                    warnings.append(ValidationWarning(
                        severity='error',
                        category='args',
                        title='Forbidden Argument',
                        message=f'{flag} is managed by Cortex and cannot be overridden',
                        fix='Remove this argument from Custom Startup Arguments'
                    ))
                
                # Check for request-time params
                if flag in REQUEST_TIME_PARAMS:
                    warnings.append(ValidationWarning(
                        severity='warning',
                        category='args',
                        title='Request-Time Parameter',
                        message=f'{flag} should be in Request Defaults, not startup args',
                        fix='Move this to Request Defaults section instead'
                    ))
    except Exception as e:
        logger.warning(f"Custom args validation failed: {e}")
    
    # 3. GPU Count vs Tensor Parallel
    tp_size = m.tp_size or 1
    if available_gpus and tp_size > len(available_gpus):
        warnings.append(ValidationWarning(
            severity='error',
            category='config',
            title='GPU Count Mismatch',
            message=f'Tensor parallel size ({tp_size}) exceeds available GPUs ({len(available_gpus)})',
            fix=f'Reduce GPU selection to {len(available_gpus)} or fewer'
        ))
    
    # 4. Max Model Len Sanity Check
    max_len = m.max_model_len or 0
    if max_len > 131072:
        warnings.append(ValidationWarning(
            severity='warning',
            category='config',
            title='Very Large Context',
            message=f'Max context length ({max_len}) is extremely large and may cause OOM',
            fix='Consider reducing to 32K-64K unless you specifically need larger context'
        ))
    
    return warnings


async def dry_run_validation(model_id: int) -> DryRunResult:
    """Run dry-run validation for a model.
    
    Checks VRAM, custom args, and config without starting container.
    
    Args:
        model_id: Model ID to validate
        
    Returns:
        DryRunResult with warnings and estimates
    """
    try:
        from ..main import SessionLocal
        from sqlalchemy import select
        from ..docker_manager import _build_command, _build_llamacpp_command
        
        if SessionLocal is None:
            return DryRunResult(
                valid=False,
                warnings=[ValidationWarning(
                    severity='error',
                    category='config',
                    title='Database Unavailable',
                    message='Cannot validate config - database not ready',
                )],
            )
        
        async with SessionLocal() as session:
            res = await session.execute(select(Model).where(Model.id == model_id))
            m = res.scalar_one_or_none()
            
            if not m:
                return DryRunResult(
                    valid=False,
                    warnings=[ValidationWarning(
                        severity='error',
                        category='config',
                        title='Model Not Found',
                        message=f'Model ID {model_id} not found',
                    )],
                )
            
            # Get available GPUs
            available_gpus = []
            try:
                from ..services.system_monitoring import get_gpu_metrics
                from ..config import get_settings
                gpus = await get_gpu_metrics(get_settings())
                available_gpus = [
                    {'mem_total_mb': g.mem_total_mb, 'mem_used_mb': g.mem_used_mb}
                    for g in gpus if g.mem_total_mb
                ]
            except Exception as e:
                logger.warning(f"Could not fetch GPU info: {e}")
            
            # Run validations
            warnings = validate_model_config(m, available_gpus)
            
            # Get VRAM estimate
            vram_estimate = None
            try:
                vram_estimate = estimate_vram_usage(m, m.tp_size or 1)
            except Exception as e:
                logger.warning(f"VRAM estimation failed: {e}")
            
            # Generate command preview
            command_preview = None
            try:
                if m.engine_type == 'llamacpp':
                    command_preview = _build_llamacpp_command(m)
                else:
                    command_preview = _build_command(m)
            except Exception as e:
                logger.warning(f"Command preview failed: {e}")
            
            # Determine overall validity (no errors, only warnings/info allowed)
            has_errors = any(w.severity == 'error' for w in warnings)
            
            return DryRunResult(
                valid=not has_errors,
                warnings=warnings,
                vram_estimate=vram_estimate,
                command_preview=command_preview,
            )
            
    except Exception as e:
        logger.error(f"Dry-run validation failed: {e}")
        return DryRunResult(
            valid=False,
            warnings=[ValidationWarning(
                severity='error',
                category='config',
                title='Validation Failed',
                message=str(e),
            )],
        )

