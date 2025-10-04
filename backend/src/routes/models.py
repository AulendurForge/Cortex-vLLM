from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from ..auth import require_admin
from ..config import get_settings
from ..models import Model, ConfigKV
from sqlalchemy import select, update, delete
from ..docker_manager import start_container_for_model, stop_container_for_model, tail_logs_for_model
import httpx
import os
from ..state import register_model_endpoint, unregister_model_endpoint
from ..state import get_model_registry as _get_registry

def _get_session():
    try:
        from ..main import SessionLocal  # type: ignore
        return SessionLocal
    except Exception:
        return None

router = APIRouter()

class ModelItem(BaseModel):
    id: int
    name: str
    served_model_name: str
    task: str
    repo_id: Optional[str] = None
    local_path: Optional[str] = None
    dtype: Optional[str] = None
    tp_size: Optional[int] = None
    gpu_memory_utilization: Optional[float] = None
    max_model_len: Optional[int] = None
    kv_cache_dtype: Optional[str] = None
    max_num_batched_tokens: Optional[int] = None
    quantization: Optional[str] = None
    block_size: Optional[int] = None
    swap_space_gb: Optional[int] = None
    enforce_eager: Optional[bool] = None
    trust_remote_code: Optional[bool] = None
    cpu_offload_gb: Optional[int] = None
    enable_prefix_caching: Optional[bool] = None
    prefix_caching_hash_algo: Optional[str] = None
    enable_chunked_prefill: Optional[bool] = None
    max_num_seqs: Optional[int] = None
    cuda_graph_sizes: Optional[str] = None  # comma-separated ints in storage
    pipeline_parallel_size: Optional[int] = None
    device: Optional[str] = None
    tokenizer: Optional[str] = None
    hf_config_path: Optional[str] = None
    # Engine type and llama.cpp specific fields
    engine_type: str = "vllm"
    ngl: Optional[int] = None
    tensor_split: Optional[str] = None
    batch_size: Optional[int] = None
    threads: Optional[int] = None
    context_size: Optional[int] = None
    rope_freq_base: Optional[float] = None
    rope_freq_scale: Optional[float] = None
    flash_attention: Optional[bool] = None
    mlock: Optional[bool] = None
    no_mmap: Optional[bool] = None
    numa_policy: Optional[str] = None
    split_mode: Optional[str] = None
    # Never expose tokens in GET responses
    state: str
    archived: bool
    port: Optional[int] = None
    container_name: Optional[str] = None

class CreateModelRequest(BaseModel):
    mode: str
    repo_id: Optional[str] = None
    local_path: Optional[str] = None
    name: str
    served_model_name: str
    task: str = "generate"
    dtype: Optional[str] = None
    tp_size: Optional[int] = 1
    gpu_memory_utilization: Optional[float] = 0.9
    max_model_len: Optional[int] = None
    trust_remote_code: Optional[bool] = None
    hf_offline: Optional[bool] = None
    kv_cache_dtype: Optional[str] = None
    max_num_batched_tokens: Optional[int] = None
    quantization: Optional[str] = None
    block_size: Optional[int] = None
    swap_space_gb: Optional[int] = None
    enforce_eager: Optional[bool] = None
    trust_remote_code: Optional[bool] = None
    cpu_offload_gb: Optional[int] = None
    enable_prefix_caching: Optional[bool] = None
    prefix_caching_hash_algo: Optional[str] = None
    enable_chunked_prefill: Optional[bool] = None
    max_num_seqs: Optional[int] = None
    cuda_graph_sizes: Optional[str] = None
    pipeline_parallel_size: Optional[int] = None
    device: Optional[str] = None
    # GGUF-specific/optional
    tokenizer: Optional[str] = None
    hf_config_path: Optional[str] = None
    # Optional HF token for gated/private repos; stored server-side, not returned
    hf_token: Optional[str] = None
    # Engine type selection
    engine_type: str = "vllm"
    # llama.cpp specific configuration fields
    ngl: Optional[int] = None
    tensor_split: Optional[str] = None
    batch_size: Optional[int] = None
    threads: Optional[int] = None
    context_size: Optional[int] = None
    rope_freq_base: Optional[float] = None
    rope_freq_scale: Optional[float] = None
    flash_attention: Optional[bool] = None
    mlock: Optional[bool] = None
    no_mmap: Optional[bool] = None
    numa_policy: Optional[str] = None
    split_mode: Optional[str] = None

class BaseDirCfg(BaseModel):
    base_dir: str

@router.get("/models", response_model=List[ModelItem])
async def list_models(_: dict = Depends(require_admin)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        return []
    async with SessionLocal() as session:
        # Order by ID to maintain consistent position regardless of state changes
        res = await session.execute(select(Model).order_by(Model.id.asc()))
        rows = res.scalars().all()
        return [
            ModelItem(
                id=r.id,
                name=r.name,
                served_model_name=r.served_model_name,
                task=r.task,
                repo_id=getattr(r, 'repo_id', None),
                local_path=getattr(r, 'local_path', None),
                dtype=r.dtype,
                tp_size=r.tp_size,
                gpu_memory_utilization=r.gpu_memory_utilization,
                max_model_len=r.max_model_len,
                kv_cache_dtype=r.kv_cache_dtype,
                max_num_batched_tokens=r.max_num_batched_tokens,
                quantization=r.quantization,
                block_size=r.block_size,
                swap_space_gb=r.swap_space_gb,
                enforce_eager=r.enforce_eager,
                trust_remote_code=getattr(r, 'trust_remote_code', None),
                cpu_offload_gb=getattr(r, 'cpu_offload_gb', None),
                enable_prefix_caching=getattr(r, 'enable_prefix_caching', None),
                prefix_caching_hash_algo=getattr(r, 'prefix_caching_hash_algo', None),
                enable_chunked_prefill=getattr(r, 'enable_chunked_prefill', None),
                max_num_seqs=getattr(r, 'max_num_seqs', None),
                cuda_graph_sizes=getattr(r, 'cuda_graph_sizes', None),
                pipeline_parallel_size=getattr(r, 'pipeline_parallel_size', None),
                device=getattr(r, 'device', None),
                tokenizer=getattr(r, 'tokenizer', None),
                hf_config_path=getattr(r, 'hf_config_path', None),
                engine_type=getattr(r, 'engine_type', 'vllm'),
                ngl=getattr(r, 'ngl', None),
                tensor_split=getattr(r, 'tensor_split', None),
                batch_size=getattr(r, 'batch_size', None),
                threads=getattr(r, 'threads', None),
                context_size=getattr(r, 'context_size', None),
                rope_freq_base=getattr(r, 'rope_freq_base', None),
                rope_freq_scale=getattr(r, 'rope_freq_scale', None),
                flash_attention=getattr(r, 'flash_attention', None),
                mlock=getattr(r, 'mlock', None),
                no_mmap=getattr(r, 'no_mmap', None),
                numa_policy=getattr(r, 'numa_policy', None),
                split_mode=getattr(r, 'split_mode', None),
                state=r.state,
                archived=bool(getattr(r, 'archived', False)),
                port=r.port,
                container_name=r.container_name,
            ) for r in rows
        ]

@router.post("/models")
async def create_model(body: CreateModelRequest, _: dict = Depends(require_admin)):
    # Persist only; container creation will be added in next step
    if body.mode not in ("online", "offline"):
        raise HTTPException(status_code=400, detail="invalid_mode")
    if body.mode == "online" and not body.repo_id:
        raise HTTPException(status_code=400, detail="repo_id_required")
    if body.mode == "offline" and not body.local_path:
        raise HTTPException(status_code=400, detail="local_path_required")
    
    # Engine-specific validation
    if body.engine_type == "llamacpp":
        if body.mode != "offline":
            raise HTTPException(status_code=400, detail="llamacpp requires offline mode")
        if not body.local_path:
            raise HTTPException(status_code=400, detail="llamacpp requires local_path")
        # GGUF validation can be added here if needed
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        m = Model(
            name=body.name,
            served_model_name=body.served_model_name,
            repo_id=body.repo_id,
            local_path=body.local_path,
            task=body.task,
            dtype=body.dtype,
            tp_size=body.tp_size,
            gpu_memory_utilization=body.gpu_memory_utilization,
            max_model_len=body.max_model_len,
            kv_cache_dtype=body.kv_cache_dtype,
            max_num_batched_tokens=body.max_num_batched_tokens,
            quantization=body.quantization,
            block_size=body.block_size,
            swap_space_gb=body.swap_space_gb,
            enforce_eager=body.enforce_eager,
            trust_remote_code=body.trust_remote_code,
            cpu_offload_gb=body.cpu_offload_gb,
            enable_prefix_caching=body.enable_prefix_caching,
            prefix_caching_hash_algo=body.prefix_caching_hash_algo,
            enable_chunked_prefill=body.enable_chunked_prefill,
            max_num_seqs=body.max_num_seqs,
            cuda_graph_sizes=body.cuda_graph_sizes,
            pipeline_parallel_size=body.pipeline_parallel_size,
            device=body.device,
            tokenizer=body.tokenizer,
            hf_config_path=body.hf_config_path,
            hf_token=body.hf_token,
            engine_type=body.engine_type,
            ngl=body.ngl,
            tensor_split=body.tensor_split,
            batch_size=body.batch_size,
            threads=body.threads,
            context_size=body.context_size,
            rope_freq_base=body.rope_freq_base,
            rope_freq_scale=body.rope_freq_scale,
            flash_attention=body.flash_attention,
            mlock=body.mlock,
            no_mmap=body.no_mmap,
            numa_policy=body.numa_policy,
            split_mode=body.split_mode,
            state="stopped",
        )
        session.add(m)
        await session.commit()
        return {"id": m.id}

class UpdateModelRequest(BaseModel):
    name: Optional[str] = None
    served_model_name: Optional[str] = None
    dtype: Optional[str] = None
    tp_size: Optional[int] = None
    gpu_memory_utilization: Optional[float] = None
    max_model_len: Optional[int] = None
    kv_cache_dtype: Optional[str] = None
    max_num_batched_tokens: Optional[int] = None
    quantization: Optional[str] = None
    block_size: Optional[int] = None
    swap_space_gb: Optional[int] = None
    enforce_eager: Optional[bool] = None
    trust_remote_code: Optional[bool] = None
    cpu_offload_gb: Optional[int] = None
    enable_prefix_caching: Optional[bool] = None
    prefix_caching_hash_algo: Optional[str] = None
    enable_chunked_prefill: Optional[bool] = None
    max_num_seqs: Optional[int] = None
    cuda_graph_sizes: Optional[str] = None
    pipeline_parallel_size: Optional[int] = None
    device: Optional[str] = None
    archived: Optional[bool] = None
    tokenizer: Optional[str] = None
    hf_config_path: Optional[str] = None
    hf_token: Optional[str] = None

@router.patch("/models/{model_id}")
async def update_model(model_id: int, body: UpdateModelRequest, _: dict = Depends(require_admin)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        # Validation: If switching to GGUF path, ensure tokenizer is present and warn on multiple tokenizers (best-effort handled on UI via inspect)
        try:
            new_vals = body.dict(exclude_unset=True)
            local_path = str(getattr(m, 'local_path', '') or '')
            # Note: local_path is immutable post-create in UI, but we guard for completeness
            if local_path.lower().endswith('.gguf'):
                tok = new_vals.get('tokenizer', getattr(m, 'tokenizer', None))
                if not tok:
                    raise HTTPException(status_code=400, detail="tokenizer_required_for_gguf")
        except HTTPException:
            raise
        except Exception:
            pass
        # apply changes if provided (including optional hf_token)
        for field, value in body.dict(exclude_unset=True).items():
            setattr(m, field, value)
        from sqlalchemy import update as _update
        await session.execute(_update(Model).where(Model.id == model_id).values(**body.dict(exclude_unset=True)))
        await session.commit()
        return {"status": "ok"}

@router.post("/models/{model_id}/archive")
async def archive_model(model_id: int, _: dict = Depends(require_admin)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        await session.execute(update(Model).where(Model.id == model_id).values(archived=True))
        await session.commit()
        return {"status": "archived"}

@router.delete("/models/{model_id}")
async def delete_model(model_id: int, purge_cache: bool = False, _: dict = Depends(require_admin)):
    """Delete DB record and, if offline/local_path, remove model files from host (dangerous)."""
    import os
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        # Ensure container is stopped and deregistered
        try:
            stop_container_for_model(m)
        except Exception:
            pass
        try:
            if m.served_model_name:
                unregister_model_endpoint(m.served_model_name)
        except Exception:
            pass
        # Dangerous: remove local files only for offline/local_path
        removed = False
        cache_removed = False
        try:
            if m.local_path:
                base = get_settings().CORTEX_MODELS_DIR.rstrip("/")
                target = os.path.join(base, m.local_path)
                if os.path.isdir(target) and target.startswith(base):
                    import shutil
                    shutil.rmtree(target, ignore_errors=True)
                    removed = True
        except Exception:
            removed = False
        # Optional: purge Hugging Face cache for online models when requested
        try:
            if purge_cache and (not m.local_path) and m.repo_id:
                hf_base = get_settings().HF_CACHE_DIR.rstrip("/")
                # HF cache layout uses models--{org}--{repo}
                safe_name = str(m.repo_id).replace("/", "--")
                hf_target = os.path.join(hf_base, f"models--{safe_name}")
                if os.path.isdir(hf_target) and hf_target.startswith(hf_base):
                    import shutil
                    shutil.rmtree(hf_target, ignore_errors=True)
                    cache_removed = True
        except Exception:
            cache_removed = False
        await session.execute(delete(Model).where(Model.id == model_id))
        await session.commit()
        return {"status": "deleted", "files_removed": removed, "cache_removed": cache_removed}

@router.post("/models/{model_id}/start")
async def start_model(model_id: int, _: dict = Depends(require_admin)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        try:
            name, host_port = start_container_for_model(m, hf_token=getattr(m, 'hf_token', None))
            await session.execute(update(Model).where(Model.id == model_id).values(state="running", container_name=name, port=host_port))
            await session.commit()
            # Register served name → URL so gateway can route by model
            try:
                if m.served_model_name and host_port:
                    # Prefer direct container address on the compose network for reliability
                    register_model_endpoint(m.served_model_name, f"http://{name}:8000", m.task or "generate")
            except Exception:
                pass
            return {"status": "running", "container": name, "port": host_port}
        except Exception as e:
            await session.execute(update(Model).where(Model.id == model_id).values(state="failed"))
            await session.commit()
            raise HTTPException(status_code=500, detail=f"start_failed: {e}")

@router.post("/models/{model_id}/stop")
async def stop_model(model_id: int, _: dict = Depends(require_admin)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        try:
            stop_container_for_model(m)
        except Exception:
            pass
        await session.execute(update(Model).where(Model.id == model_id).values(state="stopped"))
        try:
            if m.served_model_name:
                unregister_model_endpoint(m.served_model_name)
                # Persist registry after unregister (best-effort)
                try:
                    from ..models import ConfigKV  # type: ignore
                    import json as _json
                    SessionLocal2 = _get_session()
                    if SessionLocal2 is not None:
                        async with SessionLocal2() as s:
                            from sqlalchemy import select as _select
                            val = _json.dumps(_get_registry())
                            row = (await s.execute(_select(ConfigKV).where(ConfigKV.key == "model_registry"))).scalar_one_or_none()
                            if row:
                                row.value = val
                            else:
                                s.add(ConfigKV(key="model_registry", value=val))
                            await s.commit()
                except Exception:
                    pass
        except Exception:
            pass
        await session.commit()
    return {"status": "stopped"}

@router.get("/models/{model_id}/logs")
async def model_logs(model_id: int, _: dict = Depends(require_admin)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        return ""
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        return tail_logs_for_model(m)

@router.post("/models/{model_id}/apply")
async def apply_model_changes(model_id: int, _: dict = Depends(require_admin)):
    """Minimal apply: stop then start container to pick up updated flags."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        try:
            stop_container_for_model(m)
        except Exception:
            pass
        name, host_port = start_container_for_model(m, hf_token=getattr(m, 'hf_token', None))
        await session.execute(update(Model).where(Model.id == model_id).values(state="running", container_name=name, port=host_port))
        await session.commit()
        try:
            if m.served_model_name and host_port:
                register_model_endpoint(m.served_model_name, f"http://{name}:8000", m.task or "generate")
                # Persist registry after (best-effort)
                try:
                    from ..models import ConfigKV  # type: ignore
                    import json as _json
                    SessionLocal2 = _get_session()
                    if SessionLocal2 is not None:
                        async with SessionLocal2() as s:
                            from sqlalchemy import select as _select
                            val = _json.dumps(_get_registry())
                            row = (await s.execute(_select(ConfigKV).where(ConfigKV.key == "model_registry"))).scalar_one_or_none()
                            if row:
                                row.value = val
                            else:
                                s.add(ConfigKV(key="model_registry", value=val))
                            await s.commit()
                except Exception:
                    pass
        except Exception:
            pass
        return {"status": "applied", "container": name, "port": host_port}

@router.post("/models/{model_id}/dry-run")
async def model_dry_run(model_id: int, _: dict = Depends(require_admin)):
    """Return effective vLLM command that would be used; do not start container."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        from ..docker_manager import _build_command  # type: ignore
        try:
            cmd = _build_command(m)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {"command": cmd}

# Base directory config endpoints (persist temporarily in memory env)
_BASE_DIR: Optional[str] = None

@router.get("/models/base-dir", response_model=BaseDirCfg)
async def get_base_dir(_: dict = Depends(require_admin)):
    global _BASE_DIR
    if _BASE_DIR is not None:
        return BaseDirCfg(base_dir=_BASE_DIR)
    SessionLocal = _get_session()
    if SessionLocal is None:
        # fallback to host-visible default for UI display
        s = get_settings()
        return BaseDirCfg(base_dir=s.CORTEX_MODELS_DIR_HOST or s.CORTEX_MODELS_DIR)
    async with SessionLocal() as session:
        res = await session.execute(select(ConfigKV).where(ConfigKV.key == "models_base_dir"))
        row = res.scalar_one_or_none()
        if row:
            _BASE_DIR = row.value
        else:
            s = get_settings()
            _BASE_DIR = s.CORTEX_MODELS_DIR_HOST or s.CORTEX_MODELS_DIR
        return BaseDirCfg(base_dir=_BASE_DIR)

@router.put("/models/base-dir")
async def put_base_dir(body: BaseDirCfg, _: dict = Depends(require_admin)):
    import os
    if not body.base_dir:
        raise HTTPException(status_code=400, detail="base_dir_required")
    if not os.path.isabs(body.base_dir):
        raise HTTPException(status_code=400, detail="base_dir_must_be_absolute")
    global _BASE_DIR
    _BASE_DIR = body.base_dir
    SessionLocal = _get_session()
    if SessionLocal is None:
        return {"status": "ok"}
    async with SessionLocal() as session:
        res = await session.execute(select(ConfigKV).where(ConfigKV.key == "models_base_dir"))
        row = res.scalar_one_or_none()
        if row:
            row.value = body.base_dir
        else:
            session.add(ConfigKV(key="models_base_dir", value=body.base_dir))
        await session.commit()
        return {"status": "ok"}

@router.get("/models/local-folders", response_model=List[str])
async def list_local_folders(base: str = Query(""), _: dict = Depends(require_admin)):
    import os
    s = get_settings()
    if not base:
        base = _BASE_DIR or ""
    if not base:
        return []
    # Map host path to container mount if user provided host path on Windows/macOS
    try:
        norm = base.replace("\\", "/").lower()
        host = (s.CORTEX_MODELS_DIR_HOST or "").replace("\\", "/").lower()
        if host and norm.startswith(host):
            base = s.CORTEX_MODELS_DIR
    except Exception:
        pass
    try:
        # Whitelist: only list direct subfolders
        items: list[str] = []
        for name in sorted(os.listdir(base)):
            full = os.path.join(base, name)
            if os.path.isdir(full):
                items.append(name)
        return items
    except Exception:
        return []


class InspectFolderResp(BaseModel):
    has_safetensors: bool
    gguf_files: list[str]
    tokenizer_files: list[str]
    config_files: list[str]
    warnings: list[str]
    params_b: float | None = None
    hidden_size: int | None = None
    num_hidden_layers: int | None = None
    num_attention_heads: int | None = None


@router.get("/models/inspect-folder", response_model=InspectFolderResp)
async def inspect_folder(base: str = Query(""), folder: str = Query(""), _: dict = Depends(require_admin)):
    """Inspect a direct subfolder of the models base dir.
    Returns presence of safetensors, list of .gguf files, tokenizer/config files and warnings.
    """
    import os
    s = get_settings()
    if not base:
        base = _BASE_DIR or ""
    if not base:
        raise HTTPException(status_code=400, detail="base_required")
    # Map host path to container mount if needed (Windows/macOS dev)
    try:
        norm = base.replace("\\", "/").lower()
        host = (s.CORTEX_MODELS_DIR_HOST or "").replace("\\", "/").lower()
        if host and norm.startswith(host):
            base = s.CORTEX_MODELS_DIR
    except Exception:
        pass
    target = os.path.join(base, folder or "")
    if not os.path.isdir(target):
        raise HTTPException(status_code=404, detail="folder_not_found")
    try:
        names = []
        for name in os.listdir(target):
            try:
                names.append(name)
            except Exception:
                pass
        has_safe = any(n.lower().endswith('.safetensors') for n in names)
        ggufs = sorted([n for n in names if n.lower().endswith('.gguf')])
        toks = sorted([n for n in names if n.lower() in ('tokenizer.json', 'tokenizer.model', 'tokenizer_config.json')])
        cfgs = sorted([n for n in names if n.lower() in ('config.json', 'generation_config.json', 'special_tokens_map.json')])
        warnings: list[str] = []
        if len(toks) > 1:
            warnings.append("multiple_tokenizer_files_detected")
        parsed = None
        try:
            cfg_path = os.path.join(target, 'config.json')
            if os.path.isfile(cfg_path):
                import json as _json
                with open(cfg_path, 'r', encoding='utf-8') as f:
                    parsed = _json.load(f)
        except Exception:
            parsed = None
        def _get_int(keys: list[str]) -> int | None:
            for k in keys:
                try:
                    v = parsed.get(k) if parsed else None
                    if isinstance(v, int):
                        return v
                except Exception:
                    pass
            return None
        out = InspectFolderResp(
            has_safetensors=bool(has_safe),
            gguf_files=ggufs,
            tokenizer_files=toks,
            config_files=cfgs,
            warnings=warnings,
        )
        if parsed:
            try:
                if isinstance(parsed.get('params'), (int, float)):
                    try:
                        out.params_b = float(parsed.get('params')) / 1e9
                    except Exception:
                        pass
                out.hidden_size = _get_int(['hidden_size', 'n_embd'])
                out.num_hidden_layers = _get_int(['num_hidden_layers', 'n_layer'])
                out.num_attention_heads = _get_int(['num_attention_heads', 'n_head'])
            except Exception:
                pass
        return out
    except Exception:
        return InspectFolderResp(has_safetensors=False, gguf_files=[], tokenizer_files=[], config_files=[], warnings=["inspect_error"])


class HfConfigResp(BaseModel):
    hidden_size: int | None = None
    num_hidden_layers: int | None = None
    num_attention_heads: int | None = None
    params_b: float | None = None


@router.get("/models/hf-config", response_model=HfConfigResp)
async def hf_config(repo_id: str = Query("")):
    if not repo_id:
        raise HTTPException(status_code=400, detail="repo_id_required")
    urls = [
        f"https://huggingface.co/{repo_id}/resolve/main/config.json",
        f"https://huggingface.co/{repo_id}/raw/main/config.json",
    ]
    headers = {}
    try:
        token = os.environ.get('HUGGING_FACE_HUB_TOKEN', '')
        if token:
            headers['Authorization'] = f"Bearer {token}"
    except Exception:
        pass
    parsed = None
    async with httpx.AsyncClient(timeout=6.0) as client:
        last_err = None
        for u in urls:
            try:
                r = await client.get(u, headers=headers)
                if r.status_code < 400:
                    parsed = r.json()
                    break
                last_err = r.text
            except Exception as e:
                last_err = str(e)
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=404, detail="config_not_found")
    def _get_int(keys: list[str]) -> int | None:
        for k in keys:
            try:
                v = parsed.get(k)
                if isinstance(v, int):
                    return v
            except Exception:
                pass
        return None
    out = HfConfigResp()
    try:
        if isinstance(parsed.get('params'), (int, float)):
            try:
                out.params_b = float(parsed.get('params')) / 1e9
            except Exception:
                pass
        out.hidden_size = _get_int(['hidden_size', 'n_embd'])
        out.num_hidden_layers = _get_int(['num_hidden_layers', 'n_layer'])
        out.num_attention_heads = _get_int(['num_attention_heads', 'n_head'])
    except Exception:
        pass
    return out

