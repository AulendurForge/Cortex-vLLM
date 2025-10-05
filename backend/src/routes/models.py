from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Any
from ..auth import require_admin
from ..config import get_settings
from ..models import Model, ConfigKV
from sqlalchemy import select, update, delete
from ..docker_manager import start_container_for_model, stop_container_for_model, tail_logs_for_model
import httpx
import os
import time
import re
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
        # Clear vLLM-specific fields for llamacpp models (keep database clean)
        body.tp_size = None
        body.gpu_memory_utilization = None
        body.kv_cache_dtype = None
        body.quantization = None
        body.block_size = None
        body.swap_space_gb = None
        body.max_num_batched_tokens = None
        body.enable_prefix_caching = None
        body.prefix_caching_hash_algo = None
        body.enable_chunked_prefill = None
        body.max_num_seqs = None
        body.cuda_graph_sizes = None
        body.pipeline_parallel_size = None
        body.cpu_offload_gb = None
    else:  # vllm
        # Clear llama.cpp-specific fields for vLLM models
        body.ngl = None
        body.tensor_split = None
        body.batch_size = None
        body.threads = None
        body.context_size = None
        body.rope_freq_base = None
        body.rope_freq_scale = None
        body.flash_attention = None
        body.mlock = None
        body.no_mmap = None
        body.numa_policy = None
        body.split_mode = None
    
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

def _handle_multipart_gguf_merge(m: Model) -> None:
    """
    Detect if model uses a multi-part GGUF file and merge if necessary.
    Updates model.local_path to point to merged file if merge occurs.
    
    This runs automatically when starting a model that references a multi-part GGUF.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    if not m.local_path or not m.local_path.lower().endswith('.gguf'):
        return  # Not a GGUF file
    
    # Check if the path matches multi-part pattern
    filename = os.path.basename(m.local_path)
    multipart_match = re.match(r'(.+)-(\d{5})-of-(\d{5})\.gguf$', filename, re.IGNORECASE)
    
    if not multipart_match:
        return  # Not a multi-part file
    
    logger.info(f"Detected multi-part GGUF file: {m.local_path}")
    
    # Parse the pattern
    base_name = multipart_match.group(1)
    total_parts = int(multipart_match.group(3))
    
    # Get directory paths
    s = get_settings()
    base_dir = s.CORTEX_MODELS_DIR or "/var/cortex/models"
    
    # Construct full path
    model_folder = os.path.dirname(m.local_path)  # e.g., "huihui-ai/Q8_0-GGUF"
    target_dir = os.path.join(base_dir, model_folder)
    
    # Find all parts
    all_parts = []
    for i in range(1, total_parts + 1):
        part_filename = f"{base_name}-{i:05d}-of-{total_parts:05d}.gguf"
        part_path = os.path.join(target_dir, part_filename)
        if os.path.exists(part_path):
            all_parts.append(part_path)
    
    if len(all_parts) != total_parts:
        raise Exception(f"Incomplete multi-part GGUF: found {len(all_parts)} of {total_parts} parts")
    
    # Extract quantization type for merged filename
    quant_type = _detect_quantization_from_filename(filename)
    merged_filename = f"merged-{quant_type}.gguf"
    merged_path = os.path.join(target_dir, merged_filename)
    
    # Check if already merged
    if os.path.exists(merged_path):
        logger.info(f"Merged file already exists: {merged_path}")
        # Update model to use merged file
        merged_rel_path = os.path.join(model_folder, merged_filename)
        m.local_path = merged_rel_path
        return
    
    # Perform merge
    logger.info(f"Merging {total_parts} GGUF parts into {merged_path}")
    
    try:
        with open(merged_path, 'wb') as outfile:
            for i, part_path in enumerate(sorted(all_parts), 1):
                logger.info(f"Merging part {i}/{total_parts}: {os.path.basename(part_path)}")
                with open(part_path, 'rb') as infile:
                    # Stream in 64MB chunks
                    while True:
                        chunk = infile.read(64 * 1024 * 1024)
                        if not chunk:
                            break
                        outfile.write(chunk)
        
        # Verify size
        expected_size = sum(os.path.getsize(f) for f in all_parts)
        actual_size = os.path.getsize(merged_path)
        
        if expected_size != actual_size:
            os.remove(merged_path)
            raise Exception(f"Merge failed: size mismatch (expected {expected_size}, got {actual_size})")
        
        logger.info(f"Successfully merged into {merged_path} ({actual_size / (1024**3):.2f} GB)")
        
        # Update model to use merged file
        merged_rel_path = os.path.join(model_folder, merged_filename)
        m.local_path = merged_rel_path
        
    except Exception as e:
        # Clean up partial file
        if os.path.exists(merged_path):
            try:
                os.remove(merged_path)
            except:
                pass
        raise Exception(f"Failed to merge GGUF parts: {str(e)}")


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
            # Auto-merge multi-part GGUF files if needed
            _handle_multipart_gguf_merge(m)
            
            # If merge occurred, persist the updated local_path
            if m.local_path:
                await session.execute(update(Model).where(Model.id == model_id).values(local_path=m.local_path))
                await session.commit()
            
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
    """Return effective command that would be used (vLLM or llama.cpp); do not start container."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        
        engine_type = getattr(m, 'engine_type', 'vllm')
        
        try:
            if engine_type == 'llamacpp':
                from ..docker_manager import _build_llamacpp_command  # type: ignore
                cmd = _build_llamacpp_command(m)
            else:
                from ..docker_manager import _build_command  # type: ignore
                cmd = _build_command(m)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        return {"command": cmd, "engine": engine_type}

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


class GGUFGroup(BaseModel):
    """Represents a group of GGUF files (single or multi-part)."""
    quant_type: str
    display_name: str
    files: list[str]  # Relative paths from target directory
    full_paths: list[str]  # Absolute paths for backend use
    is_multipart: bool
    expected_parts: int | None = None
    actual_parts: int
    total_size_mb: float
    status: str  # 'ready', 'complete_but_needs_merge', 'incomplete', 'unknown'
    can_use: bool
    warning: str | None = None
    is_recommended: bool = False


class InspectFolderResp(BaseModel):
    has_safetensors: bool
    gguf_files: list[str]  # Legacy: flat list
    gguf_groups: list[GGUFGroup]  # New: smart grouped analysis
    tokenizer_files: list[str]
    config_files: list[str]
    warnings: list[str]
    params_b: float | None = None
    hidden_size: int | None = None
    num_hidden_layers: int | None = None
    num_attention_heads: int | None = None


def _detect_quantization_from_filename(filename: str) -> str:
    """Extract quantization type from GGUF filename."""
    # Common patterns: Q8_0, Q5_K_M, Q4_K_S, F16, etc.
    # Patterns match at word boundaries or start of string
    # Delimiters: underscore, dash, or dot (_, -, .)
    quant_patterns = [
        r'(?:^|[_\-\.])(Q\d+_[KML](?:_[SML])?)',  # Q5_K_M, Q4_K_S, etc.
        r'(?:^|[_\-\.])(Q\d+_\d+)',                # Q8_0, Q4_1, etc.
        r'(?:^|[_\-\.])([Ff]\d+)',                 # F16, f16, F32
        r'(?:^|[_\-\.])(IQ\d+_[A-Z]+)',            # IQ3_XXS, etc.
    ]
    for pattern in quant_patterns:
        match = re.search(pattern, filename, re.IGNORECASE)
        if match:
            return match.group(1).upper()
    return "Unknown"


def _find_gguf_files_recursive(directory: str) -> list[tuple[str, str]]:
    """Recursively find all GGUF files.
    Returns list of (relative_path, absolute_path) tuples."""
    gguf_files = []
    try:
        for root, dirs, files in os.walk(directory):
            for filename in files:
                if filename.lower().endswith('.gguf'):
                    abs_path = os.path.join(root, filename)
                    rel_path = os.path.relpath(abs_path, directory)
                    gguf_files.append((rel_path, abs_path))
    except Exception:
        pass
    return gguf_files


def _analyze_gguf_files(directory: str) -> list[GGUFGroup]:
    """Smart analysis of GGUF files with grouping and multi-part detection."""
    gguf_files = _find_gguf_files_recursive(directory)
    
    if not gguf_files:
        return []
    
    # Group files by base name and quantization
    groups_dict: dict[str, dict[str, Any]] = {}
    
    for rel_path, abs_path in gguf_files:
        filename = os.path.basename(rel_path)
        
        # Check for multi-part pattern: model-Q8_0-00001-of-00006.gguf
        multipart_match = re.match(
            r'(.+)-(\d{5})-of-(\d{5})\.gguf$',
            filename,
            re.IGNORECASE
        )
        
        if multipart_match:
            # Multi-part file
            base_name = multipart_match.group(1)
            part_num = int(multipart_match.group(2))
            total_parts = int(multipart_match.group(3))
            quant_type = _detect_quantization_from_filename(base_name)
            
            group_key = f"multipart_{base_name}_{quant_type}"
            
            if group_key not in groups_dict:
                groups_dict[group_key] = {
                    'quant_type': quant_type,
                    'base_name': base_name,
                    'files': [],
                    'full_paths': [],
                    'is_multipart': True,
                    'expected_parts': total_parts,
                    'parts_seen': set()
                }
            
            groups_dict[group_key]['files'].append(rel_path)
            groups_dict[group_key]['full_paths'].append(abs_path)
            groups_dict[group_key]['parts_seen'].add(part_num)
        else:
            # Single file
            quant_type = _detect_quantization_from_filename(filename)
            group_key = f"single_{filename}_{quant_type}"
            
            groups_dict[group_key] = {
                'quant_type': quant_type,
                'base_name': filename.replace('.gguf', ''),
                'files': [rel_path],
                'full_paths': [abs_path],
                'is_multipart': False,
                'expected_parts': None,
                'parts_seen': set()
            }
    
    # Convert to GGUFGroup objects
    groups = []
    for group_key, group_data in groups_dict.items():
        actual_parts = len(group_data['files'])
        
        # Calculate total size
        total_size_mb = 0.0
        try:
            for fpath in group_data['full_paths']:
                if os.path.isfile(fpath):
                    total_size_mb += os.path.getsize(fpath) / (1024 * 1024)
        except Exception:
            pass
        
        # Determine status and usability
        if group_data['is_multipart']:
            expected = group_data['expected_parts']
            if actual_parts == expected:
                # Check if merged file already exists
                parts_dir = os.path.dirname(group_data['full_paths'][0])
                merged_filename = f"merged-{group_data['quant_type']}.gguf"
                merged_path = os.path.join(parts_dir, merged_filename)
                
                if os.path.exists(merged_path):
                    status = 'merged_available'
                    can_use = False  # Use the merged file instead
                    warning = f"ℹ️ Merged version available: {merged_filename}"
                else:
                    status = 'complete_but_needs_merge'
                    can_use = False  # Multi-part files need merging
                    warning = f"⚠️ Multi-part GGUF detected ({actual_parts} files). Will be auto-merged when selected."
            else:
                status = 'incomplete'
                can_use = False
                warning = f"❌ Incomplete multi-part set: Only {actual_parts} of {expected} parts found."
        else:
            status = 'ready'
            can_use = True
            warning = None
        
        # Create display name
        quant = group_data['quant_type']
        if group_data['is_multipart']:
            display_name = f"{quant} ({actual_parts} parts)"
        else:
            display_name = quant
        
        groups.append(GGUFGroup(
            quant_type=group_data['quant_type'],
            display_name=display_name,
            files=sorted(group_data['files']),
            full_paths=sorted(group_data['full_paths']),
            is_multipart=group_data['is_multipart'],
            expected_parts=group_data['expected_parts'],
            actual_parts=actual_parts,
            total_size_mb=round(total_size_mb, 2),
            status=status,
            can_use=can_use,
            warning=warning
        ))
    
    # Sort: ready files first, then by quant quality (Q8 > Q5 > Q4)
    def sort_key(g: GGUFGroup):
        priority = 0 if g.can_use else 1
        # Extract number from quant type for quality sorting
        quant_num = 8  # default
        match = re.search(r'Q(\d+)', g.quant_type)
        if match:
            quant_num = int(match.group(1))
        return (priority, -quant_num, g.quant_type)
    
    groups.sort(key=sort_key)
    
    # Mark the first ready group as recommended
    for g in groups:
        if g.can_use:
            g.is_recommended = True
            break
    
    return groups


def _merge_gguf_parts(group_data: dict, target_directory: str) -> str:
    """
    Merge multi-part GGUF files into a single file.
    
    Args:
        group_data: GGUFGroup data containing files and metadata
        target_directory: Directory containing the GGUF parts
    
    Returns:
        Path to the merged file (relative to target_directory)
    
    Raises:
        Exception if merge fails
    """
    import logging
    logger = logging.getLogger(__name__)
    
    if not group_data.get('is_multipart'):
        raise ValueError("Group is not multi-part, no merge needed")
    
    # Determine output filename
    quant_type = group_data.get('quant_type', 'Unknown')
    base_name = group_data.get('files', [''])[0].split('/')[0] if '/' in group_data.get('files', [''])[0] else ''
    output_filename = f"merged-{quant_type}.gguf"
    
    # Use first file's directory if parts are in subdirectory
    first_file_path = group_data['full_paths'][0]
    parts_dir = os.path.dirname(first_file_path)
    output_path = os.path.join(parts_dir, output_filename)
    
    # Check if already merged
    if os.path.exists(output_path):
        logger.info(f"Merged file already exists: {output_path}")
        # Return relative path from target_directory
        return os.path.relpath(output_path, target_directory)
    
    logger.info(f"Merging {len(group_data['files'])} GGUF parts into {output_path}")
    
    # Merge files using binary concatenation
    try:
        with open(output_path, 'wb') as outfile:
            for i, part_path in enumerate(sorted(group_data['full_paths']), 1):
                logger.info(f"Merging part {i}/{len(group_data['files'])}: {os.path.basename(part_path)}")
                with open(part_path, 'rb') as infile:
                    # Stream in 64MB chunks to avoid memory issues
                    while True:
                        chunk = infile.read(64 * 1024 * 1024)
                        if not chunk:
                            break
                        outfile.write(chunk)
        
        # Verify merged file size
        expected_size = sum(os.path.getsize(f) for f in group_data['full_paths'])
        actual_size = os.path.getsize(output_path)
        
        if expected_size != actual_size:
            os.remove(output_path)
            raise Exception(f"Merge failed: size mismatch (expected {expected_size}, got {actual_size})")
        
        logger.info(f"Successfully merged {len(group_data['files'])} parts into {output_path}")
        logger.info(f"Merged file size: {actual_size / (1024**3):.2f} GB")
        
        # Return relative path from target_directory
        return os.path.relpath(output_path, target_directory)
        
    except Exception as e:
        # Clean up partial file on error
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
            except:
                pass
        raise Exception(f"Failed to merge GGUF parts: {str(e)}")


def _check_merged_file_exists(group_data: dict, target_directory: str) -> str | None:
    """
    Check if a merged file already exists for this multi-part group.
    
    Returns:
        Relative path to merged file if it exists, None otherwise
    """
    if not group_data.get('is_multipart'):
        return None
    
    quant_type = group_data.get('quant_type', 'Unknown')
    first_file_path = group_data['full_paths'][0]
    parts_dir = os.path.dirname(first_file_path)
    output_filename = f"merged-{quant_type}.gguf"
    output_path = os.path.join(parts_dir, output_filename)
    
    if os.path.exists(output_path):
        return os.path.relpath(output_path, target_directory)
    return None


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
        # Perform smart GGUF analysis
        gguf_groups = _analyze_gguf_files(target)
        
        out = InspectFolderResp(
            has_safetensors=bool(has_safe),
            gguf_files=ggufs,  # Legacy: keep for backward compatibility
            gguf_groups=gguf_groups,  # New: smart grouped analysis
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
        return InspectFolderResp(
            has_safetensors=False,
            gguf_files=[],
            gguf_groups=[],
            tokenizer_files=[],
            config_files=[],
            warnings=["inspect_error"]
        )


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


class ModelTestResult(BaseModel):
    success: bool
    test_type: str
    request: dict[str, Any]
    response: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    latency_ms: int
    timestamp: float


@router.post("/models/{model_id}/test", response_model=ModelTestResult)
async def test_model(model_id: int, _: dict = Depends(require_admin)):
    """Send a sanity check request to a running model to verify it's working.
    
    - For chat models: Sends 'Hello' message
    - For embedding models: Sends 'test' text
    - Returns full request/response with timing metrics
    """
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="model_not_found")
        
        if m.state != "running":
            raise HTTPException(status_code=400, detail=f"Model is not running (current state: {m.state})")
        
        if not m.container_name:
            raise HTTPException(status_code=400, detail="No container name found for model")
        
        # Get model URL (prefer container name for internal routing)
        registry = _get_registry()
        model_entry = registry.get(m.served_model_name, {})
        base_url = model_entry.get("url") or f"http://{m.container_name}:8000"
        
        # Determine test type from task field
        test_type = "embeddings" if m.task and m.task.lower().startswith("embed") else "chat"
        
        start_time = time.time()
        result_data = {}
        
        try:
            if test_type == "embeddings":
                result_data = await _test_embedding_model(base_url, m.served_model_name)
            else:
                result_data = await _test_chat_model(base_url, m.served_model_name)
            
            latency_ms = int((time.time() - start_time) * 1000)
            
            return ModelTestResult(
                success=True,
                test_type=test_type,
                request=result_data["request"],
                response=result_data["response"],
                error=None,
                latency_ms=latency_ms,
                timestamp=time.time()
            )
            
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            return ModelTestResult(
                success=False,
                test_type=test_type,
                request=result_data.get("request", {}) if result_data else {},
                response=None,
                error=str(e)[:500],  # Limit error message length
                latency_ms=latency_ms,
                timestamp=time.time()
            )


async def _test_chat_model(base_url: str, model_name: str) -> dict[str, Any]:
    """Send test chat completion request to verify model is responding."""
    from ..main import http_client  # type: ignore
    
    request_data = {
        "model": model_name,
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 50,
        "temperature": 0.7
    }
    
    settings = get_settings()
    headers = {"Content-Type": "application/json"}
    if settings.INTERNAL_VLLM_API_KEY:
        headers["Authorization"] = f"Bearer {settings.INTERNAL_VLLM_API_KEY}"
    
    response = await http_client.post(
        f"{base_url}/v1/chat/completions",
        json=request_data,
        headers=headers,
        timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)
    )
    
    if response.status_code >= 400:
        raise Exception(f"Model returned HTTP {response.status_code}: {response.text[:200]}")
    
    response_data = response.json()
    
    # Verify response format
    if not response_data.get("choices"):
        raise Exception("Invalid response: missing 'choices' field")
    
    return {
        "request": request_data,
        "response": response_data
    }


async def _test_embedding_model(base_url: str, model_name: str) -> dict[str, Any]:
    """Send test embeddings request to verify model is responding."""
    from ..main import http_client  # type: ignore
    
    request_data = {
        "model": model_name,
        "input": "test"
    }
    
    settings = get_settings()
    headers = {"Content-Type": "application/json"}
    if settings.INTERNAL_VLLM_API_KEY:
        headers["Authorization"] = f"Bearer {settings.INTERNAL_VLLM_API_KEY}"
    
    response = await http_client.post(
        f"{base_url}/v1/embeddings",
        json=request_data,
        headers=headers,
        timeout=httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
    )
    
    if response.status_code >= 400:
        raise Exception(f"Model returned HTTP {response.status_code}: {response.text[:200]}")
    
    response_data = response.json()
    
    # Verify embedding format
    if not response_data.get("data") or not isinstance(response_data["data"], list):
        raise Exception("Invalid response: missing or invalid 'data' field")
    
    if not response_data["data"][0].get("embedding"):
        raise Exception("Invalid response: missing 'embedding' in data")
    
    return {
        "request": request_data,
        "response": response_data
    }

