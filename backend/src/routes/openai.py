import random
import httpx
from typing import AsyncIterator
import asyncio
import uuid
from prometheus_client import Counter
from ..metrics import UPSTREAM_LATENCY, UPSTREAM_LATENCY_BY_UPSTREAM, STREAM_TTFT_SECONDS, UPSTREAM_SELECTED, TIMEOUT_ERRORS, REQUEST_CANCELLATIONS
from starlette.background import BackgroundTask
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from ..auth import require_api_key
from ..config import get_settings
from ..middleware.usage import record_usage
from ..middleware.ratelimit import acquire_stream_slot, release_stream_slot
from ..schemas.openai import ChatCompletionRequest, CompletionRequest, EmbeddingsRequest
import time
from ..state import CB_STATE as _CB_STATE  # centralize shared breaker state
from ..state import HEALTH_STATE as _HEALTH_STATE
from ..state import LB_INDEX as _LB_INDEX
from ..state import MODEL_REGISTRY as _MODEL_REGISTRY
from ..token_estimator import estimate_chat_prompt_tokens, rough_token_count

router = APIRouter()
def _get_http_client() -> httpx.AsyncClient | None:
    try:
        from ..main import http_client as _hc  # type: ignore
        return _hc
    except Exception:
        return None

# Simple circuit breaker state per upstream base URL
_CB_STATE: dict[str, dict[str, float | int]] = {}

# Metrics
UPSTREAM_SUCCESS = Counter("gateway_upstream_success_total", "Successful upstream responses", ["path"]) 
UPSTREAM_ERROR = Counter("gateway_upstream_error_total", "Errored upstream responses", ["path"]) 
RETRY_COUNT = Counter("gateway_upstream_retries_total", "Retries attempted for upstream calls", ["path"]) 
BREAKER_OPENED = Counter("gateway_breaker_open_total", "Circuit breaker opened events", ["base_url"]) 
STREAM_BLOCKED = Counter("gateway_stream_blocked_total", "Concurrent stream requests blocked", ["identifier"]) 

# Build a naive prompt from chat messages for models without chat templates
def _messages_to_prompt(messages: list[dict]) -> str:
    try:
        parts: list[str] = []
        for m in messages or []:
            role = str(m.get("role", "")).lower()
            content = m.get("content", "")
            if isinstance(content, list):
                text = " ".join(seg.get("text", "") for seg in content if isinstance(seg, dict))
            else:
                text = str(content)
            label = "System" if role == "system" else ("User" if role == "user" else "Assistant")
            if text:
                parts.append(f"{label}: {text}")
        parts.append("Assistant:")
        return "\n\n".join(parts)
    except Exception:
        return ""

def _cb_is_available(url: str) -> bool:
    settings = get_settings()
    if not settings.CB_ENABLED:
        return True
    state = _CB_STATE.get(url)
    if not state:
        return True
    open_until = float(state.get("open_until", 0.0))
    return time.time() >= open_until

async def _health_check(url: str) -> None:
    settings = get_settings()
    client = _get_http_client()
    if client is None:
        return
    try:
        t0 = time.time()
        # Use explicit 4-field timeout for httpx 0.27 compatibility
        resp = await client.get(
            f"{url}{settings.HEALTH_CHECK_PATH}",
            timeout=httpx.Timeout(connect=2.0, read=3.0, write=3.0, pool=5.0),
        )
        if 200 <= resp.status_code < 500:
            _HEALTH_STATE[url] = {"ok": True, "ts": time.time()}
            _cb_record_success(url)
        else:
            _HEALTH_STATE[url] = {"ok": False, "ts": time.time()}
            _cb_record_failure(url)
        UPSTREAM_LATENCY.labels(path="/health").observe(time.time() - t0)
    except Exception:
        _HEALTH_STATE[url] = {"ok": False, "ts": time.time()}
        _cb_record_failure(url)

def _cb_record_success(url: str):
    settings = get_settings()
    if not settings.CB_ENABLED:
        return
    st = _CB_STATE.setdefault(url, {"fail": 0, "open_until": 0.0})
    st["fail"] = 0
    st["open_until"] = 0.0

def _cb_record_failure(url: str):
    settings = get_settings()
    if not settings.CB_ENABLED:
        return
    st = _CB_STATE.setdefault(url, {"fail": 0, "open_until": 0.0})
    st["fail"] = int(st.get("fail", 0)) + 1
    if st["fail"] >= settings.CB_FAILURE_THRESHOLD:
        st["open_until"] = time.time() + settings.CB_COOLDOWN_SEC
        BREAKER_OPENED.labels(base_url=url).inc()

def choose_url(urls):
    # Prefer healthy (recently OK) and breaker-closed URLs; use simple round-robin among pool
    now = time.time()
    ttl = get_settings().HEALTH_CHECK_TTL_SEC
    pool = [
        u for u in urls
        if _cb_is_available(u) and (
            _HEALTH_STATE.get(u, {}).get("ok", False)
            and (now - float(_HEALTH_STATE.get(u, {}).get("ts", 0.0)) <= ttl)
        )
    ] or urls
    if not pool:
        # No upstreams configured; raise a clear error instead of ZeroDivision
        raise HTTPException(status_code=503, detail="no_upstreams_available")
    key = ",".join(pool)
    idx = _LB_INDEX.get(key, 0) % len(pool)
    _LB_INDEX[key] = idx + 1
    chosen = pool[idx]
    # Best-effort: increment selection once per call site using path stored later
    return chosen

def get_timeout_for_request(model_name: str, max_tokens: int, is_streaming: bool) -> httpx.Timeout:
    """Calculate appropriate timeout based on model size and request complexity."""
    # Base timeouts by model size
    if "120b" in model_name.lower():
        base_timeout = 180 if is_streaming else 120
    elif "70b" in model_name.lower():
        base_timeout = 120 if is_streaming else 90
    elif "13b" in model_name.lower():
        base_timeout = 90 if is_streaming else 60
    else:
        base_timeout = 60 if is_streaming else 45
    
    # Scale by max_tokens (cap at 3x multiplier)
    token_factor = min(max_tokens / 1000, 3.0)
    read_timeout = base_timeout * token_factor
    
    return httpx.Timeout(connect=5.0, read=read_timeout, write=10.0, pool=5.0)


def choose_by_model_or_task(model: str | None, task_hint: str | None, settings) -> tuple[str, str]:
    """Return (base_url, path_prefix) based on model registry or task hint.
    Defaults to generation pool when unknown.
    """
    try:
        if model and model in _MODEL_REGISTRY:
            entry = _MODEL_REGISTRY.get(model) or {}
            url = str(entry.get("url") or "")
            task = str(entry.get("task") or "generate")
            if url:
                return url, task
    except Exception:
        pass
    # Fallback by hint
    t = (task_hint or "").lower()
    if t.startswith("embed"):
        return choose_url(settings.emb_urls()), "embed"
    return choose_url(settings.gen_urls()), "generate"

def _require_scope(scopes: set[str], path: str):
    if path.endswith("/embeddings"):
        needed = "embeddings"
    elif path.endswith("/completions"):
        needed = "completions"
    else:
        needed = "chat"
    if needed not in scopes and "*" not in scopes:
        raise HTTPException(status_code=403, detail="insufficient_scope")


async def forward_json(request: Request, base_url: str, path: str, internal_key: str, auth_ctx: dict | None):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    headers = {"Content-Type": "application/json"}
    if internal_key:
        headers["Authorization"] = f"Bearer {internal_key}"
    # Propagate/generate request id
    req_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    headers["x-request-id"] = req_id

    # Enforce scopes (consider task from registry if available)
    if auth_ctx is not None:
        _require_scope(auth_ctx.get("scopes", set()), path)

    # Handle streaming passthrough for chat/completions
    is_stream = bool(payload.get("stream")) and path in ("/v1/chat/completions", "/v1/completions")
    if is_stream:
        start_ns = time.time_ns()
        client = _get_http_client()
        if client is None:
            raise HTTPException(status_code=503, detail="HTTP client not ready")
        # Acquire concurrency slot (per-identifier)
        identifier = request.headers.get("authorization", "")[7:15] or (request.client.host if request.client else "unknown")
        ok = await acquire_stream_slot(identifier)
        if not ok:
            STREAM_BLOCKED.labels(identifier=identifier).inc()
            raise HTTPException(status_code=429, detail="too_many_concurrent_streams")
        # Dynamic timeout based on model size and request complexity
        timeout = get_timeout_for_request(payload.get("model", ""), payload.get("max_tokens", 1000), True)
        # Manually manage stream context so it stays open until response completes
        resp_ctx = client.stream("POST", f"{base_url}{path}", headers=headers, json=payload, timeout=timeout)
        resp = await resp_ctx.__aenter__()
        if resp.status_code >= 400:
            data = await resp.aread()
            await resp_ctx.__aexit__(None, None, None)
            try:
                r = JSONResponse(status_code=resp.status_code, content=httpx.Response(200, content=data).json())
            except Exception:
                r = JSONResponse(status_code=resp.status_code, content={"error": data.decode(errors="ignore")})
            await record_usage(request, r, start_ns, payload.get("model", ""), "generate", key_id=auth_ctx.get("key_id") if auth_ctx else None)
            if resp.status_code >= 500:
                _cb_record_failure(base_url)
                UPSTREAM_ERROR.labels(path=path).inc()
            return r

        first = True
        async def agen() -> AsyncIterator[bytes]:
            nonlocal first
            start = time.time()
            async for chunk in resp.aiter_raw():
                if chunk:
                    if first:
                        first = False
                        STREAM_TTFT_SECONDS.labels(path=path).observe(time.time() - start)
                    yield chunk

        async def close_and_release():
            try:
                await resp_ctx.__aexit__(None, None, None)
            finally:
                await release_stream_slot(identifier)

        ctype = resp.headers.get("content-type", "text/event-stream")
        background = BackgroundTask(close_and_release)
        sr = StreamingResponse(agen(), media_type=ctype, background=background)
        await record_usage(request, sr, start_ns, payload.get("model", ""), "generate", key_id=auth_ctx.get("key_id") if auth_ctx else None)
        if 200 <= resp.status_code < 500:
            _cb_record_success(base_url)
            UPSTREAM_SUCCESS.labels(path=path).inc()
        return sr

    # Non-stream path
    client = _get_http_client()
    if client is None:
        raise HTTPException(status_code=503, detail="HTTP client not ready")
    start_ns = time.time_ns()
    # Retries with backoff for transient errors (simple inline loop; avoid for streams)
    retries = 2
    last_exc = None
    for attempt in range(retries + 1):
        try:
            # Dynamic timeout based on model size and request complexity
            timeout = get_timeout_for_request(payload.get("model", ""), payload.get("max_tokens", 1000), False)
            t0 = time.time()
            resp = await client.post(f"{base_url}{path}", headers=headers, json=payload, timeout=timeout)
            elapsed = time.time() - t0
            UPSTREAM_LATENCY.labels(path=path).observe(elapsed)
            UPSTREAM_LATENCY_BY_UPSTREAM.labels(path=path, base_url=base_url).observe(elapsed)
            break
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout) as exc:
            last_exc = exc
            if attempt == retries:
                _cb_record_failure(base_url)
                # Provide informative error messages for timeouts
                if isinstance(exc, httpx.ReadTimeout):
                    model_name = payload.get("model", "unknown")
                    TIMEOUT_ERRORS.labels(model=model_name, error_type="read_timeout", path=path).inc()
                    raise HTTPException(
                        status_code=408, 
                        content={
                            "error": {
                                "message": "Request timeout - model is processing but taking longer than expected. Please try again with a shorter prompt or fewer tokens.",
                                "type": "timeout_error",
                                "retry_after": 30
                            }
                        }
                    )
                else:
                    raise HTTPException(status_code=502, detail="upstream_unreachable")
            await asyncio.sleep(0.2 * (attempt + 1))
            RETRY_COUNT.labels(path=path).inc()
    else:
        _cb_record_failure(base_url)
        raise HTTPException(status_code=502, detail="upstream_unreachable")
    # Fallback: if chat/completions fails due to missing chat template, retry via completions
    if resp.status_code >= 400 and path == "/v1/chat/completions":
        try:
            err = resp.json()
        except Exception:
            err = {}
        # vLLM returns message string describing chat template requirement (HF 4.44 change)
        msg = str(err.get("message") or err.get("error") or "").lower()
        if "chat template" in msg:
            try:
                # Convert messages→prompt and call /v1/completions upstream
                messages = payload.get("messages") if isinstance(payload, dict) else []
                prompt = _messages_to_prompt(messages or [])
                comp_payload = {
                    "model": payload.get("model"),
                    "prompt": prompt,
                    "max_tokens": payload.get("max_tokens") or 128,
                    "temperature": payload.get("temperature", 0.7),
                    "stream": False,
                }
                timeout = get_timeout_for_request(payload.get("model", ""), comp_payload.get("max_tokens", 128), False)
                t1 = time.time()
                comp_resp = await client.post(f"{base_url}/v1/completions", headers=headers, json=comp_payload, timeout=timeout)
                UPSTREAM_LATENCY.labels(path="/v1/completions").observe(time.time() - t1)
                if comp_resp.status_code < 400:
                    data_c = comp_resp.json()
                    # Normalize to chat schema for clients expecting chat.completions
                    try:
                        new_choices = []
                        for ch in (data_c.get("choices") or []):
                            txt = ch.get("text", "") if isinstance(ch, dict) else str(ch)
                            new_choices.append({
                                "index": ch.get("index", 0) if isinstance(ch, dict) else 0,
                                "message": {"role": "assistant", "content": txt},
                                "finish_reason": ch.get("finish_reason") if isinstance(ch, dict) else None,
                            })
                        normalized = {
                            "id": data_c.get("id"),
                            "object": "chat.completion",
                            "created": data_c.get("created"),
                            "model": data_c.get("model", payload.get("model")),
                            "choices": new_choices,
                            "usage": data_c.get("usage"),
                        }
                    except Exception:
                        normalized = {"object": "chat.completion", "choices": [{"message": {"role": "assistant", "content": data_c}}]}
                    r = JSONResponse(status_code=200, content=normalized)
                    await record_usage(request, r, start_ns, payload.get("model", ""), "generate", key_id=auth_ctx.get("key_id") if auth_ctx else None)
                    _cb_record_success(base_url)
                    UPSTREAM_SUCCESS.labels(path=path).inc()
                    return r
            except Exception:
                pass
    if resp.status_code >= 400:
        # Standardized error envelope
        try:
            content = resp.json()
        except Exception:
            content = {"error": resp.text}
        r = JSONResponse(status_code=resp.status_code, content=content)
        await record_usage(request, r, start_ns, payload.get("model", ""), "embed" if path.endswith("embeddings") else "generate", key_id=auth_ctx.get("key_id") if auth_ctx else None)
        if resp.status_code >= 500:
            _cb_record_failure(base_url)
        else:
            _cb_record_success(base_url)
        UPSTREAM_ERROR.labels(path=path).inc()
        return r
    data = resp.json()
    # Token usage capture if present
    usage = data.get("usage") if isinstance(data, dict) else None
    pt = usage.get("prompt_tokens") if isinstance(usage, dict) else None
    ct = usage.get("completion_tokens") if isinstance(usage, dict) else None
    tt = usage.get("total_tokens") if isinstance(usage, dict) else None
    # Fallback token estimation if engines do not report usage
    if (pt is None or ct is None or tt is None) and get_settings().TOKEN_ESTIMATION_ENABLED:
        try:
            if path.endswith("/embeddings"):
                # Roughly estimate tokens from input length
                inp = (data.get("input") if isinstance(data, dict) else None) or payload.get("input")
                if isinstance(inp, str):
                    est = rough_token_count(inp)
                    pt = pt if pt is not None else est
                    tt = tt if tt is not None else est
                elif isinstance(inp, list):
                    est = sum(rough_token_count(x) for x in inp if isinstance(x, str))
                    pt = pt if pt is not None else est
                    tt = tt if tt is not None else est
            elif path.endswith("/chat/completions"):
                msgs = payload.get("messages") or []
                est = estimate_chat_prompt_tokens(msgs)
                pt = pt if pt is not None else est
                # completion may be empty; best-effort
                tt = tt if tt is not None else (pt + (ct or 0))
            else:
                # /completions
                prompt = payload.get("prompt")
                if isinstance(prompt, str):
                    est = rough_token_count(prompt)
                elif isinstance(prompt, list):
                    est = sum(rough_token_count(p) for p in prompt if isinstance(p, str))
                else:
                    est = 0
                pt = pt if pt is not None else est
                tt = tt if tt is not None else (pt + (ct or 0))
        except Exception:
            pass
    r = JSONResponse(status_code=200, content=data)
    await record_usage(
        request,
        r,
        start_ns,
        payload.get("model", ""),
        "embed" if path.endswith("embeddings") else "generate",
        key_id=auth_ctx.get("key_id") if auth_ctx else None,
        prompt_tokens=pt,
        completion_tokens=ct,
        total_tokens=tt,
        req_id=req_id,
    )
    _cb_record_success(base_url)
    UPSTREAM_SUCCESS.labels(path=path).inc()
    return r

@router.post("/chat/completions")
async def chat_completions(request: Request, body: ChatCompletionRequest, auth_ctx = Depends(require_api_key), settings = Depends(get_settings)):
    model = (body.model or "") if hasattr(body, "model") else ""
    base, _ = choose_by_model_or_task(model, "generate", settings)
    try:
        UPSTREAM_SELECTED.labels(path="/v1/chat/completions", base_url=base).inc()
    except Exception:
        pass
    return await forward_json(request, base, "/v1/chat/completions", settings.INTERNAL_VLLM_API_KEY, auth_ctx)

@router.post("/completions")
async def completions(request: Request, body: CompletionRequest, auth_ctx = Depends(require_api_key), settings = Depends(get_settings)):
    model = (body.model or "") if hasattr(body, "model") else ""
    base, _ = choose_by_model_or_task(model, "generate", settings)
    try:
        UPSTREAM_SELECTED.labels(path="/v1/completions", base_url=base).inc()
    except Exception:
        pass
    return await forward_json(request, base, "/v1/completions", settings.INTERNAL_VLLM_API_KEY, auth_ctx)

@router.post("/embeddings")
async def embeddings(request: Request, body: EmbeddingsRequest, auth_ctx = Depends(require_api_key), settings = Depends(get_settings)):
    model = (body.model or "") if hasattr(body, "model") else ""
    base, _ = choose_by_model_or_task(model, "embed", settings)
    try:
        UPSTREAM_SELECTED.labels(path="/v1/embeddings", base_url=base).inc()
    except Exception:
        pass
    return await forward_json(request, base, "/v1/embeddings", settings.INTERNAL_VLLM_API_KEY, auth_ctx)


@router.get("/models")
async def list_models(settings = Depends(get_settings)):
    """Return available served models (from registry and any autodiscovered health poller models)."""
    try:
        data = []
        # Registry entries
        for name, meta in (_MODEL_REGISTRY or {}).items():
            data.append({"id": name, "url": meta.get("url"), "task": meta.get("task")})
        return {"data": data}
    except Exception:
        return {"data": []}


@router.get("/models/status")
async def models_status(settings = Depends(get_settings)):
    """Public, read-only status for served models: running/down by health TTL.
    Does not expose secrets.
    """
    try:
        now = time.time()
        ttl = settings.HEALTH_CHECK_TTL_SEC
        out = []
        for name, meta in (_MODEL_REGISTRY or {}).items():
            url = str((meta or {}).get("url") or "")
            task = str((meta or {}).get("task") or "generate")
            h = _HEALTH_STATE.get(url) or {}
            ok = bool(h.get("ok")) and (now - float(h.get("ts", 0.0)) <= ttl)
            state = "running" if ok else "down"
            out.append({
                "name": name,
                "served_model_name": name,
                "task": task,
                "state": state,
                "url": url,
            })
        return {"data": out}
    except Exception:
        return {"data": []}