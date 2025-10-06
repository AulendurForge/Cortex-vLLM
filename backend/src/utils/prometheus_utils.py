"""Prometheus query utilities for metrics collection."""

import httpx
from typing import List, Tuple, Dict


def prom_query(settings, expr: str) -> float:
    """Execute instant Prometheus query and return single float value.
    
    Args:
        settings: Application settings with PROMETHEUS_URL
        expr: PromQL expression
        
    Returns:
        Float value from first result, or 0.0 on error
    """
    try:
        base = settings.PROMETHEUS_URL.rstrip("/")
        resp = httpx.get(f"{base}/api/v1/query", params={"query": expr}, timeout=5.0)
        data = resp.json()
        vals = data.get("data", {}).get("result", [])
        if not vals:
            return 0.0
        return float(vals[0].get("value", [None, "0"])[1])
    except Exception:
        return 0.0


def prom_range(settings, expr: str, minutes: int, step_s: int) -> List[Tuple[float, float]]:
    """Execute range Prometheus query and return time-series data.
    
    Args:
        settings: Application settings with PROMETHEUS_URL
        expr: PromQL expression
        minutes: Time range in minutes
        step_s: Step size in seconds
        
    Returns:
        List of (timestamp, value) tuples, or empty list on error
    """
    try:
        import time as _time
        base = settings.PROMETHEUS_URL.rstrip("/")
        end = int(_time.time())
        start = end - minutes * 60
        params = {
            "query": expr,
            "start": str(start),
            "end": str(end),
            "step": str(step_s),
        }
        resp = httpx.get(f"{base}/api/v1/query_range", params=params, timeout=6.0)
        data = resp.json()
        res = data.get("data", {}).get("result", [])
        if not res:
            return []
        series = res[0].get("values", [])
        out: List[Tuple[float, float]] = []
        for ts, val in series:
            try:
                out.append((float(ts), float(val)))
            except Exception:
                pass
        return out
    except Exception:
        return []


def prom_range_matrix(settings, expr: str, minutes: int, step_s: int, label: str) -> Dict[str, List[Tuple[float, float]]]:
    """Query multiple time-series and group by label value.
    
    Args:
        settings: Application settings with PROMETHEUS_URL
        expr: PromQL expression
        minutes: Time range in minutes
        step_s: Step size in seconds
        label: Label name to group by
        
    Returns:
        Dict mapping label_value -> [(timestamp, value), ...]
    """
    try:
        import time as _time
        base = settings.PROMETHEUS_URL.rstrip("/")
        end = int(_time.time())
        start = end - minutes * 60
        params = {
            "query": expr,
            "start": str(start),
            "end": str(end),
            "step": str(step_s),
        }
        resp = httpx.get(f"{base}/api/v1/query_range", params=params, timeout=8.0)
        data = resp.json()
        res = data.get("data", {}).get("result", [])
        out: Dict[str, List[Tuple[float, float]]] = {}
        for series in res:
            lab = series.get("metric", {}).get(label)
            if not lab:
                # try uppercase variant (e.g., GPU) or fallbacks
                lab = series.get("metric", {}).get(label.upper()) or series.get("metric", {}).get("minor_number")
                if not lab:
                    continue
            vals = []
            for ts, val in series.get("values", []) or []:
                try:
                    vals.append((float(ts), float(val)))
                except Exception:
                    pass
            out[str(lab)] = vals
        return out
    except Exception:
        return {}


def prom_instant_matrix(settings, expr: str, label: str) -> Dict[str, float]:
    """Instant vector grouped by label -> float value.
    
    Args:
        settings: Application settings with PROMETHEUS_URL
        expr: PromQL expression
        label: Label name to group by
        
    Returns:
        Dict mapping label_value -> float value
    """
    try:
        base = settings.PROMETHEUS_URL.rstrip("/")
        resp = httpx.get(f"{base}/api/v1/query", params={"query": expr}, timeout=6.0)
        data = resp.json()
        res = data.get("data", {}).get("result", [])
        out: Dict[str, float] = {}
        for s in res:
            lab = s.get("metric", {}).get(label)
            if not lab:
                lab = s.get("metric", {}).get(label.upper())
                if not lab:
                    continue
            try:
                val = s.get("value") or [None, "0"]
                v = float(val[1])
            except Exception:
                v = 0.0
            out[str(lab)] = v
        return out
    except Exception:
        return {}

