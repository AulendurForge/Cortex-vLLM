from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_admin
from ..config import get_settings
from ..services.deployment_manager import (
    get_job_status,
    start_deployment_export,
    start_model_export,
    list_model_manifests_in_dir,
    import_model_from_manifest,
)


router = APIRouter()


class DeploymentExportRequest(BaseModel):
    output_dir: str
    include_images: bool = True
    include_db: bool = True
    include_configs: bool = True
    include_models_manifest: bool = True
    tar_models: bool = False
    tar_hf_cache: bool = False
    allow_pull_images: bool = True
    # Optional engine image overrides for export package (does not change runtime config)
    vllm_image: str | None = None
    llamacpp_image: str | None = None


class ModelExportRequest(BaseModel):
    output_dir: str
    include_engine_image: bool = True
    tar_model_files: bool = False
    tar_hf_cache: bool = False
    allow_pull_images: bool = True


class ImportModelRequest(BaseModel):
    output_dir: str
    manifest_file: str
    conflict_strategy: str = "error"  # error | rename
    served_model_name_override: str | None = None
    name_override: str | None = None
    local_path_override: str | None = None
    use_exported_engine_image: bool = True


@router.get("/deployment/options")
async def deployment_options(_: dict = Depends(require_admin)):
    s = get_settings()
    return {
        "defaults": {
            "output_dir": getattr(s, "CORTEX_EXPORT_DIR", None) or "/var/cortex/exports",
            "include_images": True,
            "include_db": True,
            "include_configs": True,
            "include_models_manifest": True,
            "tar_models": False,
            "tar_hf_cache": False,
            "allow_pull_images": True,
        },
        "paths": {
            "models_dir_host": s.CORTEX_MODELS_DIR_HOST or s.CORTEX_MODELS_DIR,
            "hf_cache_dir_host": s.HF_CACHE_DIR_HOST or s.HF_CACHE_DIR,
        },
        "images": {
            "vllm": s.VLLM_IMAGE,
            "llamacpp": s.LLAMACPP_IMAGE,
        },
        "notes": [
            "Large archives can be hundreds of GB (models + HF cache). Start with manifests only.",
            "Database dump is taken from the postgres container via pg_dump.",
            "Secrets are not exported; ConfigKV entries with token/password/secret are redacted.",
        ],
    }


@router.get("/deployment/status")
async def deployment_status(_: dict = Depends(require_admin)):
    return await get_job_status()

@router.get("/deployment/model-manifests")
async def deployment_model_manifests(output_dir: str, _: dict = Depends(require_admin)):
    if not output_dir:
        raise HTTPException(status_code=400, detail="output_dir_required")
    if not output_dir.startswith("/"):
        raise HTTPException(status_code=400, detail="output_dir_must_be_absolute")
    return {"items": list_model_manifests_in_dir(output_dir)}


@router.post("/deployment/export")
async def deployment_export(req: DeploymentExportRequest, _: dict = Depends(require_admin)):
    # Basic guardrails
    if not req.output_dir:
        raise HTTPException(status_code=400, detail="output_dir_required")
    if not req.output_dir.startswith("/"):
        raise HTTPException(status_code=400, detail="output_dir_must_be_absolute")
    # Kick off job
    return await start_deployment_export(
        output_dir=req.output_dir,
        include_images=req.include_images,
        include_db=req.include_db,
        include_configs=req.include_configs,
        include_models_manifest=req.include_models_manifest,
        tar_models=req.tar_models,
        tar_hf_cache=req.tar_hf_cache,
        allow_pull_images=req.allow_pull_images,
        vllm_image=req.vllm_image,
        llamacpp_image=req.llamacpp_image,
    )


@router.post("/deployment/export-model/{model_id}")
async def deployment_export_model(model_id: int, req: ModelExportRequest, _: dict = Depends(require_admin)):
    if not req.output_dir:
        raise HTTPException(status_code=400, detail="output_dir_required")
    if not req.output_dir.startswith("/"):
        raise HTTPException(status_code=400, detail="output_dir_must_be_absolute")
    if model_id <= 0:
        raise HTTPException(status_code=400, detail="invalid_model_id")
    return await start_model_export(
        model_id=model_id,
        output_dir=req.output_dir,
        include_engine_image=req.include_engine_image,
        tar_model_files=req.tar_model_files,
        tar_hf_cache=req.tar_hf_cache,
        allow_pull_images=req.allow_pull_images,
    )


@router.post("/deployment/import-model")
async def deployment_import_model(req: ImportModelRequest, _: dict = Depends(require_admin)):
    if not req.output_dir:
        raise HTTPException(status_code=400, detail="output_dir_required")
    if not req.output_dir.startswith("/"):
        raise HTTPException(status_code=400, detail="output_dir_must_be_absolute")
    if not req.manifest_file:
        raise HTTPException(status_code=400, detail="manifest_file_required")
    if req.conflict_strategy not in ("error", "rename"):
        raise HTTPException(status_code=400, detail="invalid_conflict_strategy")
    try:
        out = await import_model_from_manifest(
            output_dir=req.output_dir,
            manifest_file=req.manifest_file,
            conflict_strategy=req.conflict_strategy,
            served_model_name_override=req.served_model_name_override,
            name_override=req.name_override,
            local_path_override=req.local_path_override,
            use_exported_engine_image=bool(req.use_exported_engine_image),
        )
        return out
    except RuntimeError as e:
        msg = str(e)
        if msg == "served_model_name_conflict":
            raise HTTPException(status_code=409, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


