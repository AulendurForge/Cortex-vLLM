import time
import math
from fastapi import Request
from fastapi.responses import JSONResponse
from ..config import get_settings
from prometheus_client import Counter


def _get_redis():
    try:
        from ..main import redis as _r  # type: ignore
        return _r
    except Exception:
        return None

async def check_rate_limit(request: Request):
    settings = get_settings()
    if not settings.RATE_LIMIT_ENABLED:
        return None
    redis = _get_redis()
    if redis is None:
        return None

    # Identify caller by API key prefix or client IP
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer ") and len(auth.split(" ", 1)[1]) >= 8:
        identifier = auth.split(" ", 1)[1][:8]
    else:
        identifier = request.client.host if request.client else "unknown"

    now_sec = int(time.time())
    key = f"rl:{identifier}:{now_sec}"
    try:
        # Optional sliding-window limiter
        if settings.RATE_LIMIT_WINDOW_SEC and settings.RATE_LIMIT_MAX_REQUESTS:
            now_ms = int(time.time() * 1000)
            window_ms = settings.RATE_LIMIT_WINDOW_SEC * 1000
            zkey = f"rl:sw:{identifier}"
            # remove old entries
            await redis.zremrangebyscore(zkey, 0, now_ms - window_ms)
            # count within window
            count = await redis.zcard(zkey)
            if count is not None and int(count) >= int(settings.RATE_LIMIT_MAX_REQUESTS):
                RL_BLOCKED.labels(type="window").inc()
                return JSONResponse(status_code=429, content={"error": "rate limit exceeded (window)"})
            # add current request, member unique by ns
            member = str(time.time_ns())
            await redis.zadd(zkey, {member: now_ms})
            # ensure key expires slightly after window
            await redis.expire(zkey, settings.RATE_LIMIT_WINDOW_SEC * 2)

        current = await redis.incr(key)
        if current == 1:
            # first hit this second, set short TTL
            await redis.expire(key, 2)
        allowed = settings.RATE_LIMIT_RPS + settings.RATE_LIMIT_BURST
        if current > allowed:
            RL_BLOCKED.labels(type="bucket").inc()
            return JSONResponse(status_code=429, content={"error": "rate limit exceeded"})
        RL_ALLOWED.inc()
    except Exception:
        # fail-open on Redis issues
        return None

    return None


async def acquire_stream_slot(identifier: str, ttl_sec: int = 300) -> bool:
    settings = get_settings()
    redis = _get_redis()
    if not settings.CONCURRENCY_LIMIT_ENABLED or redis is None:
        return True
    key = f"rl:conc:{identifier}"
    try:
        # increment and set TTL on first acquisition
        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, ttl_sec)
        if current > settings.MAX_CONCURRENT_STREAMS_PER_ID:
            # revert increment if over limit
            await redis.decr(key)
            return False
        return True
    except Exception:
        return True


async def release_stream_slot(identifier: str):
    settings = get_settings()
    redis = _get_redis()
    if not settings.CONCURRENCY_LIMIT_ENABLED or redis is None:
        return
    try:
        await redis.decr(f"rl:conc:{identifier}")
    except Exception:
        return

# Prometheus counters
RL_BLOCKED = Counter("gateway_ratelimit_blocked_total", "Requests blocked by rate limiter", ["type"]) 
RL_ALLOWED = Counter("gateway_ratelimit_allowed_total", "Requests allowed by rate limiter") 
