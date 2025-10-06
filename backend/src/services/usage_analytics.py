"""Usage analytics and reporting services."""

from typing import Optional, List
from sqlalchemy import select, func
from ..schemas.admin import UsageItem, UsageAggItem, UsageSeriesItem, LatencySummary


async def get_usage_records(
    session,
    limit: int = 50,
    offset: int = 0,
    hours: Optional[int] = None,
    model: Optional[str] = None,
    task: Optional[str] = None,
    key_id: Optional[int] = None,
    user_id: Optional[int] = None,
    org_id: Optional[int] = None,
    status: Optional[str] = None,
) -> List[UsageItem]:
    """Query usage records with filtering and pagination.
    
    Returns:
        List of UsageItem records
    """
    from ..models import Usage
    
    q = select(Usage)
    
    # Time filter
    if hours is not None:
        from datetime import datetime, timedelta
        since = datetime.utcnow() - timedelta(hours=max(1, min(int(hours), 24 * 30)))
        q = q.where(Usage.created_at >= since)
    
    # Field filters
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
    
    # Status code filter
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


async def get_usage_aggregate(
    session,
    hours: int = 24,
    model: Optional[str] = None
) -> List[UsageAggItem]:
    """Get aggregated usage statistics by model.
    
    Returns:
        List of UsageAggItem with totals per model
    """
    from ..models import Usage
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


async def get_usage_series(
    session,
    hours: int = 24,
    bucket: str = "hour",
    model: Optional[str] = None
) -> List[UsageSeriesItem]:
    """Get time-series usage data bucketed by hour or minute.
    
    Returns:
        List of UsageSeriesItem with timestamp and counts
    """
    from ..models import Usage
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
    
    out: List[UsageSeriesItem] = []
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


async def get_usage_latency(
    session,
    hours: int = 24,
    model: Optional[str] = None
) -> LatencySummary:
    """Calculate latency percentiles from usage records.
    
    Returns:
        LatencySummary with p50, p95, and average latency
    """
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

