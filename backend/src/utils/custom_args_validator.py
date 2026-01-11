"""Validation utilities for custom startup arguments (Plane B).

This module implements security and compatibility validation for user-provided
custom startup arguments and environment variables.

See cortexSustainmentPlan.md Phase 2 for design details.
"""

from typing import List, Dict, Any, Tuple, Optional
from fastapi import HTTPException
import logging
import difflib

logger = logging.getLogger(__name__)


# ============================================================================
# Gap #9: Valid llama.cpp Server Flags Allowlist
# ============================================================================

# Comprehensive allowlist of valid llama.cpp server flags
# Used for typo detection and suggestions (soft warning, not blocking)
VALID_LLAMACPP_FLAGS = {
    # Model loading
    "-m", "--model",
    "-a", "--alias",
    "-hf", "--hf-repo",
    "-hff", "--hf-file",
    "-hfv", "--hf-revision",
    "-hft", "--hf-token",
    
    # Context and batching
    "-c", "--ctx-size",
    "-n", "--n-predict",
    "-b", "--batch-size",
    "-ub", "--ubatch-size",
    "-np", "--parallel",
    "-cb", "--cont-batching",
    "--context-shift",
    
    # GPU configuration
    "-ngl", "--n-gpu-layers",
    "-sm", "--split-mode",
    "-ts", "--tensor-split",
    "-mg", "--main-gpu",
    "-fa", "--flash-attn",
    "-mlock", "--mlock",
    "-nommq", "--no-mmap",
    "--numa",
    
    # Server configuration
    "--host", "--port",
    "-t", "--threads",
    "-tb", "--threads-batch",
    "--threads-http",
    "--timeout",
    "--slots",
    "--metrics",
    "--embedding", "--embeddings",
    "--rerank",
    "--webui",
    
    # KV Cache
    "-ctk", "--cache-type-k",
    "-ctv", "--cache-type-v",
    "--cache-reuse",
    "-dt", "--defrag-thold",
    
    # Sampling parameters (should be in Request Defaults, but valid)
    "--temp", "--temperature",
    "--top-k", "--top-p",
    "--min-p", "--typical",
    "--repeat-penalty", "--repeat-last-n",
    "--frequency-penalty", "--presence-penalty",
    "--dry-multiplier", "--dry-base",
    "--samplers", "--sampler-seq",
    
    # RoPE configuration
    "--rope-freq-base", "--rope-freq-scale",
    "--rope-scaling", "--rope-scale",
    "--yarn-orig-ctx", "--yarn-attn-factor",
    "--yarn-beta-fast", "--yarn-beta-slow",
    "--yarn-ext-factor",
    
    # LoRA adapters
    "--lora", "--lora-scaled",
    "--lora-init-without-apply",
    
    # Chat templates
    "--chat-template", "--chat-template-file",
    "--chat-template-kwargs",
    "--jinja", "--no-jinja",
    
    # Grammar/Constrained generation
    "--grammar", "--grammar-file",
    
    # Logging
    "-v", "--verbose", "--log-verbose",
    "--log-disable", "--log-file",
    "--log-colors", "--log-prefix",
    "--log-timestamps",
    "--verbosity", "--log-verbosity",
    
    # Speculative decoding
    "--draft", "--draft-min", "--draft-p-min",
    
    # Control vectors
    "--control-vector", "--control-vector-scaled",
    "--control-vector-layer-range",
    
    # System prompt
    "--system-prompt-file", "-sp",
    
    # Misc
    "--check-tensors",
    "--warmup", "--no-warmup",
    "--seed", "-s",
    "--pooling",
    "--api-key", "--api-key-file",
    "--props",
    "--version",
    "-h", "--help",
}

# Short flag to long flag mapping for better suggestions
FLAG_ALIASES = {
    "-m": "--model",
    "-c": "--ctx-size",
    "-n": "--n-predict",
    "-b": "--batch-size",
    "-ub": "--ubatch-size",
    "-ngl": "--n-gpu-layers",
    "-t": "--threads",
    "-tb": "--threads-batch",
    "-np": "--parallel",
    "-cb": "--cont-batching",
    "-fa": "--flash-attn",
    "-ctk": "--cache-type-k",
    "-ctv": "--cache-type-v",
    "-v": "--verbose",
    "-s": "--seed",
    "-a": "--alias",
    "-sp": "--system-prompt-file",
    "-sm": "--split-mode",
    "-ts": "--tensor-split",
    "-dt": "--defrag-thold",
}


# Security: Arguments that must NEVER be user-configurable
# These are Cortex-managed invariants for routing, security, and system stability
FORBIDDEN_CUSTOM_ARGS = {
    # Network/routing
    "--host", "--port", "-h", "-p",
    "--ssl-keyfile", "--ssl-certfile", "--ssl-ca-certs",
    "--root-path",
    
    # Authentication
    "--api-key", "--disable-log-requests",
    
    # Internal configuration
    "--uvicorn-log-level", "--log-level",
    
    # Environment exposure risks
    "--env-vars", "--load-format",
}


# Request-time parameters that should NOT be startup args
# Soft warning only (don't block, but log for visibility)
REQUEST_TIME_PARAMS = {
    "--temperature", "--temp",
    "--top-p", "--top-k",
    "--repetition-penalty", "--repeat-penalty",
    "--frequency-penalty", "--presence-penalty",
    "--max-tokens", "--n-predict",
    "--stop", "--stream",
}


# Environment variables that must remain Cortex-managed
PROTECTED_ENV_VARS = {
    "CUDA_VISIBLE_DEVICES",  # Cortex manages GPU allocation
    "NCCL_P2P_DISABLE", "NCCL_IB_DISABLE", "NCCL_SHM_DISABLE",  # NCCL config
    "HF_HUB_OFFLINE",  # Cortex controls online/offline mode
    "VLLM_API_KEY",  # Internal auth
    "PYTORCH_CUDA_ALLOC_CONF",  # Memory management
}


def find_closest_flag(flag: str, valid_flags: set, threshold: float = 0.6) -> Optional[str]:
    """Find the closest matching valid flag using fuzzy matching (Gap #9).
    
    Args:
        flag: The flag to find a match for
        valid_flags: Set of valid flags to match against
        threshold: Minimum similarity ratio (0-1) to consider a match
        
    Returns:
        The closest matching flag, or None if no close match found
    """
    # Normalize the input flag
    flag_lower = flag.lower()
    
    # Check if it's already valid (case-insensitive)
    for valid in valid_flags:
        if flag_lower == valid.lower():
            return valid
    
    # Try fuzzy matching
    closest = difflib.get_close_matches(flag_lower, [f.lower() for f in valid_flags], n=1, cutoff=threshold)
    if closest:
        # Find the original case version
        for valid in valid_flags:
            if valid.lower() == closest[0]:
                return valid
    
    return None


def validate_llamacpp_flag(flag: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """Validate a single llama.cpp flag and suggest corrections (Gap #9).
    
    Args:
        flag: The flag to validate
        
    Returns:
        Tuple of (is_valid, suggestion, warning_message)
        - is_valid: True if flag is known valid
        - suggestion: Suggested correct flag if typo detected
        - warning_message: Warning message if applicable
    """
    flag_lower = flag.lower().strip()
    
    # Check if it's in the valid flags set (case-insensitive)
    for valid in VALID_LLAMACPP_FLAGS:
        if flag_lower == valid.lower():
            return (True, None, None)
    
    # Not found - try fuzzy matching to find suggestion
    suggestion = find_closest_flag(flag, VALID_LLAMACPP_FLAGS, threshold=0.6)
    
    if suggestion:
        warning = f"Unknown flag '{flag}' - did you mean '{suggestion}'?"
    else:
        warning = f"Unknown flag '{flag}' - not in llama.cpp allowlist. Will pass through as-is."
    
    return (False, suggestion, warning)


def validate_custom_startup_args(args: List[Dict[str, Any]], engine_type: str = "vllm") -> List[Dict[str, Any]]:
    """Validate custom startup arguments for security and compatibility.
    
    Enforces:
    - Hard blocks forbidden args (security invariants)
    - Soft warns for request-time params (logged, not blocked)
    - Gap #9: Validates llama.cpp flags and suggests corrections for typos
    
    Args:
        args: List of custom arg dicts with 'flag' and 'value' keys
        engine_type: Engine type for engine-specific validation
        
    Returns:
        List of validation warnings (for UI display)
        
    Raises:
        HTTPException: If forbidden args are present
    """
    warnings = []
    
    if not args:
        return warnings
    
    for arg in args:
        flag = str(arg.get("flag", "")).strip()
        flag_lower = flag.lower()
        
        # Hard block: Security invariants
        if flag_lower in FORBIDDEN_CUSTOM_ARGS or flag in FORBIDDEN_CUSTOM_ARGS:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot override {flag}: managed by Cortex for security/routing"
            )
        
        # Soft warn: Request-time parameters
        if flag_lower in REQUEST_TIME_PARAMS or flag in REQUEST_TIME_PARAMS:
            warning_msg = (
                f"Request-time parameter '{flag}' should be in Request Defaults, not startup args."
            )
            logger.warning(warning_msg)
            warnings.append({
                "flag": flag,
                "severity": "warning",
                "message": warning_msg
            })
        
        # Gap #9: Validate llama.cpp flags and suggest corrections
        elif engine_type == "llamacpp":
            is_valid, suggestion, warning_msg = validate_llamacpp_flag(flag)
            if not is_valid:
                logger.info(f"Custom arg validation: {warning_msg}")
                warnings.append({
                    "flag": flag,
                    "severity": "info",
                    "message": warning_msg,
                    "suggestion": suggestion
                })
    
    return warnings


def validate_custom_env_vars(env_list: List[Dict[str, Any]]) -> None:
    """Validate custom environment variables.
    
    Prevents overriding Cortex-managed environment variables that could
    break GPU allocation, networking, or security boundaries.
    
    Args:
        env_list: List of env var dicts with 'key' and 'value' keys
        
    Raises:
        HTTPException: If protected env vars are present
    """
    if not env_list:
        return
    
    for env in env_list:
        key = str(env.get("key", "")).strip()
        
        if key in PROTECTED_ENV_VARS:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot override {key}: managed by Cortex"
            )


def parse_custom_args_to_cli(args_json: str | None) -> List[str]:
    """Parse engine_startup_args_json into CLI argument list.
    
    Converts structured custom args into CLI flags for docker command.
    
    Args:
        args_json: JSON string containing custom args list
        
    Returns:
        List of CLI arguments (e.g., ["--enable-lora", "--max-loras", "8"])
        
    Example input:
        [
            {"flag": "--enable-lora", "type": "bool", "value": true},
            {"flag": "--max-loras", "type": "int", "value": 8}
        ]
    
    Example output:
        ["--enable-lora", "--max-loras", "8"]
    """
    if not args_json:
        return []
    
    try:
        import json
        args = json.loads(args_json)
        if not isinstance(args, list):
            return []
        
        cli_args = []
        for arg in args:
            if not isinstance(arg, dict):
                continue
            
            flag = str(arg.get("flag", "")).strip()
            arg_type = str(arg.get("type", "string")).lower()
            value = arg.get("value")
            
            if not flag:
                continue
            
            # Type-specific handling
            if arg_type == "bool" or arg_type == "flag":
                # Boolean: only add flag if value is truthy
                if value:
                    cli_args.append(flag)
            elif arg_type == "string_list" or arg_type == "list":
                # List: add flag then each value as separate args
                if isinstance(value, list):
                    cli_args.append(flag)
                    cli_args.extend([str(v) for v in value])
            else:
                # String, int, float: add flag and value
                if value is not None:
                    cli_args.append(flag)
                    cli_args.append(str(value))
        
        return cli_args
        
    except Exception as e:
        logger.error(f"Failed to parse custom args JSON: {e}")
        return []


def parse_custom_env_to_dict(env_json: str | None) -> Dict[str, str]:
    """Parse engine_startup_env_json into environment variable dict.
    
    Args:
        env_json: JSON string containing custom env vars list
        
    Returns:
        Dict of environment variables
        
    Example input:
        [
            {"key": "VLLM_LOGGING_LEVEL", "value": "DEBUG"},
            {"key": "HF_HUB_ENABLE_HF_TRANSFER", "value": "1"}
        ]
    
    Example output:
        {"VLLM_LOGGING_LEVEL": "DEBUG", "HF_HUB_ENABLE_HF_TRANSFER": "1"}
    """
    if not env_json:
        return {}
    
    try:
        import json
        env_list = json.loads(env_json)
        if not isinstance(env_list, list):
            return {}
        
        env_dict = {}
        for env in env_list:
            if not isinstance(env, dict):
                continue
            
            key = str(env.get("key", "")).strip()
            value = str(env.get("value", ""))
            
            if key:
                env_dict[key] = value
        
        return env_dict
        
    except Exception as e:
        logger.error(f"Failed to parse custom env JSON: {e}")
        return {}

