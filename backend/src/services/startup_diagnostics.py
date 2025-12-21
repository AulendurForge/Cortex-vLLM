"""Startup failure diagnosis - parse container logs and provide actionable guidance.

This module implements Phase 3 "Observability & Debugging" feature.
See cortexSustainmentPlan.md for design details.
"""

import re
import logging
from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class DiagnosisResult(BaseModel):
    """Result of startup failure diagnosis."""
    detected: bool
    title: str
    message: str
    fixes: List[str]
    severity: str  # 'error' | 'warning' | 'info'
    error_type: str  # 'memory' | 'args' | 'network' | 'model' | 'unknown'


# Error patterns with actionable fixes
# Each pattern has: regex, title, message template, fix suggestions, error type
ERROR_PATTERNS = [
    {
        "pattern": r"model type [`']qwen3[`'].*Transformers does not recognize this architecture",
        "title": "Qwen3 Requires Newer vLLM/Transformers",
        "message": "This model is Qwen3 (model_type=qwen3), but the vLLM container’s Transformers version is too old to load it.",
        "fixes": [
            "Use a newer vLLM image that includes Qwen3 support (Transformers >= 4.51). Example: vllm/vllm-openai:latest",
            "If you must stay pinned/offline: update the offline package to a newer vLLM tag and reload it, then set VLLM_IMAGE to that same tag",
            "In Cortex: set the model’s 'Engine Image' (or global VLLM_IMAGE) to a compatible image and restart/re-apply the model",
        ],
        "error_type": "model",
        "severity": "error",
    },
    {
        "pattern": r"Free memory on device \(([0-9.]+)/([0-9.]+) GiB\).*less than desired GPU memory utilization \(([0-9.]+), ([0-9.]+) GiB\)",
        "title": "GPU Memory Exceeded",
        "message": "vLLM requires {required} GiB but only {available} GiB is free per GPU. GPU memory utilization {util} is too high for available VRAM.",
        "fixes": [
            "Reduce 'GPU Memory Utilization' to 0.80 or lower",
            "Check for other GPU processes: run `nvidia-smi` on host",
            "Reduce 'Max context length' to decrease KV cache memory",
            "Add custom arg: --kv-cache-dtype fp8 (reduces KV memory by ~50%)",
            "Enable quantization if model supports it (AWQ, GPTQ, FP8)",
        ],
        "error_type": "memory",
        "severity": "error",
    },
    {
        "pattern": r"unrecognized arguments?: (.+)",
        "title": "Invalid Startup Argument",
        "message": "vLLM doesn't recognize these arguments: {args}",
        "fixes": [
            "Check if this is a request-time parameter (temperature, top_p, etc.) - move to 'Request Defaults'",
            "Verify the argument name is correct (check vLLM documentation)",
            "This argument may require a newer vLLM version - check engine_version",
            "Remove the argument from 'Custom Startup Arguments' if not needed",
        ],
        "error_type": "args",
        "severity": "error",
    },
    {
        "pattern": r"CUDA out of memory",
        "title": "CUDA Out of Memory",
        "message": "GPU ran out of memory during model loading or inference.",
        "fixes": [
            "Reduce 'GPU Memory Utilization' to 0.70-0.80",
            "Lower 'Max context length' to reduce KV cache",
            "Add custom arg: --kv-cache-dtype fp8",
            "Enable model quantization (AWQ, GPTQ) if supported",
            "Increase 'Tensor Parallel Size' to split model across more GPUs",
        ],
        "error_type": "memory",
        "severity": "error",
    },
    {
        "pattern": r"--model.*deprecated.*v0\.13",
        "title": "Deprecated Parameter Warning",
        "message": "The --model flag is deprecated in vLLM v0.13+. Cortex will handle this automatically in future updates.",
        "fixes": [
            "This is just a warning - model will still work",
            "To silence: Cortex will use config file approach in Phase 2 updates",
            "No action needed unless using vLLM v0.13+",
        ],
        "error_type": "warning",
        "severity": "warning",
    },
    {
        "pattern": r"No module named '(\w+)'",
        "title": "Missing Python Module",
        "message": "Python module '{module}' is not installed in the vLLM container.",
        "fixes": [
            "This model may require a custom vLLM image with additional dependencies",
            "Check model documentation for required Python packages",
            "Consider building a custom Docker image with required modules",
        ],
        "error_type": "model",
        "severity": "error",
    },
    {
        "pattern": r"Connection refused|ConnectTimeoutError|Cannot connect to",
        "title": "Network Connection Failed",
        "message": "vLLM cannot connect to required services (HuggingFace, internal services, etc.).",
        "fixes": [
            "For online models: Check internet connectivity",
            "For HuggingFace models: Verify HF_TOKEN is set if model is gated",
            "Check Docker network configuration",
            "Verify no firewall blocking container network access",
        ],
        "error_type": "network",
        "severity": "error",
    },
    {
        "pattern": r"Model .* does not exist|Repository .* not found",
        "title": "Model Not Found",
        "message": "The specified model path or repository cannot be found.",
        "fixes": [
            "For offline models: Verify path exists in /var/cortex/models/",
            "For online models: Check HuggingFace repository ID is correct",
            "Ensure model files were fully downloaded/copied",
            "Check for typos in model path or repo_id",
        ],
        "error_type": "model",
        "severity": "error",
    },
    {
        "pattern": r"As of transformers v4\.44.*chat template",
        "title": "Chat Template Missing",
        "message": "Model doesn't have a chat template (transformers v4.44+ requirement).",
        "fixes": [
            "This is expected for base models (not instruction-tuned)",
            "Gateway automatically falls back to /v1/completions endpoint",
            "Use /v1/completions directly instead of /v1/chat/completions",
            "Or fine-tune model with a chat template",
        ],
        "error_type": "model",
        "severity": "warning",
    },
    {
        "pattern": r"Tensor parallel size \((\d+)\).*(?:exceeds|cannot be larger than).*(?:GPU count|number of available GPUs) \((\d+)\)",
        "title": "Insufficient GPUs for Tensor Parallelism",
        "message": "Tensor parallel size {tp_size} exceeds available GPU count {gpu_count}.",
        "fixes": [
            "Reduce number of selected GPUs in 'GPU Selection' to {gpu_count} or fewer",
            "The 'Tensor Parallel Size' is auto-set based on GPU selection",
            "You selected {tp_size} GPUs but Docker only sees {gpu_count} GPU(s)",
            "Check: docker run --gpus all nvidia/cuda:12.0-base nvidia-smi",
            "Verify NVIDIA Docker runtime is properly configured",
        ],
        "error_type": "args",
        "severity": "error",
    },
    {
        "pattern": r"No available shared memory broadcast block found in (\d+) seconds",
        "title": "Slow Initialization (Normal for Large Models)",
        "message": "Model is taking longer than usual to initialize. This is normal for large models (30B+) on first startup.",
        "fixes": [
            "✓ This is NORMAL behavior, not an error - please wait",
            "First startup can take 10-15 minutes due to CUDA kernel compilation",
            "Subsequent startups will be faster (2-3 minutes)",
            "Check logs for 'Starting vLLM API server' to confirm when ready",
            "For faster startup (with perf trade-off): add custom arg --disable-log-stats",
        ],
        "error_type": "info",
        "severity": "info",
    },
]


def diagnose_startup_failure(logs: str, tail_lines: int = 100) -> DiagnosisResult:
    """Parse container logs and diagnose startup failures.
    
    Matches known error patterns and provides actionable fix suggestions.
    
    Args:
        logs: Full container logs
        tail_lines: Number of recent lines to analyze (default 100)
        
    Returns:
        DiagnosisResult with diagnosis and suggested fixes
    """
    # Focus on recent logs (startup errors are usually at the end)
    log_lines = logs.split('\n')
    recent_logs = '\n'.join(log_lines[-tail_lines:]) if len(log_lines) > tail_lines else logs
    
    # Try to match known patterns
    for pattern_def in ERROR_PATTERNS:
        pattern = pattern_def["pattern"]
        match = re.search(pattern, recent_logs, re.IGNORECASE | re.MULTILINE)
        
        if match:
            # Extract match groups for message formatting
            groups = match.groups() if match.groups() else ()
            
            # Format message with captured groups
            message = pattern_def["message"]
            try:
                if "{available}" in message and len(groups) >= 2:
                    message = message.format(available=groups[0], required=groups[3] if len(groups) > 3 else groups[1])
                elif "{util}" in message and len(groups) >= 3:
                    message = message.format(available=groups[0], total=groups[1], util=groups[2], required=groups[3] if len(groups) > 3 else "N/A")
                elif "{args}" in message:
                    message = message.format(args=groups[0] if groups else "unknown")
                elif "{module}" in message:
                    message = message.format(module=groups[0] if groups else "unknown")
                elif "{tp_size}" in message and len(groups) >= 2:
                    message = message.format(tp_size=groups[0], gpu_count=groups[1])
            except Exception:
                # Fallback to original message if formatting fails
                pass
            
            return DiagnosisResult(
                detected=True,
                title=pattern_def["title"],
                message=message,
                fixes=pattern_def["fixes"],
                severity=pattern_def["severity"],
                error_type=pattern_def["error_type"],
            )
    
    # No pattern matched - return generic diagnosis
    # Try to extract any ERROR lines for context
    error_lines = [line for line in log_lines[-20:] if 'ERROR' in line.upper() or 'FAILED' in line.upper()]
    context = '\n'.join(error_lines[-3:]) if error_lines else recent_logs[-500:]
    
    return DiagnosisResult(
        detected=False,
        title="Unknown Startup Failure",
        message="Container failed to start. Check logs for details.",
        fixes=[
            "Review full container logs for error messages",
            "Check vLLM documentation for your specific error",
            "Verify model path/repo_id is correct",
            "Ensure GPU drivers and CUDA are properly installed",
            "Try reducing GPU memory utilization or max context length",
        ],
        severity="error",
        error_type="unknown",
    )


def extract_startup_summary(logs: str) -> Dict[str, any]:
    """Extract useful startup information from logs.
    
    Provides quick summary of model loading stats, warnings, etc.
    
    Args:
        logs: Full container logs
        
    Returns:
        Dict with startup summary info
    """
    summary = {
        "vllm_version": None,
        "model_path": None,
        "loading_time_sec": None,
        "memory_usage_gib": None,
        "kv_cache_size_tokens": None,
        "warnings": [],
    }
    
    try:
        # Extract vLLM version
        version_match = re.search(r"vLLM API server version ([\d.]+)", logs)
        if version_match:
            summary["vllm_version"] = version_match.group(1)
        
        # Extract model path
        model_match = re.search(r"model='([^']+)'", logs)
        if model_match:
            summary["model_path"] = model_match.group(1)
        
        # Extract loading time
        time_match = re.search(r"Model loading took.*?([\d.]+) seconds", logs)
        if time_match:
            summary["loading_time_sec"] = float(time_match.group(1))
        
        # Extract memory usage
        mem_match = re.search(r"Model loading took ([\d.]+) GiB memory", logs)
        if mem_match:
            summary["memory_usage_gib"] = float(mem_match.group(1))
        
        # Extract KV cache size
        kv_match = re.search(r"GPU KV cache size: ([\d,]+) tokens", logs)
        if kv_match:
            summary["kv_cache_size_tokens"] = int(kv_match.group(1).replace(',', ''))
        
        # Extract warnings
        warning_lines = [
            line.strip() for line in logs.split('\n') 
            if 'WARNING' in line.upper() and 'deprecated' not in line.lower()
        ]
        summary["warnings"] = warning_lines[-5:]  # Last 5 warnings
        
    except Exception as e:
        logger.error(f"Failed to extract startup summary: {e}")
    
    return summary

