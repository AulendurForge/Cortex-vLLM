import time
from fastapi import Request
from ..models import Usage
from ..config import get_settings


async def record_usage(
    request: Request,
    response,
    start_ns: int,
    model_name: str,
    task: str,
    key_id: int | None = None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    total_tokens: int | None = None,
    req_id: str | None = None,
):
    # Lazy import to avoid circular import at module init time
    try:
        from ..main import SessionLocal  # type: ignore
    except Exception:
        SessionLocal = None  # type: ignore
    if SessionLocal is None:
        return
    try:
        elapsed_ms = int((time.time_ns() - start_ns) / 1_000_000)
    except Exception:
        elapsed_ms = 0
    try:
        async with SessionLocal() as session:
            rec = Usage(
                org_id=None,
                user_id=None,
                key_id=key_id,
                model_name=model_name,
                task=task,
                prompt_tokens=int(prompt_tokens or 0),
                completion_tokens=int(completion_tokens or 0),
                total_tokens=int(total_tokens or 0),
                latency_ms=elapsed_ms,
                status_code=int(getattr(response, "status_code", 0)),
                req_id=(req_id or request.headers.get("x-request-id", "")),
            )
            session.add(rec)
            await session.commit()
    except Exception:
        # best effort only
        pass

