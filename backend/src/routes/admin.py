from fastapi import APIRouter, HTTPException, Depends, Response, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from typing import Optional
import os
import json
from ..models import User, Organization
from ..config import get_settings
from ..auth import require_admin
import httpx as _httpx
from passlib.context import CryptContext
from ..state import snapshot_states, HEALTH_META, register_model_endpoint, unregister_model_endpoint, get_model_registry
from ..config import get_settings
def _get_session() -> Optional[object]:
    try:
        from ..main import SessionLocal  # type: ignore
        return SessionLocal
    except Exception:
        return None

def _get_http_client():
    try:
        from ..main import http_client  # type: ignore
        return http_client
    except Exception:
        return None
import httpx
import time

router = APIRouter()
class SystemSummary(BaseModel):
    cpu_count: int | None = None
    load_avg_1m: float | None = None
    mem_total_mb: float | None = None
    mem_used_mb: float | None = None
    disk_total_gb: float | None = None
    disk_used_gb: float | None = None
    gpus: int | None = None
    cuda_driver: str | None = None


@router.get("/system/summary", response_model=SystemSummary)
async def system_summary(_: dict = Depends(require_admin)):
    # Best-effort snapshot using /proc and environment hints; can be replaced with Prometheus API later
    try:
        import psutil  # type: ignore
    except Exception:
        psutil = None  # type: ignore
    cpu_count = os.cpu_count() or None
    load1 = None
    mem_total = mem_used = None
    disk_total = disk_used = None
    if psutil:
        try:
            la = psutil.getloadavg()
            load1 = float(la[0]) if la else None
        except Exception:
            pass
        try:
            vm = psutil.virtual_memory()
            mem_total = round(vm.total / (1024 * 1024), 2)
            mem_used = round((vm.total - vm.available) / (1024 * 1024), 2)
        except Exception:
            pass
        try:
            du = psutil.disk_usage('/')
            disk_total = round(du.total / (1024 * 1024 * 1024), 2)
            disk_used = round(du.used / (1024 * 1024 * 1024), 2)
        except Exception:
            pass
    # GPU hints via env (toolkit) or NVML fallback
    gpus = None
    cuda_driver = None
    try:
        from pynvml import nvmlInit, nvmlDeviceGetCount, nvmlShutdown, nvmlSystemGetDriverVersion  # type: ignore
        nvmlInit(); gpus = int(nvmlDeviceGetCount()); cuda_driver = nvmlSystemGetDriverVersion().decode(); nvmlShutdown()
    except Exception:
        try:
            vis = os.environ.get('NVIDIA_VISIBLE_DEVICES', '')
            if vis and vis != 'all':
                gpus = len([x for x in vis.split(',') if x and x != 'void'])
        except Exception:
            pass
    return SystemSummary(
        cpu_count=cpu_count,
        load_avg_1m=load1,
        mem_total_mb=mem_total,
        mem_used_mb=mem_used,
        disk_total_gb=disk_total,
        disk_used_gb=disk_used,
        gpus=gpus,
        cuda_driver=cuda_driver,
    )


class ThroughputSummary(BaseModel):
    req_per_sec: float
    prompt_tokens_per_sec: float
    generation_tokens_per_sec: float
    latency_p50_ms: float
    latency_p95_ms: float
    ttft_p50_ms: float
    ttft_p95_ms: float


@router.get("/system/throughput", response_model=ThroughputSummary)
async def system_throughput(settings = Depends(get_settings), _: dict = Depends(require_admin)):
    """Summarize current throughput/latency via Prometheus API (best‑effort) with short TTL cache."""
    # Simple in‑memory cache to avoid hammering Prometheus
    now = time.monotonic()
    ttl = 5.0
    global _throughput_cache  # type: ignore
    try:
        ts, cached = _throughput_cache  # type: ignore
        if now - ts < ttl:
            return cached
    except Exception:
        pass

    base = settings.PROMETHEUS_URL.rstrip("/")
    rate_win = "1m"
    q_win = "5m"

    def _q(expr: str) -> float:
        try:
            url = f"{base}/api/v1/query"
            resp = httpx.get(url, params={"query": expr}, timeout=5.0)
            data = resp.json()
            v = data.get("data", {}).get("result", [])
            if not v:
                return 0.0
            val = v[0].get("value", [None, "0"])[1]
            return float(val)
        except Exception:
            return 0.0

    req_per_sec = _q(f"sum(rate(gateway_requests_total[{rate_win}]))")
    pts = _q(f"sum(rate(vllm:prompt_tokens_total[{rate_win}]))")
    gts = _q(f"sum(rate(vllm:generation_tokens_total[{rate_win}]))")
    lat_p50 = _q(f"histogram_quantile(0.5, sum by (le) (rate(gateway_request_latency_seconds_bucket[{q_win}])))") * 1000.0
    lat_p95 = _q(f"histogram_quantile(0.95, sum by (le) (rate(gateway_request_latency_seconds_bucket[{q_win}])))") * 1000.0
    ttft_p50 = _q(f"histogram_quantile(0.5, sum by (le) (rate(gateway_stream_ttft_seconds_bucket[{q_win}])))") * 1000.0
    ttft_p95 = _q(f"histogram_quantile(0.95, sum by (le) (rate(gateway_stream_ttft_seconds_bucket[{q_win}])))") * 1000.0

    out = ThroughputSummary(
        req_per_sec=req_per_sec,
        prompt_tokens_per_sec=pts,
        generation_tokens_per_sec=gts,
        latency_p50_ms=lat_p50,
        latency_p95_ms=lat_p95,
        ttft_p50_ms=ttft_p50,
        ttft_p95_ms=ttft_p95,
    )
    _throughput_cache = (now, out)  # type: ignore
    return out


class GpuMetrics(BaseModel):
    index: int
    name: str | None = None
    utilization_pct: float | None = None
    mem_used_mb: float | None = None
    mem_total_mb: float | None = None
    temperature_c: float | None = None


@router.get("/system/gpus", response_model=list[GpuMetrics])
async def system_gpus(_: dict = Depends(require_admin)):
    """Fetch per-GPU metrics via Prometheus DCGM exporter (best effort).
    Fallback to empty list if Prometheus not reachable in dev.
    """
    settings = get_settings()
    url = f"{settings.PROMETHEUS_URL}/api/v1/query"
    queries = {
        "util": 'DCGM_FI_DEV_GPU_UTIL',
        "mem_used": 'DCGM_FI_DEV_FB_USED',
        "mem_total": 'DCGM_FI_DEV_FB_TOTAL',
        "temp": 'DCGM_FI_DEV_GPU_TEMP',
        "name": 'DCGM_FI_DEV_NAME',
    }
    # Short TTL cache
    now = time.monotonic()
    ttl = 5.0
    global _gpus_cache  # type: ignore
    try:
        ts, cached = _gpus_cache  # type: ignore
        if now - ts < ttl:
            return cached
    except Exception:
        pass

    results: dict[str, dict[str, float | str]] = {}
    async with _httpx.AsyncClient(timeout=5.0) as client:
        for key, q in queries.items():
            try:
                resp = await client.get(url, params={"query": q})
                data = resp.json()
                for r in data.get("data", {}).get("result", []):
                    idx = r.get("metric", {}).get("gpu") or r.get("metric", {}).get("GPU") or r.get("metric", {}).get("minor_number")
                    if idx is None:
                        continue
                    entry = results.setdefault(str(idx), {})
                    val = r.get("value", [None, None])[1]
                    if key == "name":
                        entry[key] = str(val)
                    else:
                        try:
                            entry[key] = float(val)
                        except Exception:
                            pass
            except Exception:
                # In dev, Prom may be unavailable; return what we can
                pass
    out: list[GpuMetrics] = []
    for k, v in sorted(results.items(), key=lambda kv: int(kv[0])):
        out.append(
            GpuMetrics(
                index=int(k),
                name=str(v.get("name")) if v.get("name") is not None else None,
                utilization_pct=float(v.get("util")) if v.get("util") is not None else None,
                mem_used_mb=float(v.get("mem_used")) if v.get("mem_used") is not None else None,
                mem_total_mb=float(v.get("mem_total")) if v.get("mem_total") is not None else None,
                temperature_c=float(v.get("temp")) if v.get("temp") is not None else None,
            )
        )
    # NVML fallback if DCGM results are empty
    if not out:
        try:
            from pynvml import (
                nvmlInit, nvmlShutdown, nvmlDeviceGetCount, nvmlDeviceGetHandleByIndex,
                nvmlDeviceGetName, nvmlDeviceGetMemoryInfo, nvmlDeviceGetUtilizationRates,
                nvmlDeviceGetTemperature, NVML_TEMPERATURE_GPU
            )  # type: ignore
            nvmlInit()
            try:
                n = int(nvmlDeviceGetCount())
                for i in range(n):
                    h = nvmlDeviceGetHandleByIndex(i)
                    try:
                        name = nvmlDeviceGetName(h).decode()
                    except Exception:
                        name = None
                    try:
                        mem = nvmlDeviceGetMemoryInfo(h)
                        mem_used_mb = float(mem.used) / (1024 * 1024)
                        mem_total_mb = float(mem.total) / (1024 * 1024)
                    except Exception:
                        mem_used_mb = mem_total_mb = None
                    try:
                        util = nvmlDeviceGetUtilizationRates(h)
                        util_pct = float(util.gpu)
                    except Exception:
                        util_pct = None
                    try:
                        temp = float(nvmlDeviceGetTemperature(h, NVML_TEMPERATURE_GPU))
                    except Exception:
                        temp = None
                    out.append(GpuMetrics(index=i, name=name, utilization_pct=util_pct, mem_used_mb=mem_used_mb, mem_total_mb=mem_total_mb, temperature_c=temp))
            finally:
                nvmlShutdown()
        except Exception:
            pass
    _gpus_cache = (now, out)  # type: ignore
    return out
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class BootstrapRequest(BaseModel):
    username: str
    password: str
    org_name: str = ""


@router.post("/bootstrap-owner")
async def bootstrap_owner(body: BootstrapRequest, settings = Depends(get_settings)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        # If any admin exists, do nothing (two-role model).
        # Use COUNT (or a LIMIT 1 query) to avoid MultipleResultsFound when multiple admins exist.
        try:
            cnt = (await session.execute(
                select(func.count()).select_from(User).where(User.role == "Admin")
            )).scalar_one()
            if int(cnt or 0) > 0:
                return {"status": "skipped"}
        except Exception:
            # Fallback: tolerate duplicates and just detect existence.
            exists_any = (await session.execute(select(User).where(User.role == "Admin").limit(1))).first()
            if exists_any:
                return {"status": "skipped"}
        org_id = None
        if body.org_name:
            org = Organization(name=body.org_name)
            session.add(org)
            await session.flush()
            org_id = org.id
        hashed = pwd_context.hash(body.password)
        user = User(username=body.username, role="Admin", org_id=org_id, password_hash=hashed)
        session.add(user)
        await session.commit()
        return {"status": "ok", "owner_id": user.id}


@router.get("/upstreams")
async def upstreams_health():
    # Returns in-memory breaker, health snapshots, and diagnostics meta (no secrets)
    out = snapshot_states()
    
    # Add served names to metadata (for UI display)
    try:
        reg = get_model_registry()
        # Build reverse map: url -> [served_names]
        url_to_names: dict[str, list[str]] = {}
        for served_name, meta in reg.items():
            url = str(meta.get("url", ""))
            if url:
                url_to_names.setdefault(url, []).append(served_name)
        
        # Inject served_names into meta for each URL
        meta_dict = out.get("meta", {}) or {}
        for url, names in url_to_names.items():
            if url in meta_dict:
                meta_dict[url]["served_names"] = names
        out["meta"] = meta_dict
    except Exception:
        pass
    
    # Filter out stale URLs that are no longer part of active pools/registry
    try:
        settings = get_settings()
        from ..state import registry_urls as _reg_urls
        active: set[str] = set(settings.gen_urls() + settings.emb_urls() + _reg_urls())
        # Trim health/meta/breakers to active set only to avoid duplicates from old ephemeral ports
        health = out.get("health", {}) or {}
        meta = out.get("meta", {}) or {}
        breakers = out.get("circuit_breakers", {}) or {}
        out["health"] = {u: health[u] for u in list(health.keys()) if u in active}
        out["meta"] = {u: meta[u] for u in list(meta.keys()) if u in active}
        out["circuit_breakers"] = {u: breakers[u] for u in list(breakers.keys()) if u in active}
    except Exception:
        # best-effort filtering only
        pass
    # Derive breaker state summary and cooldown remaining per URL
    try:
        now = out.get("now") or time.time()
        breakers = out.get("circuit_breakers", {})
        meta = out.get("meta", {})
        for url, st in breakers.items():
            open_until = float(st.get("open_until", 0.0))
            cooldown = max(0.0, open_until - now)
            m = meta.setdefault(url, {})
            m["breaker"] = {
                "state": "OPEN" if cooldown > 0 else "CLOSED",
                "cooldown_remaining_sec": round(cooldown, 3),
                "consecutive_fails": int(st.get("fail", 0)),
            }
        out["meta"] = meta
    except Exception:
        pass
    out["health_ttl_sec"] = get_settings().HEALTH_CHECK_TTL_SEC
    # Optionally add per-engine tokens/sec via Prometheus (best-effort)
    try:
        settings = get_settings()
        base = settings.PROMETHEUS_URL.rstrip("/")
        # Build simple mapping from URL host:port (e.g., vllm-gen:8000) for instance label
        meta = out.get("meta", {})
        # Add/normalize category. Prefer existing category (from health poller/registry).
        # If missing or unknown, infer from configured pools or registry mapping.
        try:
            gen_urls = set(settings.gen_urls())
            emb_urls = set(settings.emb_urls())
            from ..state import get_model_registry as _get_reg
            reg = _get_reg()
            # Build quick reverse map: url -> task
            url_to_task: dict[str, str] = {}
            for _name, _meta in reg.items():
                try:
                    u = str(_meta.get("url")); t = str(_meta.get("task") or "generate")
                    if u:
                        url_to_task[u] = t
                except Exception:
                    pass
            for url in list(meta.keys()):
                cat = str(meta.get(url, {}).get("category") or "")
                if not cat or cat == "unknown":
                    if url in gen_urls:
                        cat = "generate"
                    elif url in emb_urls:
                        cat = "embed"
                    elif url in url_to_task:
                        cat = url_to_task.get(url, "unknown")
                    else:
                        cat = "unknown"
                    meta[url]["category"] = cat
        except Exception:
            pass
        for url in list(meta.keys()):
            import urllib.parse as _up
            try:
                inst = _up.urlparse(url).netloc
                def _q(expr: str) -> float:
                    try:
                        r = httpx.get(f"{base}/api/v1/query", params={"query": expr}, timeout=4.0)
                        data = r.json(); vals = data.get("data", {}).get("result", [])
                        if not vals:
                            return 0.0
                        return float(vals[0].get("value", [None, "0"]) [1])
                    except Exception:
                        return 0.0
                pts = _q(f'sum(rate(vllm:prompt_tokens_total{{instance="{inst}"}}[1m]))')
                gts = _q(f'sum(rate(vllm:generation_tokens_total{{instance="{inst}"}}[1m]))')
                meta[url]["tokens_per_sec"] = {"prompt": pts, "generation": gts}
            except Exception:
                pass
        # Best-effort model list via /v1/models (requires internal key if enforced)
        try:
            for url in list(meta.keys()):
                try:
                    headers = {}
                    if settings.INTERNAL_VLLM_API_KEY:
                        headers["Authorization"] = f"Bearer {settings.INTERNAL_VLLM_API_KEY}"
                    r = httpx.get(f"{url}/v1/models", headers=headers, timeout=3.0)
                    data = r.json()
                    ids = [m.get("id") for m in (data.get("data") or []) if isinstance(m, dict) and m.get("id")]
                    if ids:
                        meta[url]["models"] = ids
                except Exception:
                    pass
        except Exception:
            pass
        # Final normalization: if any url matches a registry entry, force category from that task
        try:
            from ..state import get_model_registry as _get_reg2
            reg2 = _get_reg2()
            url_to_task2 = {str(v.get("url")): str(v.get("task") or "generate") for v in reg2.values() if isinstance(v, dict)}
            for url in list(meta.keys()):
                if url in url_to_task2:
                    meta[url]["category"] = url_to_task2[url]
            out["meta"] = meta
        except Exception:
            pass
    except Exception:
        pass
    # Always enforce registry category mapping even if previous block failed
    try:
        from ..state import get_model_registry as _reg_final
        reg_final = _reg_final()
        meta = out.get("meta", {}) or {}
        url_to_task_final = {str(v.get("url")): str(v.get("task") or "generate") for v in reg_final.values() if isinstance(v, dict)}
        for url, task in url_to_task_final.items():
            if url in meta:
                meta[url]["category"] = task
        out["meta"] = meta
    except Exception:
        pass
    return out


# ---------------------------
# Gateway model registry
# ---------------------------

class RegistryEntry(BaseModel):
    served_name: str
    url: str
    task: str


@router.get("/models/registry", response_model=dict)
async def list_model_registry(_: dict = Depends(require_admin)):
    return get_model_registry()


@router.post("/models/registry")
async def add_model_registry(body: RegistryEntry, _: dict = Depends(require_admin)):
    if not body.served_name or not body.url:
        raise HTTPException(status_code=400, detail="invalid_registry_entry")
    register_model_endpoint(body.served_name, body.url, body.task or "generate")
    # Persist registry to ConfigKV (best-effort)
    try:
        SessionLocal = _get_session()
        if SessionLocal is not None:
            from ..models import ConfigKV  # type: ignore
            import json as _json
            async with SessionLocal() as s:
                val = _json.dumps(get_model_registry())
                from sqlalchemy import select as _select
                row = (await s.execute(_select(ConfigKV).where(ConfigKV.key == "model_registry"))).scalar_one_or_none()
                if row:
                    row.value = val
                else:
                    s.add(ConfigKV(key="model_registry", value=val))
                await s.commit()
    except Exception:
        pass
    return {"status": "ok"}


@router.delete("/models/registry/{served_name}")
async def remove_model_registry(served_name: str, _: dict = Depends(require_admin)):
    if not served_name:
        raise HTTPException(status_code=400, detail="invalid_served_name")
    unregister_model_endpoint(served_name)
    # Persist after removal
    try:
        SessionLocal = _get_session()
        if SessionLocal is not None:
            from ..models import ConfigKV  # type: ignore
            import json as _json
            async with SessionLocal() as s:
                val = _json.dumps(get_model_registry())
                from sqlalchemy import select as _select
                row = (await s.execute(_select(ConfigKV).where(ConfigKV.key == "model_registry"))).scalar_one_or_none()
                if row:
                    row.value = val
                else:
                    s.add(ConfigKV(key="model_registry", value=val))
                await s.commit()
    except Exception:
        pass
    return {"status": "ok"}


class UsageItem(BaseModel):
    id: int
    key_id: int | None
    model_name: str
    task: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    latency_ms: int
    status_code: int
    req_id: str
    created_at: float


@router.get("/usage", response_model=list[UsageItem])
async def list_usage(
    limit: int = 50,
    offset: int = 0,
    hours: Optional[int] = None,
    model: Optional[str] = None,
    task: Optional[str] = None,
    key_id: Optional[int] = None,
    user_id: Optional[int] = None,
    org_id: Optional[int] = None,
    status: Optional[str] = None,  # '2xx', '4xx', '5xx' or exact code
):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        from ..models import Usage  # local import to avoid cycles
        q = select(Usage)
        if hours is not None:
            from datetime import datetime, timedelta
            since = datetime.utcnow() - timedelta(hours=max(1, min(int(hours), 24 * 30)))
            q = q.where(Usage.created_at >= since)
        if model:
            q = q.where(Usage.model_name == model)
        if task:
            q = q.where(Usage.task == task)
        if key_id is not None:
            q = q.where(Usage.key_id == key_id)
        if user_id is not None:
            q = q.where(Usage.user_id == user_id)
        if org_id is not None:
            q = q.where(Usage.org_id == org_id)
        if status:
            if status.endswith('xx') and len(status) == 3 and status[0].isdigit():
                base = int(status[0]) * 100
                q = q.where(Usage.status_code >= base, Usage.status_code < base + 100)
            else:
                try:
                    code = int(status)
                    q = q.where(Usage.status_code == code)
                except Exception:
                    pass
        q = q.order_by(Usage.id.desc()).limit(max(1, min(limit, 1000))).offset(max(0, offset))
        result = await session.execute(q)
        rows = result.scalars().all()
        return [
            UsageItem(
                id=r.id,
                key_id=r.key_id,
                model_name=r.model_name,
                task=r.task,
                prompt_tokens=r.prompt_tokens,
                completion_tokens=r.completion_tokens,
                total_tokens=r.total_tokens,
                latency_ms=r.latency_ms,
                status_code=r.status_code,
                req_id=r.req_id,
                created_at=r.created_at.timestamp() if hasattr(r.created_at, 'timestamp') else 0.0,
            )
            for r in rows
        ]


class UsageAggItem(BaseModel):
    model_name: str
    requests: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


@router.get("/usage/aggregate", response_model=list[UsageAggItem])
async def usage_aggregate(hours: int = 24, model: Optional[str] = None):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        from ..models import Usage  # local import to avoid cycles
        from datetime import datetime, timedelta
        since = datetime.utcnow() - timedelta(hours=max(1, min(hours, 24 * 30)))
        q = (
            select(
                Usage.model_name.label("model_name"),
                func.count(Usage.id).label("requests"),
                func.coalesce(func.sum(Usage.prompt_tokens), 0).label("prompt_tokens"),
                func.coalesce(func.sum(Usage.completion_tokens), 0).label("completion_tokens"),
                func.coalesce(func.sum(Usage.total_tokens), 0).label("total_tokens"),
            )
            .where(Usage.created_at >= since)
            .group_by(Usage.model_name)
            .order_by(func.count(Usage.id).desc())
        )
        if model:
            q = q.where(Usage.model_name == model)
        result = await session.execute(q)
        rows = result.all()
        return [
            UsageAggItem(
                model_name=r.model_name,
                requests=int(r.requests or 0),
                prompt_tokens=int(r.prompt_tokens or 0),
                completion_tokens=int(r.completion_tokens or 0),
                total_tokens=int(r.total_tokens or 0),
            )
            for r in rows
        ]


class UsageSeriesItem(BaseModel):
    ts: float
    requests: int
    total_tokens: int


@router.get("/usage/series", response_model=list[UsageSeriesItem])
async def usage_series(hours: int = 24, bucket: str = "hour", model: Optional[str] = None):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    if bucket not in ("hour", "minute"):
        raise HTTPException(status_code=400, detail="invalid_bucket")
    async with SessionLocal() as session:
        from ..models import Usage  # local import
        from datetime import datetime, timedelta
        since = datetime.utcnow() - timedelta(hours=max(1, min(hours, 24 * 30)))
        trunc = func.date_trunc(bucket, Usage.created_at).label("bucket")
        q = (
            select(
                trunc,
                func.count(Usage.id).label("requests"),
                func.coalesce(func.sum(Usage.total_tokens), 0).label("total_tokens"),
            )
            .where(Usage.created_at >= since)
            .group_by(trunc)
            .order_by(trunc.asc())
        )
        if model:
            q = q.where(Usage.model_name == model)
        result = await session.execute(q)
        rows = result.all()
        out: list[UsageSeriesItem] = []
        for r in rows:
            dt = r.bucket
            try:
                ts = dt.timestamp()
            except Exception:
                ts = 0.0
            out.append(
                UsageSeriesItem(
                    ts=ts,
                    requests=int(r.requests or 0),
                    total_tokens=int(r.total_tokens or 0),
                )
            )
        return out


class LatencySummary(BaseModel):
    p50_ms: float
    p95_ms: float
    avg_ms: float


@router.get("/usage/latency", response_model=LatencySummary)
async def usage_latency(hours: int = 24, model: Optional[str] = None):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        from ..models import Usage
        from datetime import datetime, timedelta
        since = datetime.utcnow() - timedelta(hours=max(1, min(hours, 24 * 30)))
        q = select(Usage.latency_ms).where(Usage.created_at >= since)
        if model:
            q = q.where(Usage.model_name == model)
        q = q.order_by(Usage.latency_ms.asc()).limit(50000)
        vals = [int(v or 0) for v in (await session.execute(q)).scalars().all()]
        if not vals:
            return LatencySummary(p50_ms=0.0, p95_ms=0.0, avg_ms=0.0)
        n = len(vals)
        def percentile(p: float) -> float:
            if n == 1:
                return float(vals[0])
            k = max(0, min(n - 1, int(round(p * (n - 1)))))
            return float(vals[k])
        p50 = percentile(0.5)
        p95 = percentile(0.95)
        avg = sum(vals) / n
        return LatencySummary(p50_ms=p50, p95_ms=p95, avg_ms=avg)


class TtftSummary(BaseModel):
    p50_s: float
    p95_s: float


@router.get("/usage/ttft", response_model=TtftSummary)
async def usage_ttft():
    # Approximate quantiles from Prometheus histogram if available
    try:
        from ..metrics import STREAM_TTFT_SECONDS
        # prometheus_client Histogram buckets are stored internally; not a public API, so best-effort
        histogram = STREAM_TTFT_SECONDS
        sample = getattr(histogram, '_sum', None)
        buckets = getattr(histogram, '_buckets', None)
        counts = getattr(histogram, '_count', None)
        if not buckets or not isinstance(buckets, dict):
            return TtftSummary(p50_s=0.0, p95_s=0.0)
        total = sum(buckets.values())
        if total <= 0:
            return TtftSummary(p50_s=0.0, p95_s=0.0)
        items = sorted(((float(k), int(v)) for k, v in buckets.items()), key=lambda x: x[0])
        cum = 0
        p50 = 0.0
        p95 = 0.0
        for bound, cnt in items:
            cum += cnt
            q = cum / total
            if p50 == 0.0 and q >= 0.5:
                p50 = bound
            if p95 == 0.0 and q >= 0.95:
                p95 = bound
                break
        return TtftSummary(p50_s=p50, p95_s=p95)
    except Exception:
        return TtftSummary(p50_s=0.0, p95_s=0.0)


@router.get("/usage/export")
async def usage_export(
    hours: Optional[int] = None,
    model: Optional[str] = None,
    task: Optional[str] = None,
    key_id: Optional[int] = None,
    user_id: Optional[int] = None,
    org_id: Optional[int] = None,
    status: Optional[str] = None,
):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        from ..models import Usage
        q = select(Usage)
        if hours is not None:
            from datetime import datetime, timedelta
            since = datetime.utcnow() - timedelta(hours=max(1, min(int(hours), 24 * 30)))
            q = q.where(Usage.created_at >= since)
        if model:
            q = q.where(Usage.model_name == model)
        if task:
            q = q.where(Usage.task == task)
        if key_id is not None:
            q = q.where(Usage.key_id == key_id)
        if user_id is not None:
            q = q.where(Usage.user_id == user_id)
        if org_id is not None:
            q = q.where(Usage.org_id == org_id)
        if status:
            if status.endswith('xx') and len(status) == 3 and status[0].isdigit():
                base = int(status[0]) * 100
                q = q.where(Usage.status_code >= base, Usage.status_code < base + 100)
            else:
                try:
                    code = int(status)
                    q = q.where(Usage.status_code == code)
                except Exception:
                    pass
        q = q.order_by(Usage.id.desc()).limit(50000)
        rows = (await session.execute(q)).scalars().all()
        # Build CSV
        import io, csv
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["id", "created_at", "key_id", "model", "task", "prompt_tokens", "completion_tokens", "total_tokens", "latency_ms", "status_code", "req_id"])
        for r in rows:
            ts = r.created_at.timestamp() if hasattr(r.created_at, 'timestamp') else 0.0
            writer.writerow([r.id, ts, r.key_id, r.model_name, r.task, r.prompt_tokens, r.completion_tokens, r.total_tokens, r.latency_ms, r.status_code, r.req_id])
        return Response(content=buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=usage_export.csv"})


class HealthRefreshRequest(BaseModel):
    urls: list[str] | None = None


@router.post("/upstreams/refresh-health")
async def refresh_upstreams_health(body: HealthRefreshRequest | None = None, settings = Depends(get_settings)):
    # On-demand active health checks for configured URLs
    http_client = _get_http_client()
    if http_client is None:
        raise HTTPException(status_code=503, detail="HTTP client not ready")
    gen_urls = settings.gen_urls()
    emb_urls = settings.emb_urls()
    targets = sorted(set((body.urls or []) + gen_urls + emb_urls))
    results = []
    for u in targets:
        status = "down"
        try:
            t0 = time.time()
            # Align with httpx 0.27 timeout requirements
            resp = await http_client.get(
                f"{u}{settings.HEALTH_CHECK_PATH}",
                timeout=httpx.Timeout(connect=2.0, read=3.0, write=3.0, pool=5.0),
            )
            status = "up" if 200 <= resp.status_code < 500 else f"err:{resp.status_code}"
            elapsed = time.time() - t0
        except Exception as e:
            elapsed = None
            status = "error"
        results.append({"url": u, "status": status, "elapsed_sec": elapsed})
    return {"results": results}


# ---------------------------
# Node exporter host metrics
# ---------------------------

class HostSummary(BaseModel):
    cpu_util_pct: float
    load_avg_1m: float | None = None
    mem_total_mb: float
    mem_used_mb: float
    disk_total_gb: float | None = None
    disk_used_gb: float | None = None
    disk_used_pct: float | None = None
    net_rx_bps: float
    net_tx_bps: float


def _prom_query(settings, expr: str) -> float:
    try:
        base = settings.PROMETHEUS_URL.rstrip("/")
        resp = httpx.get(f"{base}/api/v1/query", params={"query": expr}, timeout=5.0)
        data = resp.json()
        vals = data.get("data", {}).get("result", [])
        if not vals:
            return 0.0
        return float(vals[0].get("value", [None, "0"]) [1])
    except Exception:
        return 0.0


def _prom_range(settings, expr: str, minutes: int, step_s: int) -> list[tuple[float, float]]:
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
        out: list[tuple[float, float]] = []
        for ts, val in series:
            try:
                out.append((float(ts), float(val)))
            except Exception:
                pass
        return out
    except Exception:
        return []


def _prom_range_matrix(settings, expr: str, minutes: int, step_s: int, label: str) -> dict[str, list[tuple[float, float]]]:
    """Query multiple time-series and group by label value.
    Returns { label_value: [(ts, value), ...] }.
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
        out: dict[str, list[tuple[float, float]]] = {}
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


def _prom_instant_matrix(settings, expr: str, label: str) -> dict[str, float]:
    """Instant vector grouped by label -> float value."""
    try:
        base = settings.PROMETHEUS_URL.rstrip("/")
        resp = httpx.get(f"{base}/api/v1/query", params={"query": expr}, timeout=6.0)
        data = resp.json()
        res = data.get("data", {}).get("result", [])
        out: dict[str, float] = {}
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


_host_cache: tuple[float, HostSummary] | None = None
_ps_prev: tuple[float, float, float] | None = None  # ts, bytes_recv, bytes_sent


@router.get("/system/host/summary", response_model=HostSummary)
async def system_host_summary(settings = Depends(get_settings), _: dict = Depends(require_admin)):
    """Node exporter KPIs: CPU util, mem usage, disk usage, net throughput. 5s cache."""
    now = time.monotonic()
    ttl = 5.0
    global _host_cache
    try:
        ts, cached = _host_cache or (0.0, None)  # type: ignore
        if cached and now - ts < ttl:
            return cached
    except Exception:
        pass
    # CPU util %
    cpu_idle = _prom_query(settings, 'avg(rate(node_cpu_seconds_total{mode="idle"}[1m]))')
    cpu_util_pct = max(0.0, min(100.0, (1.0 - cpu_idle) * 100.0)) if cpu_idle > 0 else 0.0
    # Load1
    load1 = _prom_query(settings, 'avg(node_load1)')
    # Memory MB
    mem_total = _prom_query(settings, 'sum(node_memory_MemTotal_bytes)') / (1024 * 1024)
    mem_avail = _prom_query(settings, 'sum(node_memory_MemAvailable_bytes)') / (1024 * 1024)
    mem_used = max(0.0, mem_total - mem_avail)
    # Disk (root)
    disk_total_b = _prom_query(settings, 'sum(node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|aufs|fuse.lxcfs"})')
    disk_avail_b = _prom_query(settings, 'sum(node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|aufs|fuse.lxcfs"})')
    disk_total_gb = disk_total_b / (1024 * 1024 * 1024) if disk_total_b > 0 else None
    disk_used_gb = ((disk_total_b - disk_avail_b) / (1024 * 1024 * 1024)) if disk_total_b > 0 else None
    disk_used_pct = (100.0 * (1.0 - (disk_avail_b / disk_total_b))) if disk_total_b > 0 else None
    # Network B/s
    net_rx_bps = _prom_query(settings, 'sum(rate(node_network_receive_bytes_total{device!~"lo|docker.*|veth.*"}[1m]))')
    net_tx_bps = _prom_query(settings, 'sum(rate(node_network_transmit_bytes_total{device!~"lo|docker.*|veth.*"}[1m]))')

    # Fallback to psutil on non-Linux dev hosts where node-exporter is unavailable
    if cpu_idle == 0 and mem_total == 0 and net_rx_bps == 0 and net_tx_bps == 0:
        try:
            import psutil  # type: ignore
            cpu_util_pct = float(psutil.cpu_percent(interval=0.05))
            try:
                la = psutil.getloadavg()
                load1 = float(la[0]) if la else 0.0
            except Exception:
                load1 = 0.0
            vm = psutil.virtual_memory()
            mem_total = round(vm.total / (1024 * 1024), 2)
            mem_used = round((vm.total - vm.available) / (1024 * 1024), 2)
            du = None
            try:
                du = psutil.disk_usage('/')
            except Exception:
                try:
                    du = psutil.disk_usage('C:\\')  # Windows fallback
                except Exception:
                    du = None
            if du:
                disk_total_gb = round(du.total / (1024 * 1024 * 1024), 2)
                disk_used_gb = round(du.used / (1024 * 1024 * 1024), 2)
                disk_used_pct = (du.used / du.total) * 100.0 if du.total > 0 else None
            # Estimate net B/s from two samples
            global _ps_prev
            import time as _t
            ts = _t.time()
            io1 = psutil.net_io_counters()
            if _ps_prev is not None:
                prev_ts, prev_rx, prev_tx = _ps_prev
                dt = max(0.05, ts - prev_ts)
                net_rx_bps = max(0.0, (io1.bytes_recv - prev_rx) / dt)
                net_tx_bps = max(0.0, (io1.bytes_sent - prev_tx) / dt)
            else:
                # Take a short second sample to estimate immediately
                import time as __t
                __t.sleep(0.15)
                ts2 = _t.time()
                io2 = psutil.net_io_counters()
                dt = max(0.05, ts2 - ts)
                net_rx_bps = max(0.0, (io2.bytes_recv - io1.bytes_recv) / dt)
                net_tx_bps = max(0.0, (io2.bytes_sent - io1.bytes_sent) / dt)
            _ps_prev = (ts, float(io1.bytes_recv), float(io1.bytes_sent))
        except Exception:
            pass
    out = HostSummary(
        cpu_util_pct=cpu_util_pct,
        load_avg_1m=float(load1) if load1 is not None else 0.0,
        mem_total_mb=float(mem_total),
        mem_used_mb=float(mem_used),
        disk_total_gb=float(disk_total_gb) if disk_total_gb is not None else None,
        disk_used_gb=float(disk_used_gb) if disk_used_gb is not None else None,
        disk_used_pct=float(disk_used_pct) if disk_used_pct is not None else None,
        net_rx_bps=float(net_rx_bps),
        net_tx_bps=float(net_tx_bps),
    )
    _host_cache = (now, out)
    return out


class TimePoint(BaseModel):
    ts: float
    value: float


class HostTrends(BaseModel):
    cpu_util_pct: list[TimePoint]
    mem_used_mb: list[TimePoint]
    disk_used_pct: list[TimePoint]
    net_rx_bps: list[TimePoint]
    net_tx_bps: list[TimePoint]
    # Expanded breakdowns
    cpu_per_core_pct: dict[str, list[TimePoint]] | None = None
    disk_rw_bps: dict[str, dict[str, list[TimePoint]]] | None = None  # {device: {read: [], write: []}}
    net_per_iface_bps: dict[str, dict[str, list[TimePoint]]] | None = None  # {iface: {rx: [], tx: []}}


_trends_cache: tuple[float, HostTrends] | None = None
_win_series: dict[str, list[tuple[float, float]]] = {  # Windows/psutil fallback ring buffers
    "cpu": [],  # (ts, value)
    "mem": [],
    "disk": [],
    "rx": [],
    "tx": [],
}

def _win_series_append(ts: float, cpu: float, mem_mb: float, disk_pct: float, rx_bps: float, tx_bps: float, keep_sec: int = 3600) -> None:
    try:
        for key, val in (
            ("cpu", cpu), ("mem", mem_mb), ("disk", disk_pct), ("rx", rx_bps), ("tx", tx_bps)
        ):
            arr = _win_series.get(key)
            if arr is None:
                arr = []
                _win_series[key] = arr
            arr.append((ts, float(val)))
            # prune
            cutoff = ts - keep_sec
            while arr and arr[0][0] < cutoff:
                arr.pop(0)
    except Exception:
        # best-effort only
        pass


@router.get("/system/host/trends", response_model=HostTrends)
async def system_host_trends(minutes: int = 15, step_s: int = 15, settings = Depends(get_settings), _: dict = Depends(require_admin)):
    """Return 5–15 min trend series for CPU, mem, disk, and network from node-exporter."""
    minutes = max(1, min(int(minutes), 60))
    step_s = max(5, min(int(step_s), 60))
    now = time.monotonic()
    ttl = 5.0
    global _trends_cache
    try:
        ts, cached = _trends_cache or (0.0, None)  # type: ignore
        if cached and now - ts < ttl and minutes == 15 and step_s == 15:
            return cached
    except Exception:
        pass
    # Series queries
    cpu_series = _prom_range(settings, '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)', minutes, step_s)
    mem_total_mb = _prom_range(settings, 'sum(node_memory_MemTotal_bytes)/(1024*1024)', minutes, step_s)
    mem_avail_mb = _prom_range(settings, 'sum(node_memory_MemAvailable_bytes)/(1024*1024)', minutes, step_s)
    disk_used_pct = _prom_range(settings, '100 * (1 - sum(node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|aufs|fuse.lxcfs"}) / sum(node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|aufs|fuse.lxcfs"}))', minutes, step_s)
    if not disk_used_pct:
        # Some environments do not expose filesystem metrics; fallback to psutil point-in-time and tile across range
        try:
            import psutil  # type: ignore
            import time as _t
            end = int(_t.time())
            start = end - minutes * 60
            series_ts = list(range(start, end + 1, step_s))
            du = None
            try:
                du = psutil.disk_usage('/')
            except Exception:
                try:
                    du = psutil.disk_usage('C:\\')
                except Exception:
                    du = None
            if du and du.total > 0:
                pct = (du.used / du.total) * 100.0
                disk_used_pct = [(ts, pct) for ts in series_ts]
        except Exception:
            pass
    rx_series = _prom_range(settings, 'sum(rate(node_network_receive_bytes_total{device!~"lo|docker.*|veth.*"}[1m]))', minutes, step_s)
    tx_series = _prom_range(settings, 'sum(rate(node_network_transmit_bytes_total{device!~"lo|docker.*|veth.*"}[1m]))', minutes, step_s)

    # psutil fallback for Windows dev when Prometheus has no node metrics
    if not cpu_series:
        try:
            import psutil  # type: ignore
            import time as _t
            end = int(_t.time())
            start = end - minutes * 60
            step = step_s
            # Sample current values
            cpu = float(psutil.cpu_percent(interval=0.05))
            vm = psutil.virtual_memory()
            mem_used_mb = (vm.total - vm.available) / (1024 * 1024)
            try:
                du = psutil.disk_usage('/')
            except Exception:
                du = psutil.disk_usage('C:\\')
            disk_pct = (du.used / du.total) * 100.0 if du.total > 0 else 0.0
            # Net: sample twice for instantaneous delta
            io1 = psutil.net_io_counters()
            _t.sleep(0.12)
            io2 = psutil.net_io_counters()
            dt = max(0.05, _t.time() - end)
            rx_bps = max(0.0, (io2.bytes_recv - io1.bytes_recv) / dt)
            tx_bps = max(0.0, (io2.bytes_sent - io1.bytes_sent) / dt)
            # Append to ring buffer
            _win_series_append(float(end), cpu, mem_used_mb, disk_pct, rx_bps, tx_bps)
            # Per-core snapshot (tile across range)
            try:
                per_core = psutil.cpu_percent(interval=0.05, percpu=True)
            except Exception:
                per_core = []
            cpu_per_core_map: dict[str, list[TimePoint]] = {}
            series_ts = list(range(start, end + 1, step))
            for idx, val in enumerate(per_core or []):
                cpu_per_core_map[str(idx)] = [TimePoint(ts=float(ts), value=float(val)) for ts in series_ts]
            # Build series from ring buffers, filter to range, sort by ts
            def _from_buf(key: str) -> list[tuple[float, float]]:
                arr = list(_win_series.get(key) or [])
                filtered = [(ts, val) for ts, val in arr if start <= ts <= end]
                if not filtered:
                    # tile latest with subtle noise if available, else zero
                    import random
                    latest = arr[-1][1] if arr else 0.0
                    return [(float(ts), latest * (1 + random.uniform(-0.005, 0.005))) for ts in series_ts]
                return sorted(filtered, key=lambda p: p[0])
            cpu_series = _from_buf('cpu')
            mem_used = _from_buf('mem')
            disk_used_pct = _from_buf('disk')
            rx_series = _from_buf('rx')
            tx_series = _from_buf('tx')
            def conv(arr: list[tuple[float, float]]) -> list[TimePoint]:
                return [TimePoint(ts=ts, value=val) for ts, val in arr]
            return HostTrends(
                cpu_util_pct=conv(cpu_series),
                mem_used_mb=conv(mem_used),
                disk_used_pct=conv(disk_used_pct),
                net_rx_bps=conv(rx_series),
                net_tx_bps=conv(tx_series),
                cpu_per_core_pct=cpu_per_core_map or None,
            )
        except Exception:
            pass
    # Compute mem used = total - available (align by ts)
    def to_map(arr: list[tuple[float, float]]):
        return {ts: val for ts, val in arr}
    mt = to_map(mem_total_mb)
    ma = to_map(mem_avail_mb)
    mem_used = []
    for ts, _ in sorted(mt.items()):
        if ts in ma:
            mem_used.append((ts, max(0.0, mt[ts] - ma[ts])))
    def conv(arr: list[tuple[float, float]]) -> list[TimePoint]:
        return [TimePoint(ts=ts, value=val) for ts, val in arr]
    # Expanded per-core, per-disk, per-interface series (best-effort if node-exporter up)
    cpu_per_core = _prom_range_matrix(settings, '100 - (rate(node_cpu_seconds_total{mode="idle"}[1m]) * 100)', minutes, step_s, 'cpu')
    if not cpu_per_core:
        # Fallback to psutil per-core snapshot if exporter didn't return series
        try:
            import psutil  # type: ignore
            import time as _t
            end = int(_t.time())
            start = end - minutes * 60
            series_ts = list(range(start, end + 1, step_s))
            per_core = psutil.cpu_percent(interval=0.05, percpu=True) or []
            tmp: dict[str, list[tuple[float, float]]] = {}
            for idx, val in enumerate(per_core):
                tmp[str(idx)] = [(ts, float(val)) for ts in series_ts]
            cpu_per_core = tmp
        except Exception:
            cpu_per_core = {}
    # Disks: read/write bytes per second by device (filter out loop/dm/ram)
    r_map = _prom_range_matrix(settings, 'rate(node_disk_read_bytes_total{device!~"loop.*|dm.*|ram.*"}[1m])', minutes, step_s, 'device')
    w_map = _prom_range_matrix(settings, 'rate(node_disk_written_bytes_total{device!~"loop.*|dm.*|ram.*"}[1m])', minutes, step_s, 'device')
    disk_rw: dict[str, dict[str, list[TimePoint]]] = {}
    for dev in set(list(r_map.keys()) + list(w_map.keys())):
        r_vals = [TimePoint(ts=ts, value=val) for ts, val in r_map.get(dev, [])]
        w_vals = [TimePoint(ts=ts, value=val) for ts, val in w_map.get(dev, [])]
        disk_rw[dev] = { 'read': r_vals, 'write': w_vals }
    # Network per interface RX/TX (exclude lo/docker/veth)
    rx_map = _prom_range_matrix(settings, 'rate(node_network_receive_bytes_total{device!~"lo|docker.*|veth.*"}[1m])', minutes, step_s, 'device')
    tx_map = _prom_range_matrix(settings, 'rate(node_network_transmit_bytes_total{device!~"lo|docker.*|veth.*"}[1m])', minutes, step_s, 'device')
    net_if: dict[str, dict[str, list[TimePoint]]] = {}
    for iface in set(list(rx_map.keys()) + list(tx_map.keys())):
        rx_vals = [TimePoint(ts=ts, value=val) for ts, val in rx_map.get(iface, [])]
        tx_vals = [TimePoint(ts=ts, value=val) for ts, val in tx_map.get(iface, [])]
        net_if[iface] = { 'rx': rx_vals, 'tx': tx_vals }

    out = HostTrends(
        cpu_util_pct=conv(cpu_series),
        mem_used_mb=conv(mem_used),
        disk_used_pct=conv(disk_used_pct),
        net_rx_bps=conv(rx_series),
        net_tx_bps=conv(tx_series),
        cpu_per_core_pct={ k: [TimePoint(ts=ts, value=val) for ts, val in v] for k, v in cpu_per_core.items() } or None,
        disk_rw_bps=disk_rw or None,
        net_per_iface_bps=net_if or None,
    )
    if minutes == 15 and step_s == 15:
        _trends_cache = (now, out)
    return out


# ---------------------------
# Capabilities detection
# ---------------------------

class PromTargets(BaseModel):
    up: bool
    nodeExporter: str | None = None
    dcgmExporter: str | None = None
    cadvisor: str | None = None


class Capabilities(BaseModel):
    os: str
    isContainer: bool
    isWSL: bool
    prometheus: PromTargets
    gpu: dict
    selectedProviders: dict
    suggestions: list[str]

_caps_cache: tuple[float, Capabilities] | None = None


@router.get("/system/capabilities", response_model=Capabilities)
async def system_capabilities(settings = Depends(get_settings), _: dict = Depends(require_admin)):
    import platform, os as _os
    now = time.monotonic()
    ttl = 30.0
    global _caps_cache
    try:
        ts, cached = _caps_cache or (0.0, None)  # type: ignore
        if cached and now - ts < ttl:
            return cached
    except Exception:
        pass

    sys_os = platform.system().lower()
    is_container = _os.path.exists('/.dockerenv')
    is_wsl = False
    try:
        if sys_os == 'linux':
            with open('/proc/version', 'r', encoding='utf-8', errors='ignore') as f:
                is_wsl = 'microsoft' in f.read().lower()
        if _os.environ.get('WSL_INTEROP'):
            is_wsl = True
    except Exception:
        pass

    # Prometheus targets health
    prom_up = False
    node_state = dcgm_state = cad_state = None
    try:
        base = settings.PROMETHEUS_URL.rstrip('/')
        async with _httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(f"{base}/-/ready")
            prom_up = r.status_code == 200
            r2 = await client.get(f"{base}/api/v1/targets")
            data = r2.json()
            for t in data.get('data', {}).get('activeTargets', []):
                job = t.get('labels', {}).get('job')
                health = t.get('health') or t.get('lastScrape') and 'UP' or 'DOWN'
                if job == 'node-exporter':
                    node_state = health
                elif job == 'dcgm-exporter':
                    dcgm_state = health
                elif job == 'cadvisor':
                    cad_state = health
    except Exception:
        prom_up = False

    # NVML probe
    gpu_info: dict = {"nvml": False, "count": 0, "driver": None}
    try:
        from pynvml import nvmlInit, nvmlShutdown, nvmlDeviceGetCount, nvmlSystemGetDriverVersion  # type: ignore
        nvmlInit()
        try:
            gpu_info["count"] = int(nvmlDeviceGetCount())
            gpu_info["driver"] = nvmlSystemGetDriverVersion().decode()
            gpu_info["nvml"] = True
        finally:
            nvmlShutdown()
    except Exception:
        pass

    # Provider selection
    host_provider = 'prometheus' if node_state == 'up' else ('psutil' if sys_os == 'windows' or not prom_up else 'psutil')
    gpu_provider = 'dcgm' if dcgm_state == 'up' else ('nvml' if gpu_info.get('nvml') else 'none')
    selected = {"host": host_provider, "gpu": gpu_provider}

    # Suggestions
    suggestions: list[str] = []
    if sys_os != 'linux':
        suggestions.append('For full host/GPU metrics, run under Linux or WSL2 with exporters enabled.')
    if sys_os == 'linux' and node_state != 'up':
        suggestions.append('Enable host exporters: docker compose --profile linux up -d')
    if sys_os == 'linux' and gpu_provider != 'dcgm':
        suggestions.append('Enable GPU exporters: docker compose --profile linux --profile gpu up -d')

    out = Capabilities(
        os=sys_os,
        isContainer=is_container,
        isWSL=is_wsl,
        prometheus=PromTargets(up=prom_up, nodeExporter=node_state, dcgmExporter=dcgm_state, cadvisor=cad_state),
        gpu=gpu_info,
        selectedProviders=selected,
        suggestions=suggestions,
    )
    _caps_cache = (now, out)
    return out
