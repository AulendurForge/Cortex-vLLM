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
from ..schemas.admin import (
    SystemSummary, ThroughputSummary, GpuMetrics, BootstrapRequest, RegistryEntry,
    UsageItem, UsageAggItem, UsageSeriesItem, LatencySummary, TtftSummary,
    HealthRefreshRequest, HostSummary, TimePoint, HostTrends, PromTargets, Capabilities
)
from ..utils.prometheus_utils import prom_query, prom_range, prom_range_matrix, prom_instant_matrix
from ..services.usage_analytics import get_usage_records, get_usage_aggregate, get_usage_series, get_usage_latency
from ..services.system_monitoring import get_host_summary, get_host_trends, get_system_capabilities
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
    status: Optional[str] = None,
):
    """List usage records with filtering and pagination."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        return await get_usage_records(session, limit, offset, hours, model, task, key_id, user_id, org_id, status)


@router.get("/usage/aggregate", response_model=list[UsageAggItem])
async def usage_aggregate(hours: int = 24, model: Optional[str] = None):
    """Get aggregated usage statistics by model."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        return await get_usage_aggregate(session, hours, model)


@router.get("/usage/series", response_model=list[UsageSeriesItem])
async def usage_series(hours: int = 24, bucket: str = "hour", model: Optional[str] = None):
    """Get time-series usage data."""
    if bucket not in ("hour", "minute"):
        raise HTTPException(status_code=400, detail="invalid_bucket")
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        return await get_usage_series(session, hours, bucket, model)


@router.get("/usage/latency", response_model=LatencySummary)
async def usage_latency(hours: int = 24, model: Optional[str] = None):
    """Calculate latency percentiles."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        return await get_usage_latency(session, hours, model)


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

@router.get("/system/host/summary", response_model=HostSummary)
async def system_host_summary(settings = Depends(get_settings), _: dict = Depends(require_admin)):
    """Node exporter KPIs: CPU util, mem usage, disk usage, net throughput."""
    return await get_host_summary(settings)


@router.get("/system/host/trends", response_model=HostTrends)
async def system_host_trends(minutes: int = 15, step_s: int = 15, settings = Depends(get_settings), _: dict = Depends(require_admin)):
    """Return 5–15 min trend series for CPU, mem, disk, and network from node-exporter."""
    return await get_host_trends(settings, minutes, step_s)


# ---------------------------
# Capabilities detection
# ---------------------------

@router.get("/system/capabilities", response_model=Capabilities)
async def system_capabilities(settings = Depends(get_settings), _: dict = Depends(require_admin)):
    """Detect system capabilities and monitoring provider status."""
    return await get_system_capabilities(settings)
