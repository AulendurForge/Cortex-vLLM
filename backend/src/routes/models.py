from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Any
import json
from ..auth import require_admin
from ..config import get_settings
from ..models import Model, ConfigKV
from sqlalchemy import select, update, delete
from ..docker_manager import start_container_for_model, stop_container_for_model, tail_logs_for_model
from ..services.registry_persistence import persist_model_registry
from ..services.model_testing import ModelTestResult, ReadinessResp, test_chat_model, test_embedding_model, check_model_readiness
from ..services.folder_inspector import inspect_model_folder
from ..services.hf_inspector import fetch_hf_config
from ..schemas.models import ModelItem, CreateModelRequest, UpdateModelRequest, BaseDirCfg, InspectFolderResp, HfConfigResp
from ..utils.gguf_utils import GGUFGroup, detect_quantization_from_filename, find_gguf_files_recursive, analyze_gguf_files
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
                tp_size=r.tp_size if r.engine_type != 'llamacpp' else (
                    len(r.tensor_split.split(',')) if r.tensor_split else None
                ),
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
                selected_gpus=json.loads(getattr(r, 'selected_gpus', None) or '[]') if getattr(r, 'selected_gpus', None) else None,
                ngl=getattr(r, 'ngl', None),
                tensor_split=getattr(r, 'tensor_split', None),
                batch_size=getattr(r, 'batch_size', None),
                ubatch_size=getattr(r, 'ubatch_size', None),
                threads=getattr(r, 'threads', None),
                context_size=getattr(r, 'context_size', None),
                parallel_slots=getattr(r, 'parallel_slots', None),
                rope_freq_base=getattr(r, 'rope_freq_base', None),
                rope_freq_scale=getattr(r, 'rope_freq_scale', None),
                flash_attention=getattr(r, 'flash_attention', None),
                mlock=getattr(r, 'mlock', None),
                no_mmap=getattr(r, 'no_mmap', None),
                numa_policy=getattr(r, 'numa_policy', None),
                split_mode=getattr(r, 'split_mode', None),
                cache_type_k=getattr(r, 'cache_type_k', None),
                cache_type_v=getattr(r, 'cache_type_v', None),
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
            selected_gpus=json.dumps(body.selected_gpus) if body.selected_gpus else None,
            ngl=body.ngl,
            tensor_split=body.tensor_split,
            batch_size=body.batch_size,
            ubatch_size=body.ubatch_size,
            threads=body.threads,
            context_size=body.context_size,
            parallel_slots=body.parallel_slots,
            rope_freq_base=body.rope_freq_base,
            rope_freq_scale=body.rope_freq_scale,
            flash_attention=body.flash_attention,
            mlock=body.mlock,
            no_mmap=body.no_mmap,
            numa_policy=body.numa_policy,
            split_mode=body.split_mode,
            cache_type_k=body.cache_type_k,
            cache_type_v=body.cache_type_v,
            state="stopped",
        )
        session.add(m)
        await session.commit()
        return {"id": m.id}

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
        update_data = body.dict(exclude_unset=True)
        # Handle selected_gpus serialization
        if 'selected_gpus' in update_data and update_data['selected_gpus'] is not None:
            update_data['selected_gpus'] = json.dumps(update_data['selected_gpus'])
        
        for field, value in update_data.items():
            setattr(m, field, value)
        from sqlalchemy import update as _update
        await session.execute(_update(Model).where(Model.id == model_id).values(**update_data))
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
async def delete_model(model_id: int, _: dict = Depends(require_admin)):
    """Delete model database record only. Model files are NEVER deleted from disk.
    
    This removes the model from Cortex's management but preserves all model files
    in the offline models directory. This is critical for manually-placed models
    that may be difficult or impossible to re-download in offline/air-gapped environments.
    
    To remove a model configuration:
    - The database record is deleted
    - Associated recipes are also deleted (cascade)
    - The container is stopped (if running)
    - Model files remain on disk untouched
    
    Administrators must manually delete model files from the filesystem if desired.
    """
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
        # Delete associated recipes first to avoid foreign key constraint violations
        recipes_deleted = 0
        try:
            from ..models import Recipe
            result = await session.execute(delete(Recipe).where(Recipe.model_id == model_id))
            recipes_deleted = result.rowcount if hasattr(result, 'rowcount') else 0
        except Exception:
            # Best effort - continue with model deletion even if recipe deletion fails
            pass
        # Delete database record only - NEVER delete model files from disk
        # This protects manually-placed offline models from accidental deletion
        await session.execute(delete(Model).where(Model.id == model_id))
        await session.commit()
        msg = "Model files remain on disk - delete manually if needed"
        if recipes_deleted > 0:
            msg = f"{recipes_deleted} associated recipe(s) also deleted. " + msg
        return {"status": "deleted", "files_preserved": True, "recipes_deleted": recipes_deleted, "note": msg}

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

    # New strategy: do NOT attempt to merge. Point to the first split file and
    # rely on llama.cpp to auto-detect and load remaining parts.
    
    # Parse the pattern
    base_name = multipart_match.group(1)
    total_parts = int(multipart_match.group(3))
    
    # Get directory paths
    s = get_settings()
    base_dir = s.CORTEX_MODELS_DIR or "/var/cortex/models"
    
    # Construct full path
    model_folder = os.path.dirname(m.local_path)
    target_dir = os.path.join(base_dir, model_folder)
    
    # Legacy cleanup: warn if old concatenated merged-*.gguf files exist
    try:
        legacy_merged = [n for n in os.listdir(target_dir) if n.lower().endswith('.gguf') and n.startswith('merged-')]
        if legacy_merged:
            logger.warning(
                "Detected legacy merged GGUF files in %s: %s (will ignore and use split parts)",
                target_dir,
                ", ".join(sorted(legacy_merged))
            )
    except Exception:
        pass

    # Resolve first part path
    first_part_filename = f"{base_name}-00001-of-{total_parts:05d}.gguf"
    first_part_path = os.path.join(target_dir, first_part_filename)

    if not os.path.exists(first_part_path):
        raise Exception(f"First GGUF part not found: {first_part_filename}")

    # Best-effort: ensure all expected parts exist before starting (fast check)
    missing = []
    for i in range(1, total_parts + 1):
        part_filename = f"{base_name}-{i:05d}-of-{total_parts:05d}.gguf"
        if not os.path.exists(os.path.join(target_dir, part_filename)):
            missing.append(part_filename)
    if missing:
        raise Exception(f"Incomplete multi-part GGUF: missing {len(missing)} parts; e.g. {missing[:3]}")

    # Update model to use the first part; llama.cpp will load the rest
    m.local_path = os.path.join(model_folder, first_part_filename)
    logger.info(
        "Using multi-part GGUF without merge; selected first part: %s",
        m.local_path,
    )


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
                    # Persist registry after register
                    await persist_model_registry()
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
                # Persist registry after unregister
                await persist_model_registry()
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
                # Persist registry after register
                await persist_model_registry()
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


# Legacy merge functions removed - we now use llama.cpp's native split-file loading
# See docs/models/gguf-multipart.md for details on the new approach


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
    
    # Delegate to inspection service
    return inspect_model_folder(target)


@router.get("/models/hf-config", response_model=HfConfigResp)
async def hf_config(repo_id: str = Query("")):
    """Fetch HuggingFace model config.json and extract architecture info."""
    if not repo_id:
        raise HTTPException(status_code=400, detail="repo_id_required")
    
    # Delegate to HF inspection service
    return await fetch_hf_config(repo_id)


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
            settings = get_settings()
            if test_type == "embeddings":
                result_data = await test_embedding_model(base_url, m.served_model_name, settings.INTERNAL_VLLM_API_KEY)
            else:
                result_data = await test_chat_model(base_url, m.served_model_name, settings.INTERNAL_VLLM_API_KEY)
            
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


@router.get("/models/{model_id}/readiness", response_model=ReadinessResp)
async def model_readiness(model_id: int, _: dict = Depends(require_admin)):
    """Check whether a model is ready to serve requests."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        return ReadinessResp(status="error", detail="database_unavailable")

    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            return ReadinessResp(status="error", detail="model_not_found")
        if m.state != "running":
            return ReadinessResp(status="stopped")
        if not m.container_name:
            return ReadinessResp(status="error", detail="no_container")
        
        # Delegate to testing service
        return await check_model_readiness(m.container_name, m.served_model_name)

