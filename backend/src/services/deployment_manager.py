"""Deployment and migration helpers (online -> offline packaging).

This module provides a safe, admin-triggerable way to generate an offline
deployment package from a running Cortex instance.

Goals:
- Export required Docker images (gateway/frontend + engines + infra)
- Export database snapshot (pg_dump from postgres container)
- Export runtime manifests/config (models, registry, settings hints)
- Optionally archive model weights and HF cache directories

Security:
- Does NOT execute arbitrary commands; only fixed operations.
- Requires admin auth at the route layer.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import tarfile
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional

import docker

from ..config import get_settings


@dataclass
class DeploymentJob:
    id: str
    status: str  # pending | running | completed | failed
    started_at: float
    finished_at: float | None = None
    step: str = ""
    progress: float = 0.0  # 0..1 best-effort
    logs: List[str] | None = None
    output_dir: str = ""
    artifacts: Dict[str, Any] | None = None
    error: str | None = None


# Single in-memory job (simple MVP). Persisted status is written to output_dir/status.json as well.
_JOB: DeploymentJob | None = None
_LOCK = asyncio.Lock()


def _now() -> float:
    return time.time()


def _ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)


def _safe_abs_dir(p: str) -> str:
    if not p:
        raise ValueError("output_dir_required")
    if not os.path.isabs(p):
        raise ValueError("output_dir_must_be_absolute")
    return os.path.abspath(p)


def _job_to_dict(job: DeploymentJob) -> Dict[str, Any]:
    d = asdict(job)
    return d


async def get_job_status() -> Dict[str, Any]:
    async with _LOCK:
        return _job_to_dict(_JOB) if _JOB else {"status": "idle"}


async def start_deployment_export(
    *,
    output_dir: str,
    include_images: bool = True,
    include_db: bool = True,
    include_configs: bool = True,
    include_models_manifest: bool = True,
    tar_models: bool = False,
    tar_hf_cache: bool = False,
    allow_pull_images: bool = True,
    vllm_image: str | None = None,
    llamacpp_image: str | None = None,
) -> Dict[str, Any]:
    """Start a background export job; returns initial job status."""
    out = _safe_abs_dir(output_dir)
    job_id = f"deploy-{int(_now())}"
    async with _LOCK:
        global _JOB
        if _JOB and _JOB.status in ("running", "pending"):
            return _job_to_dict(_JOB)
        _JOB = DeploymentJob(
            id=job_id,
            status="pending",
            started_at=_now(),
            logs=[],
            output_dir=out,
            artifacts={},
        )
        # Fire-and-forget job task
        asyncio.create_task(
            _run_export_job(
                include_images=include_images,
                include_db=include_db,
                include_configs=include_configs,
                include_models_manifest=include_models_manifest,
                tar_models=tar_models,
                tar_hf_cache=tar_hf_cache,
                allow_pull_images=allow_pull_images,
                vllm_image=vllm_image,
                llamacpp_image=llamacpp_image,
            )
        )
        return _job_to_dict(_JOB)


async def start_model_export(
    *,
    model_id: int,
    output_dir: str,
    include_engine_image: bool = True,
    tar_model_files: bool = False,
    tar_hf_cache: bool = False,
    allow_pull_images: bool = True,
) -> Dict[str, Any]:
    """Export a single model's engine image + manifest (optionally model files/HF cache).

    This is designed for the workflow:
    - Online/staging Cortex has a model configured and running
    - Admin wants to export just that model's engine image + config for transfer
    - Offline Cortex can load the image tar and recreate the model record
    """
    out = _safe_abs_dir(output_dir)
    job_id = f"deploy-model-{model_id}-{int(_now())}"
    async with _LOCK:
        global _JOB
        if _JOB and _JOB.status in ("running", "pending"):
            return _job_to_dict(_JOB)
        _JOB = DeploymentJob(
            id=job_id,
            status="pending",
            started_at=_now(),
            logs=[],
            output_dir=out,
            artifacts={},
        )
        asyncio.create_task(
            _run_model_export_job(
                model_id=model_id,
                include_engine_image=include_engine_image,
                tar_model_files=tar_model_files,
                tar_hf_cache=tar_hf_cache,
                allow_pull_images=allow_pull_images,
            )
        )
        return _job_to_dict(_JOB)


async def _run_model_export_job(
    *,
    model_id: int,
    include_engine_image: bool,
    tar_model_files: bool,
    tar_hf_cache: bool,
    allow_pull_images: bool,
) -> None:
    async with _LOCK:
        assert _JOB is not None
        _JOB.status = "running"
        _JOB.step = "initializing"
        _JOB.progress = 0.02
    try:
        settings = get_settings()
        output_dir = _JOB.output_dir  # type: ignore
        artifacts: Dict[str, Any] = {}

        _ensure_dir(output_dir)
        _ensure_dir(os.path.join(output_dir, "images"))
        _ensure_dir(os.path.join(output_dir, "db"))
        _ensure_dir(os.path.join(output_dir, "manifests"))

        def log(msg: str) -> None:
            try:
                assert _JOB is not None
                _JOB.logs = (_JOB.logs or []) + [msg]
                if len(_JOB.logs) > 300:
                    _JOB.logs = _JOB.logs[-300:]
            except Exception:
                pass
            try:
                _write_status_file()
            except Exception:
                pass

        def set_step(step: str, progress: float) -> None:
            assert _JOB is not None
            _JOB.step = step
            _JOB.progress = max(0.0, min(1.0, float(progress)))
            _write_status_file()

        def _write_status_file() -> None:
            if not _JOB:
                return
            path = os.path.join(_JOB.output_dir, "status.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(_job_to_dict(_JOB), f, indent=2)

        # Load model row
        set_step("loading_model", 0.05)
        log(f"Loading model {model_id} from DB…")
        m = await _get_model_by_id(model_id)
        if m is None:
            raise RuntimeError("model_not_found")

        # Write per-model manifest with import guidance
        set_step("writing_model_manifest", 0.10)
        model_manifest = {
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "type": "cortex_model_export",
            "model_id": int(getattr(m, "id", model_id)),
            "model": _model_row_to_dict(m),
            "paths": {
                "models_dir_host": settings.CORTEX_MODELS_DIR_HOST or settings.CORTEX_MODELS_DIR,
                "hf_cache_dir_host": settings.HF_CACHE_DIR_HOST or settings.HF_CACHE_DIR,
            },
            "notes": [
                "This export contains the engine image tar (if enabled) plus this manifest.",
                "It does NOT automatically import into another Cortex instance yet; use this manifest to recreate the model record.",
                "Model weights are typically on disk under the models directory; archive them if you need to transfer weights.",
            ],
        }
        mf_name = f"manifests/model-{model_id}.json"
        with open(os.path.join(output_dir, mf_name), "w", encoding="utf-8") as f:
            json.dump(model_manifest, f, indent=2, default=str)
        artifacts.setdefault("manifests", [])
        artifacts["manifests"] = list(set((artifacts.get("manifests") or []) + [mf_name]))

        # Export model's engine image (unique export tag to avoid conflicts on import)
        exported_image_ref = None
        if include_engine_image:
            set_step("exporting_model_image", 0.20)
            engine_type = str(getattr(m, "engine_type", "vllm") or "vllm")
            original = str(getattr(m, "engine_image", "") or "").strip()
            if not original:
                original = settings.LLAMACPP_IMAGE if engine_type == "llamacpp" else settings.VLLM_IMAGE
            exported_image_ref = await _export_single_model_engine_image(
                original_image=original,
                model_id=model_id,
                engine_type=engine_type,
                out_dir=os.path.join(output_dir, "images"),
                allow_pull=allow_pull_images,
                log=log,
            )
            model_manifest["exported_engine_image"] = {
                "original": original,
                "export_tag": exported_image_ref,
            }
            with open(os.path.join(output_dir, mf_name), "w", encoding="utf-8") as f:
                json.dump(model_manifest, f, indent=2, default=str)
            artifacts.setdefault("images", [])
            artifacts["images"] = list(set((artifacts.get("images") or []) + [f"images/{_sanitize_image_name(exported_image_ref)}.tar"]))
            set_step("exporting_model_image", 0.50)

        # Optional: archive just this model's files (not entire /var/cortex/models)
        if tar_model_files:
            set_step("archiving_model_files", 0.55)
            src = _resolve_model_files_dir(m, settings)
            tar_path = os.path.join(output_dir, f"model-{model_id}-files.tar.gz")
            log(f"Archiving model files dir: {src} -> {tar_path}")
            _tar_directory(src, tar_path, log=log)
            artifacts["model_files_archive"] = os.path.basename(tar_path)
            set_step("archiving_model_files", 0.78)

        # Optional: archive HF cache (full)
        if tar_hf_cache:
            set_step("archiving_hf_cache", 0.80)
            hf_src = settings.HF_CACHE_DIR_HOST or settings.HF_CACHE_DIR
            tar_path = os.path.join(output_dir, f"hf-cache.tar.gz")
            log(f"Archiving HF cache directory: {hf_src} -> {tar_path}")
            _tar_directory(hf_src, tar_path, log=log)
            artifacts["hf_cache_archive"] = os.path.basename(tar_path)
            set_step("archiving_hf_cache", 0.92)

        async with _LOCK:
            assert _JOB is not None
            _JOB.status = "completed"
            _JOB.finished_at = _now()
            _JOB.step = "completed"
            _JOB.progress = 1.0
            _JOB.artifacts = artifacts
        try:
            with open(os.path.join(output_dir, "status.json"), "w", encoding="utf-8") as f:
                json.dump(_job_to_dict(_JOB), f, indent=2)
        except Exception:
            pass
    except Exception as e:
        async with _LOCK:
            assert _JOB is not None
            _JOB.status = "failed"
            _JOB.finished_at = _now()
            _JOB.error = str(e)[:2000]
            _JOB.step = "failed"
        try:
            with open(os.path.join(_JOB.output_dir, "status.json"), "w", encoding="utf-8") as f:  # type: ignore
                json.dump(_job_to_dict(_JOB), f, indent=2)
        except Exception:
            pass


async def _get_model_by_id(model_id: int) -> Any | None:
    try:
        from ..main import SessionLocal  # type: ignore
        from sqlalchemy import select
        from ..models import Model  # type: ignore
        if SessionLocal is None:
            return None
        async with SessionLocal() as session:  # type: ignore
            res = await session.execute(select(Model).where(Model.id == model_id))
            return res.scalar_one_or_none()
    except Exception:
        return None


def _safe_join(base_dir: str, rel: str) -> str:
    """Join base_dir + rel and ensure the result stays within base_dir."""
    base_abs = os.path.abspath(base_dir)
    cand = os.path.abspath(os.path.join(base_abs, rel))
    if cand == base_abs or cand.startswith(base_abs + os.sep):
        return cand
    raise RuntimeError("invalid_path")


def list_model_manifests_in_dir(output_dir: str) -> list[dict]:
    """List available model-*.json manifests under <output_dir>/manifests."""
    out = _safe_abs_dir(output_dir)
    manifests_dir = _safe_join(out, "manifests")
    if not os.path.isdir(manifests_dir):
        return []
    items: list[dict] = []
    for name in sorted(os.listdir(manifests_dir)):
        if not (name.startswith("model-") and name.endswith(".json")):
            continue
        full = _safe_join(manifests_dir, name)
        try:
            with open(full, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = None
        summary = {
            "file": name,
            "path": f"manifests/{name}",
            "ok": isinstance(data, dict),
        }
        if isinstance(data, dict):
            try:
                mm = data.get("model") or {}
                summary.update(
                    {
                        "model_id": data.get("model_id"),
                        "name": mm.get("name"),
                        "served_model_name": mm.get("served_model_name"),
                        "engine_type": mm.get("engine_type"),
                        "engine_image": mm.get("engine_image"),
                        "exported_engine_image": (data.get("exported_engine_image") or {}),
                        "local_path": mm.get("local_path"),
                        "repo_id": mm.get("repo_id"),
                    }
                )
            except Exception:
                pass
        items.append(summary)
    return items


async def import_model_from_manifest(
    *,
    output_dir: str,
    manifest_file: str,
    conflict_strategy: str = "error",  # error | rename
    served_model_name_override: str | None = None,
    name_override: str | None = None,
    local_path_override: str | None = None,
    use_exported_engine_image: bool = True,
) -> dict:
    """Import a model config from a previously exported manifest.

    Creates a NEW model row (state=stopped) and returns its id + final served_model_name.
    """
    out = _safe_abs_dir(output_dir)
    if not manifest_file or "/" in manifest_file or "\\" in manifest_file:
        raise RuntimeError("invalid_manifest_file")
    if not (manifest_file.startswith("model-") and manifest_file.endswith(".json")):
        raise RuntimeError("invalid_manifest_file")
    manifests_dir = _safe_join(out, "manifests")
    mf_path = _safe_join(manifests_dir, manifest_file)
    if not os.path.isfile(mf_path):
        raise RuntimeError("manifest_not_found")
    with open(mf_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise RuntimeError("invalid_manifest")
    if str(data.get("type") or "") not in ("cortex_model_export", "cortex_model_export_v1", ""):
        # allow old manifests without explicit type
        pass
    model_cfg = data.get("model")
    if not isinstance(model_cfg, dict):
        raise RuntimeError("invalid_manifest_model")

    # Build new model kwargs
    new_vals = dict(model_cfg)
    # Ensure new row semantics
    new_vals.pop("id", None)
    new_vals["state"] = "stopped"
    new_vals["archived"] = False
    new_vals["container_name"] = None
    new_vals["port"] = None

    # Apply overrides
    if isinstance(name_override, str) and name_override.strip():
        new_vals["name"] = name_override.strip()
    if isinstance(local_path_override, str) and local_path_override.strip():
        new_vals["local_path"] = local_path_override.strip()
    if isinstance(served_model_name_override, str) and served_model_name_override.strip():
        new_vals["served_model_name"] = served_model_name_override.strip()

    # Prefer exported engine image tag if present
    try:
        exp = data.get("exported_engine_image") or {}
        if use_exported_engine_image and isinstance(exp, dict):
            tag = exp.get("export_tag")
            if isinstance(tag, str) and tag.strip():
                new_vals["engine_image"] = tag.strip()
    except Exception:
        pass

    # Normalize empty strings
    for k in list(new_vals.keys()):
        if isinstance(new_vals.get(k), str) and not new_vals.get(k).strip():
            new_vals[k] = None

    # Resolve served_model_name conflicts
    from ..main import SessionLocal  # type: ignore
    from sqlalchemy import select
    from ..models import Model  # type: ignore

    if SessionLocal is None:
        raise RuntimeError("database_unavailable")

    async with SessionLocal() as session:  # type: ignore
        served = str(new_vals.get("served_model_name") or "").strip()
        if not served:
            raise RuntimeError("served_model_name_required")

        existing = (await session.execute(select(Model).where(Model.served_model_name == served))).scalar_one_or_none()
        if existing is not None:
            if conflict_strategy == "rename":
                base = served
                # Generate a unique served name
                for n in range(1, 1000):
                    candidate = f"{base}-imported" if n == 1 else f"{base}-imported-{n}"
                    hit = (await session.execute(select(Model).where(Model.served_model_name == candidate))).scalar_one_or_none()
                    if hit is None:
                        new_vals["served_model_name"] = candidate
                        served = candidate
                        break
                else:
                    raise RuntimeError("could_not_generate_unique_served_name")
            else:
                raise RuntimeError("served_model_name_conflict")

        # Create row
        m = Model(**new_vals)
        session.add(m)
        await session.commit()
        await session.refresh(m)
        return {"id": m.id, "served_model_name": served, "note": "imported_as_new_model"}

def _resolve_model_files_dir(m: Any, settings) -> str:
    """Best-effort: resolve a directory on disk that contains the model's files.

    - Offline models: derive from local_path under CORTEX_MODELS_DIR_HOST.
    - Online models: there may be no local files; raise with guidance.
    """
    base = settings.CORTEX_MODELS_DIR_HOST or settings.CORTEX_MODELS_DIR
    local_path = str(getattr(m, "local_path", "") or "").strip()
    repo_id = str(getattr(m, "repo_id", "") or "").strip()
    if not local_path:
        raise RuntimeError("model_has_no_local_path (online models are stored in HF cache; use hf-cache archive)")
    # local_path is relative under base; may point to folder or file
    rel = local_path.replace("\\", "/").lstrip("/")
    # If looks like a file path, use its parent directory
    if rel.lower().endswith((".gguf", ".safetensors", ".bin", ".pt", ".pth")):
        rel_dir = os.path.dirname(rel)
    else:
        rel_dir = rel
    full = os.path.abspath(os.path.join(base, rel_dir))
    if not os.path.isdir(full):
        raise RuntimeError(f"model_files_dir_not_found: {full}")
    return full


async def _export_single_model_engine_image(
    *,
    original_image: str,
    model_id: int,
    engine_type: str,
    out_dir: str,
    allow_pull: bool,
    log,
) -> str:
    """Export a single image to out_dir with a unique export tag, returning the export tag ref."""
    cli = docker.from_env()
    # ensure image exists
    try:
        img = cli.images.get(original_image)
    except docker.errors.ImageNotFound:
        if not allow_pull:
            raise RuntimeError(f"Image not found locally: {original_image}")
        log(f"[model-image] pulling {original_image}…")
        cli.images.pull(original_image)
        img = cli.images.get(original_image)

    # Tag with unique, collision-resistant reference before saving.
    # This prevents overwriting tags on the destination Docker daemon.
    ts = time.strftime("%Y%m%d%H%M%S", time.gmtime())
    repo = f"cortex-export/{engine_type}-model-{model_id}"
    tag = ts
    try:
        img.tag(repository=repo, tag=tag)
    except Exception:
        # Fallback: use a repo without slash if registry constraints apply
        repo = f"cortex-export-{engine_type}-model-{model_id}"
        img.tag(repository=repo, tag=tag)

    export_ref = f"{repo}:{tag}"
    tar_name = f"{_sanitize_image_name(export_ref)}.tar"
    tar_path = os.path.join(out_dir, tar_name)
    _ensure_dir(out_dir)
    log(f"[model-image] saving {export_ref} -> {tar_path}")
    with open(tar_path, "wb") as f:
        for chunk in cli.images.get(export_ref).save(named=True):
            f.write(chunk)
    return export_ref

async def _run_export_job(
    *,
    include_images: bool,
    include_db: bool,
    include_configs: bool,
    include_models_manifest: bool,
    tar_models: bool,
    tar_hf_cache: bool,
    allow_pull_images: bool,
    vllm_image: str | None,
    llamacpp_image: str | None,
) -> None:
    async with _LOCK:
        assert _JOB is not None
        _JOB.status = "running"
        _JOB.step = "initializing"
        _JOB.progress = 0.02
    try:
        settings = get_settings()
        output_dir = _JOB.output_dir  # type: ignore
        artifacts: Dict[str, Any] = {}

        _ensure_dir(output_dir)
        _ensure_dir(os.path.join(output_dir, "images"))
        _ensure_dir(os.path.join(output_dir, "db"))
        _ensure_dir(os.path.join(output_dir, "manifests"))

        def log(msg: str) -> None:
            # Best-effort: keep last 300 lines
            try:
                assert _JOB is not None
                _JOB.logs = (_JOB.logs or []) + [msg]
                if len(_JOB.logs) > 300:
                    _JOB.logs = _JOB.logs[-300:]
            except Exception:
                pass
            # Persist status snapshot
            try:
                _write_status_file()
            except Exception:
                pass

        def set_step(step: str, progress: float) -> None:
            assert _JOB is not None
            _JOB.step = step
            _JOB.progress = max(0.0, min(1.0, float(progress)))
            _write_status_file()

        def _write_status_file() -> None:
            if not _JOB:
                return
            path = os.path.join(_JOB.output_dir, "status.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(_job_to_dict(_JOB), f, indent=2)

        # -------------------------
        # Manifests / configs
        # -------------------------
        set_step("collecting_metadata", 0.05)
        log("Collecting deployment metadata…")
        meta = {
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "settings": {
                "CORTEX_MODELS_DIR": settings.CORTEX_MODELS_DIR,
                "CORTEX_MODELS_DIR_HOST": settings.CORTEX_MODELS_DIR_HOST,
                "HF_CACHE_DIR": settings.HF_CACHE_DIR,
                "HF_CACHE_DIR_HOST": settings.HF_CACHE_DIR_HOST,
                "VLLM_IMAGE": vllm_image or settings.VLLM_IMAGE,
                "LLAMACPP_IMAGE": llamacpp_image or settings.LLAMACPP_IMAGE,
                "OFFLINE_MODE": settings.OFFLINE_MODE,
            },
        }

        if include_configs:
            try:
                # Avoid circular import at module import time
                from ..main import SessionLocal  # type: ignore
                from sqlalchemy import select
                from ..models import Model, ConfigKV  # type: ignore

                if SessionLocal is not None:
                    async with SessionLocal() as session:  # type: ignore
                        models = (await session.execute(select(Model))).scalars().all()
                        cfgs = (await session.execute(select(ConfigKV))).scalars().all()
                        # Redact obvious secrets
                        cfg_out = []
                        for row in cfgs:
                            key = str(getattr(row, "key", ""))
                            val = str(getattr(row, "value", ""))
                            if "token" in key.lower() or "password" in key.lower() or "secret" in key.lower():
                                val = "[REDACTED]"
                            cfg_out.append({"key": key, "value": val})
                        meta["db_snapshot"] = {
                            "models_count": len(models),
                            "config_keys": len(cfg_out),
                            "engine_images": sorted(
                                {str(getattr(m, "engine_image", "") or "").strip() for m in models if getattr(m, "engine_image", None)}
                            ),
                        }
                        with open(os.path.join(output_dir, "manifests", "models.json"), "w", encoding="utf-8") as f:
                            json.dump([_model_row_to_dict(m) for m in models], f, indent=2, default=str)
                        with open(os.path.join(output_dir, "manifests", "config_kv.json"), "w", encoding="utf-8") as f:
                            json.dump(cfg_out, f, indent=2)
                        artifacts["manifests"] = ["manifests/models.json", "manifests/config_kv.json"]
            except Exception as e:
                log(f"Warning: failed to export configs/manifests: {e}")

        with open(os.path.join(output_dir, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)
        artifacts.setdefault("manifests", [])
        artifacts["manifests"] = list(set((artifacts.get("manifests") or []) + ["manifest.json"]))

        # -------------------------
        # Docker images
        # -------------------------
        if include_images:
            set_step("exporting_images", 0.15)
            log("Exporting Docker images… (this can take a while)")
            imgs = await _collect_images_to_export(
                vllm_image=vllm_image or settings.VLLM_IMAGE,
                llamacpp_image=llamacpp_image or settings.LLAMACPP_IMAGE,
            )
            artifacts["images"] = []
            await _export_images(
                imgs,
                out_dir=os.path.join(output_dir, "images"),
                allow_pull=allow_pull_images,
                log=log,
            )
            artifacts["images"] = [f"images/{_sanitize_image_name(i)}.tar" for i in imgs]
            set_step("exporting_images", 0.45)

        # -------------------------
        # Database snapshot
        # -------------------------
        if include_db:
            set_step("exporting_database", 0.5)
            log("Exporting database snapshot (pg_dump)…")
            db_path = os.path.join(output_dir, "db", "cortex.sql")
            await _export_postgres_dump(db_path=db_path, log=log)
            artifacts.setdefault("db", [])
            artifacts["db"] = ["db/cortex.sql"]
            set_step("exporting_database", 0.62)

        # -------------------------
        # Models/HF cache archives
        # -------------------------
        if include_models_manifest:
            set_step("inspecting_storage", 0.66)
            log("Writing storage manifest (models + hf cache)…")
            storage = {
                "models_dir_host": settings.CORTEX_MODELS_DIR_HOST or settings.CORTEX_MODELS_DIR,
                "hf_cache_dir_host": settings.HF_CACHE_DIR_HOST or settings.HF_CACHE_DIR,
            }
            with open(os.path.join(output_dir, "manifests", "storage.json"), "w", encoding="utf-8") as f:
                json.dump(storage, f, indent=2)
            artifacts.setdefault("manifests", [])
            artifacts["manifests"] = list(set((artifacts.get("manifests") or []) + ["manifests/storage.json"]))

        if tar_models:
            set_step("archiving_models", 0.70)
            models_src = settings.CORTEX_MODELS_DIR_HOST or settings.CORTEX_MODELS_DIR
            tar_path = os.path.join(output_dir, "models.tar.gz")
            log(f"Archiving models directory: {models_src} -> {tar_path}")
            _tar_directory(models_src, tar_path, log=log)
            artifacts["models_archive"] = "models.tar.gz"
            set_step("archiving_models", 0.82)

        if tar_hf_cache:
            set_step("archiving_hf_cache", 0.84)
            hf_src = settings.HF_CACHE_DIR_HOST or settings.HF_CACHE_DIR
            tar_path = os.path.join(output_dir, "hf-cache.tar.gz")
            log(f"Archiving HF cache directory: {hf_src} -> {tar_path}")
            _tar_directory(hf_src, tar_path, log=log)
            artifacts["hf_cache_archive"] = "hf-cache.tar.gz"
            set_step("archiving_hf_cache", 0.92)

        # Done
        async with _LOCK:
            assert _JOB is not None
            _JOB.status = "completed"
            _JOB.finished_at = _now()
            _JOB.step = "completed"
            _JOB.progress = 1.0
            _JOB.artifacts = artifacts
        # final status write
        try:
            with open(os.path.join(output_dir, "status.json"), "w", encoding="utf-8") as f:
                json.dump(_job_to_dict(_JOB), f, indent=2)
        except Exception:
            pass
    except Exception as e:
        async with _LOCK:
            assert _JOB is not None
            _JOB.status = "failed"
            _JOB.finished_at = _now()
            _JOB.error = str(e)[:2000]
            _JOB.step = "failed"
        try:
            with open(os.path.join(_JOB.output_dir, "status.json"), "w", encoding="utf-8") as f:  # type: ignore
                json.dump(_job_to_dict(_JOB), f, indent=2)
        except Exception:
            pass


def _sanitize_image_name(image: str) -> str:
    # e.g. vllm/vllm-openai:v0.6.3 -> vllm_vllm-openai__v0.6.3
    return image.replace("/", "_").replace(":", "__")


def _model_row_to_dict(m: Any) -> Dict[str, Any]:
    """Return a dict of model configuration suitable for export/import.

    Notes:
    - Excludes runtime-only fields (container_name, port, state).
    - Excludes secrets (hf_token) and redacts likely-secret env values.
    """
    # Prefer SQLAlchemy table reflection when available (full config)
    out: Dict[str, Any] = {}
    try:
        cols = getattr(getattr(m, "__table__", None), "columns", None)
        if cols is not None:
            for c in cols:
                k = getattr(c, "name", None)
                if not k:
                    continue
                try:
                    out[k] = getattr(m, k)
                except Exception:
                    pass
    except Exception:
        out = {}

    # Fallback: minimal known fields
    if not out:
        for k in (
            "id",
            "name",
            "served_model_name",
            "task",
            "repo_id",
            "local_path",
            "engine_type",
            "engine_image",
            "engine_version",
            "engine_digest",
            "request_defaults_json",
        ):
            try:
                out[k] = getattr(m, k)
            except Exception:
                pass

    # Strip runtime-only fields
    for k in ("container_name", "port", "state", "archived", "created_at", "updated_at"):
        out.pop(k, None)

    # Strip secrets
    out.pop("hf_token", None)

    # Best-effort redaction inside engine_startup_env_json (if present)
    try:
        env_json = out.get("engine_startup_env_json")
        if env_json and isinstance(env_json, str):
            parsed = json.loads(env_json)
            if isinstance(parsed, list):
                for item in parsed:
                    if not isinstance(item, dict):
                        continue
                    key = str(item.get("key", "") or "")
                    if "token" in key.lower() or "password" in key.lower() or "secret" in key.lower():
                        item["value"] = "[REDACTED]"
                out["engine_startup_env_json"] = json.dumps(parsed)
    except Exception:
        pass

    # Normalize empty strings to None for key fields
    for k in ("repo_id", "local_path", "engine_image", "engine_version", "engine_digest", "tokenizer", "hf_config_path"):
        try:
            if isinstance(out.get(k), str) and not out.get(k).strip():
                out[k] = None
        except Exception:
            pass

    return out


async def _collect_images_to_export(*, vllm_image: str, llamacpp_image: str) -> List[str]:
    """Collect a conservative list of images needed for offline operation."""
    # Core engines + infra pinned in scripts
    base = [
        vllm_image,
        llamacpp_image,
        "python:3.11-slim",
        "node:18-alpine",
        "postgres:16",
        "redis:7",
        "prom/prometheus:v2.47.0",
        "prom/node-exporter:v1.6.1",
        "nvidia/dcgm-exporter:3.1.8-3.1.5-ubuntu22.04",
        "gcr.io/cadvisor/cadvisor:v0.47.0",
        "registry:2",
    ]
    # Include local app images (best-effort)
    try:
        cli = docker.from_env()
        for name in ("cortex-gateway", "cortex-frontend"):
            try:
                # If built locally, it's tagged as 'cortex-gateway' etc.
                cli.images.get(name)
                base.append(name)
            except Exception:
                pass
    except Exception:
        pass
    # Include model-specific engine images if set
    try:
        from ..main import SessionLocal  # type: ignore
        from sqlalchemy import select
        from ..models import Model  # type: ignore

        if SessionLocal is not None:
            async with SessionLocal() as session:  # type: ignore
                rows = (await session.execute(select(Model.engine_image))).all()
                for (img,) in rows:
                    if img and isinstance(img, str) and img.strip():
                        base.append(img.strip())
    except Exception:
        pass
    # unique, stable order
    seen = set()
    out: List[str] = []
    for i in base:
        if i and i not in seen:
            seen.add(i)
            out.append(i)
    return out


async def _export_images(images: List[str], *, out_dir: str, allow_pull: bool, log) -> None:
    cli = docker.from_env()
    _ensure_dir(out_dir)
    for i, image in enumerate(images):
        log(f"[images] {i+1}/{len(images)}: {image}")
        # ensure image exists
        try:
            img = cli.images.get(image)
        except docker.errors.ImageNotFound:
            if not allow_pull:
                raise RuntimeError(f"Image not found locally: {image}")
            log(f"[images] pulling {image}…")
            cli.images.pull(image)
            img = cli.images.get(image)
        # save tar
        tar_name = f"{_sanitize_image_name(image)}.tar"
        tar_path = os.path.join(out_dir, tar_name)
        log(f"[images] saving -> {tar_path}")
        with open(tar_path, "wb") as f:
            for chunk in img.save(named=True):
                f.write(chunk)


async def _export_postgres_dump(*, db_path: str, log) -> None:
    """Exec pg_dump inside the postgres container (compose)."""
    cli = docker.from_env()
    # Find postgres container (best-effort)
    candidates = []
    try:
        candidates = cli.containers.list(all=True, filters={"label": ["com.docker.compose.project=cortex"]})
    except Exception:
        candidates = cli.containers.list(all=True)
    pg = None
    for c in candidates:
        try:
            labels = c.labels or {}
            if labels.get("com.docker.compose.service") == "postgres":
                pg = c
                break
        except Exception:
            pass
    if pg is None:
        # fallback by name
        for c in candidates:
            if "postgres" in (c.name or "") and "cortex" in (c.name or ""):
                pg = c
                break
    if pg is None:
        raise RuntimeError("postgres_container_not_found")
    log(f"[db] using container: {pg.name}")
    cmd = ["pg_dump", "-U", "cortex", "-d", "cortex"]
    res = pg.exec_run(cmd, stdout=True, stderr=True, stream=True)
    # res is generator of bytes; write stdout/stderr mixed
    _ensure_dir(os.path.dirname(db_path))
    with open(db_path, "wb") as f:
        for chunk in res.output:  # type: ignore
            if chunk:
                f.write(chunk)
    log(f"[db] wrote dump: {db_path}")


def _tar_directory(src_dir: str, tar_path: str, log) -> None:
    src = os.path.abspath(src_dir)
    if not os.path.isdir(src):
        raise RuntimeError(f"directory_not_found: {src}")
    # Avoid tarring into itself
    out_abs = os.path.abspath(tar_path)
    if out_abs.startswith(src + os.sep):
        raise RuntimeError("tar_output_inside_source_dir")
    with tarfile.open(tar_path, "w:gz") as tf:
        # Use basename as top-level folder inside archive
        base_name = os.path.basename(src.rstrip(os.sep)) or "data"
        tf.add(src, arcname=base_name)
    log(f"[archive] wrote {tar_path}")


