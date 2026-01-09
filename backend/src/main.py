import json
from typing import List, Optional
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse, Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from .metrics import REQ_COUNT, LATENCY, UPSTREAM_LATENCY, UPSTREAM_LATENCY_BY_UPSTREAM, STREAM_TTFT_SECONDS, UPSTREAM_SELECTED
from .config import Settings, get_settings
from .routes.openai import router as openai_router
from .routes.keys import router as keys_router
from .routes.admin import router as admin_router
from .routes.authn import router as authn_router
from .routes.orgs import router as orgs_router
from .routes.users import router as users_router
from .routes.models import router as models_router
from .routes.recipes import router as recipes_router
from .routes.deployment import router as deployment_router
from .middleware.ratelimit import check_rate_limit
import httpx
import asyncio
import redis.asyncio as redis_async
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from .models import Base
from .health import poll_upstreams_periodically
from .otel import init_otel_if_enabled
from fastapi.middleware.cors import CORSMiddleware
import os
import uuid
from .state import set_model_registry as _set_model_registry

app = FastAPI(title="Cortex Gateway", version="0.1.0")

# Configure CORS at app creation time (cannot add middleware during startup)
try:
    _settings_for_cors = get_settings()
    if _settings_for_cors.CORS_ENABLED:
        allow = [o.strip() for o in _settings_for_cors.CORS_ALLOW_ORIGINS.split(",")] if _settings_for_cors.CORS_ALLOW_ORIGINS != "*" else ["*"]
        app.add_middleware(
            CORSMiddleware,
            allow_origins=allow,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
except Exception:
    # Fail-open: if settings access fails at import-time, CORS just won't be enabled
    pass


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    # Ensure every request has an x-request-id; propagate to response
    req_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.req_id = req_id
    response = await call_next(request)
    try:
        response.headers.setdefault("x-request-id", req_id)
    except Exception:
        pass
    return response

@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    route = request.url.path
    with LATENCY.labels(route=route).time():
        # rate-limit check (fail-open on error)
        rl = await check_rate_limit(request)
        if rl is not None:
            response = rl
        else:
            response = await call_next(request)
    # Security headers
    try:
        if get_settings().SECURITY_HEADERS_ENABLED:
            if isinstance(response, Response):
                response.headers.setdefault("X-Content-Type-Options", "nosniff")
                response.headers.setdefault("X-Frame-Options", "DENY")
                response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
                response.headers.setdefault("X-XSS-Protection", "0")
                response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
                response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    except Exception:
        pass
    REQ_COUNT.labels(route=route, status=str(response.status_code)).inc()
    return response

# Standardized error handlers to harmonize error JSON structure
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    rid = getattr(request.state, "req_id", request.headers.get("x-request-id", ""))
    content = {"error": {"code": exc.status_code, "message": exc.detail}, "request_id": rid}
    return JSONResponse(status_code=exc.status_code, content=content)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    rid = getattr(request.state, "req_id", request.headers.get("x-request-id", ""))
    content = {"error": {"code": 500, "message": "internal_server_error"}, "request_id": rid}
    return JSONResponse(status_code=500, content=content)

@app.middleware("http")
async def size_limit_middleware(request: Request, call_next):
    # Enforce max body size when Content-Length is present
    try:
        settings = get_settings()
        cl = request.headers.get("content-length")
        if cl and int(cl) > settings.REQUEST_MAX_BODY_BYTES:
            return JSONResponse(status_code=413, content={"error": "Request entity too large"})
    except Exception:
        pass
    return await call_next(request)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/metrics")
async def metrics():
    data = generate_latest()
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)

# OpenAI-compatible endpoints under /v1/*
app.include_router(openai_router, prefix="/v1")
app.include_router(keys_router, prefix="/admin")
app.include_router(admin_router, prefix="/admin")
app.include_router(authn_router, prefix="/auth")
app.include_router(orgs_router, prefix="/admin")
app.include_router(users_router, prefix="/admin")
app.include_router(models_router, prefix="/admin")
app.include_router(recipes_router, prefix="/admin")
app.include_router(deployment_router, prefix="/admin")


# Shared resources: httpx client, redis
http_client: httpx.AsyncClient | None = None
redis: redis_async.Redis | None = None
engine = None
SessionLocal: async_sessionmaker[AsyncSession] | None = None
_bg_health_task: asyncio.Task | None = None

 


@app.on_event("startup")
async def on_startup():
    global http_client, redis, _bg_health_task
    # Single shared client with connection pooling for high concurrency
    # Limits set to handle 100+ concurrent requests to llama.cpp
    http_client = httpx.AsyncClient(
        timeout=60.0,
        limits=httpx.Limits(max_connections=200, max_keepalive_connections=100)
    )
    # Redis connection (optional)
    settings = get_settings()
    try:
        redis = redis_async.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
    except Exception:
        redis = None
    # Database engine/session factory
    global engine, SessionLocal
    engine = create_async_engine(settings.DATABASE_URL, future=True, pool_pre_ping=True)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    # Ensure schema exists in dev: create tables if they are missing
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception:
        # In production, prefer Alembic migrations; this is best-effort.
        pass
    # Background health poller (optional)
    try:
        if settings.HEALTH_POLL_SEC > 0:
            _bg_health_task = asyncio.create_task(poll_upstreams_periodically(http_client))
    except Exception:
        _bg_health_task = None
    # OpenTelemetry (optional)
    init_otel_if_enabled()

    # Load persisted model registry from ConfigKV if present (best-effort)
    try:
        from sqlalchemy import select as _select  # type: ignore
        from .models import ConfigKV  # type: ignore
        if SessionLocal is not None:
            async with SessionLocal() as session:  # type: ignore
                res = await session.execute(_select(ConfigKV).where(ConfigKV.key == "model_registry"))
                row = res.scalar_one_or_none()
                if row and getattr(row, "value", None):
                    try:
                        data = json.loads(row.value)
                        if isinstance(data, dict):
                            _set_model_registry(data)
                    except Exception:
                        pass
    except Exception:
        pass

    # Ensure host-mapped directories exist (best-effort): models base and HF cache
    try:
        s = get_settings()
        if s.CORTEX_MODELS_DIR:
            os.makedirs(s.CORTEX_MODELS_DIR, exist_ok=True)
        if s.HF_CACHE_DIR:
            os.makedirs(s.HF_CACHE_DIR, exist_ok=True)
    except Exception:
        pass

    # Auto-bootstrap admin user if environment variables are set (best-effort)
    try:
        if settings.ADMIN_BOOTSTRAP_USERNAME and settings.ADMIN_BOOTSTRAP_PASSWORD:
            if SessionLocal is not None:
                from sqlalchemy import select as _sel, func as _func
                from .models import User, Organization
                from .crypto import pwd_context
                
                async with SessionLocal() as session:
                    # Check if any admin exists
                    try:
                        admin_count = (await session.execute(
                            _sel(_func.count()).select_from(User).where(User.role == "Admin")
                        )).scalar_one()
                        
                        if int(admin_count or 0) == 0:
                            print("[startup] No admin found, bootstrapping from environment variables...", flush=True)
                            
                            # Create org if specified
                            org_id = None
                            if settings.ADMIN_BOOTSTRAP_ORG:
                                org = Organization(name=settings.ADMIN_BOOTSTRAP_ORG)
                                session.add(org)
                                await session.flush()
                                org_id = org.id
                            
                            # Create admin user
                            hashed = pwd_context.hash(settings.ADMIN_BOOTSTRAP_PASSWORD)
                            admin = User(
                                username=settings.ADMIN_BOOTSTRAP_USERNAME,
                                role="Admin",
                                org_id=org_id,
                                password_hash=hashed
                            )
                            session.add(admin)
                            await session.commit()
                            print(f"[startup] ✓ Admin user '{settings.ADMIN_BOOTSTRAP_USERNAME}' created successfully", flush=True)
                        else:
                            print(f"[startup] Admin user already exists (count: {admin_count}), skipping bootstrap", flush=True)
                    except Exception as e:
                        print(f"[startup] Bootstrap check/creation failed: {e}", flush=True)
    except Exception as e:
        print(f"[startup] Auto-bootstrap error: {e}", flush=True)
        # Don't fail startup if bootstrap fails


@app.on_event("shutdown")
async def on_shutdown():
    global http_client, redis, engine, _bg_health_task
    
    # Stop all managed model containers before shutdown
    print("[shutdown] Stopping all managed model containers...", flush=True)
    try:
        if SessionLocal is not None:
            from sqlalchemy import select as _sel
            from .models import Model
            from .docker_manager import stop_container_for_model
            
            async with SessionLocal() as session:
                # Get all running or loading models
                from sqlalchemy import or_
                result = await session.execute(_sel(Model).where(or_(Model.state == "running", Model.state == "loading")))
                running_models = result.scalars().all()
                
                for m in running_models:
                    try:
                        print(f"[shutdown] Stopping container for model {m.id} ({m.name})...", flush=True)
                        stop_container_for_model(m)
                    except Exception as e:
                        print(f"[shutdown] Failed to stop model {m.id}: {e}", flush=True)
                
                # Update all running/loading to stopped state
                from sqlalchemy import update as _upd
                await session.execute(_upd(Model).where(or_(Model.state == "running", Model.state == "loading")).values(state="stopped", container_name=None, port=None))
                await session.commit()
                print(f"[shutdown] Stopped {len(running_models)} model container(s)", flush=True)
    except Exception as e:
        print(f"[shutdown] Error stopping model containers: {e}", flush=True)
    
    if _bg_health_task:
        _bg_health_task.cancel()
        try:
            await _bg_health_task
        except Exception:
            pass
        _bg_health_task = None
    if http_client:
        await http_client.aclose()
        http_client = None
    if redis:
        try:
            await redis.close()
        except Exception:
            pass
        redis = None
    if engine:
        await engine.dispose()
        engine = None