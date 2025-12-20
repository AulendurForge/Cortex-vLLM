"""Validation utilities for custom startup arguments (Plane B).

This module implements security and compatibility validation for user-provided
custom startup arguments and environment variables.

See cortexSustainmentPlan.md Phase 2 for design details.
"""

from typing import List, Dict, Any
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)


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


def validate_custom_startup_args(args: List[Dict[str, Any]]) -> None:
    """Validate custom startup arguments for security and compatibility.
    
    Enforces:
    - Hard blocks forbidden args (security invariants)
    - Soft warns for request-time params (logged, not blocked)
    
    Args:
        args: List of custom arg dicts with 'flag' and 'value' keys
        
    Raises:
        HTTPException: If forbidden args are present
    """
    if not args:
        return
    
    for arg in args:
        flag = str(arg.get("flag", "")).lower().strip()
        
        # Hard block: Security invariants
        if flag in FORBIDDEN_CUSTOM_ARGS:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot override {flag}: managed by Cortex for security/routing"
            )
        
        # Soft warn: Request-time parameters
        if flag in REQUEST_TIME_PARAMS:
            logger.warning(
                f"User added request-time parameter {flag} as startup arg. "
                f"This should be in Request Defaults (Plane C), not startup args. "
                f"See cortexSustainmentPlan.md for guidance."
            )


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

