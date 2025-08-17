from fastapi import Header, HTTPException, Depends, Request
from .config import get_settings
from sqlalchemy import select
from .models import APIKey
from datetime import datetime
from .crypto import verify_key
from .metrics import KEY_AUTH_ALLOWED, KEY_AUTH_BLOCKED

def _parse_ip_allowlist(raw: str) -> list[str]:
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


async def require_api_key(request: Request, authorization: str = Header(None), settings = Depends(get_settings)):
    # Lazy import to avoid circular import at module init
    from .main import SessionLocal  # type: ignore
    # In dev-bypass mode, prefer real key resolution when a token is provided
    if settings.GATEWAY_DEV_ALLOW_ALL_KEYS and not authorization:
        KEY_AUTH_ALLOWED.labels(reason="dev_bypass").inc()
        return {"key_id": None, "scopes": set(["chat", "completions", "embeddings"]) }
    if not authorization or not authorization.lower().startswith("bearer "):
        if settings.GATEWAY_DEV_ALLOW_ALL_KEYS:
            # Allow missing/invalid tokens in dev but mark as bypass
            KEY_AUTH_ALLOWED.labels(reason="dev_bypass").inc()
            return {"key_id": None, "scopes": set(["chat", "completions", "embeddings"]) }
        KEY_AUTH_BLOCKED.labels(reason="missing_token").inc()
        raise HTTPException(status_code=401, detail="Missing bearer token")
    key = authorization.split(" ", 1)[1].strip()
    if len(key) < 12:
        KEY_AUTH_BLOCKED.labels(reason="format").inc()
        raise HTTPException(status_code=401, detail="Invalid API key format")

    prefix = key[:8]
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        result = await session.execute(select(APIKey).where(APIKey.prefix == prefix, APIKey.disabled == False))
        row = result.scalar_one_or_none()
        if not row or (row.expires_at and row.expires_at < datetime.utcnow()) or (not verify_key(key, row.hash)):
            if settings.GATEWAY_DEV_ALLOW_ALL_KEYS:
                # Fall back to bypass when provided key is invalid in dev
                KEY_AUTH_ALLOWED.labels(reason="dev_bypass").inc()
                return {"key_id": None, "scopes": set(["chat", "completions", "embeddings"]) }
            KEY_AUTH_BLOCKED.labels(reason="not_found" if not row else ("expired" if (row and row.expires_at and row.expires_at < datetime.utcnow()) else "hash_mismatch")).inc()
            raise HTTPException(status_code=401, detail="Invalid API key")
        # Enforce IP allowlist when present
        client_ip = request.client.host if request.client else None
        allowlist = _parse_ip_allowlist(row.ip_allowlist)
        if allowlist and client_ip not in allowlist:
            KEY_AUTH_BLOCKED.labels(reason="ip").inc()
            raise HTTPException(status_code=403, detail="IP not allowed")
        # Update last_used_at (non-blocking best-effort)
        try:
            row.last_used_at = datetime.utcnow()
            await session.commit()
        except Exception:
            await session.rollback()
    scopes = set([s.strip() for s in (row.scopes or "").split(",") if s.strip()]) if 'row' in locals() and row else set()
    KEY_AUTH_ALLOWED.labels(reason="ok").inc()
    return {"key_id": row.id if 'row' in locals() and row else None, "scopes": scopes}


async def require_admin(request: Request):
    """Require an authenticated administrator via dev cookie session.
    In production, replace with proper session/JWT middleware.
    """
    from .main import SessionLocal  # type: ignore
    from .models import User  # type: ignore
    username = request.cookies.get("cortex_session")
    if not username:
        raise HTTPException(status_code=401, detail="unauthenticated")
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        from sqlalchemy import select
        result = await session.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="unauthenticated")
        role = (user.role or "").lower()
        if role not in ("admin",):
            raise HTTPException(status_code=403, detail="forbidden")
    return {"username": username, "role": role}


async def require_user_session(request: Request):
    """Require any authenticated user session via dev cookie.
    Returns { username, role } if present, else 401.
    """
    from .main import SessionLocal  # type: ignore
    from .models import User  # type: ignore
    username = request.cookies.get("cortex_session")
    if not username:
        raise HTTPException(status_code=401, detail="unauthenticated")
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        result = await session.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="unauthenticated")
        return {"username": username, "role": (user.role or "").lower()}