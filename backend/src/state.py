from __future__ import annotations
import time
from typing import Dict, Any

# In-memory circuit-breaker and health snapshots
CB_STATE: Dict[str, Dict[str, float | int]] = {}
HEALTH_STATE: Dict[str, Dict[str, float | bool]] = {}
# Additional per-upstream diagnostics and recent history for health checks
# Keys are base URLs, values include: last_status_code, last_latency_ms, last_ok_ts,
# last_fail_ts, consecutive_fails, history(list[{ts, ok, latency_ms, status_code}])
HEALTH_META: Dict[str, Dict[str, Any]] = {}
LB_INDEX: Dict[str, int] = {}

# Dynamic model registry: served name -> { url, task }
MODEL_REGISTRY: Dict[str, Dict[str, str]] = {}

def register_model_endpoint(served_name: str, url: str, task: str) -> None:
    MODEL_REGISTRY[served_name] = {"url": url, "task": task}

def unregister_model_endpoint(served_name: str) -> None:
    try:
        MODEL_REGISTRY.pop(served_name, None)
    except Exception:
        pass

def get_model_registry() -> Dict[str, Dict[str, str]]:
    return MODEL_REGISTRY.copy()

def set_model_registry(entries: Dict[str, Dict[str, str]]) -> None:
    """Replace in-memory registry with provided entries (used on startup load)."""
    try:
        MODEL_REGISTRY.clear()
        for k, v in (entries or {}).items():
            url = str(v.get("url", "")) if isinstance(v, dict) else ""
            task = str(v.get("task", "generate")) if isinstance(v, dict) else "generate"
            if url:
                MODEL_REGISTRY[str(k)] = {"url": url, "task": task}
    except Exception:
        # Best-effort load; ignore malformed entries
        pass

def registry_urls() -> list[str]:
    try:
        return sorted({meta.get("url", "") for meta in MODEL_REGISTRY.values() if meta.get("url")})
    except Exception:
        return []

def snapshot_states() -> dict[str, Any]:
    return {
        "circuit_breakers": CB_STATE.copy(),
        "health": HEALTH_STATE.copy(),
        "meta": HEALTH_META.copy(),
        "registry": MODEL_REGISTRY.copy(),
        "lb_index": LB_INDEX.copy(),
        "now": time.time(),
    }


