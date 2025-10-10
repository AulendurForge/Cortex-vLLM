from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
import json
import logging

logger = logging.getLogger(__name__)

from ..auth import require_admin
from ..schemas.recipes import (
    RecipeItem, 
    CreateRecipeRequest, 
    UpdateRecipeRequest, 
    RecipeDetail
)
from ..models import Recipe, Model
def _get_session():
    try:
        from ..main import SessionLocal  # type: ignore
        return SessionLocal
    except Exception:
        return None


router = APIRouter()


@router.get("/recipes", response_model=List[RecipeItem])
async def list_recipes(
    q: Optional[str] = None,
    engine_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    _: dict = Depends(require_admin)
):
    """List all recipes with optional filtering."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    
    async with SessionLocal() as session:
        query = select(Recipe)
        
        if q:
            query = query.where(
                Recipe.name.ilike(f"%{q}%") | 
                Recipe.description.ilike(f"%{q}%") |
                Recipe.model_name.ilike(f"%{q}%")
            )
        
        if engine_type:
            query = query.where(Recipe.engine_type == engine_type)
        
        query = query.order_by(Recipe.created_at.desc()).offset(offset).limit(limit)
        
        result = await session.execute(query)
        recipes = result.scalars().all()
        
        return [
            RecipeItem(
                id=r.id,
                name=r.name,
                description=r.description,
                model_id=r.model_id,
                model_name=r.model_name,
                served_model_name=r.served_model_name,
                task=r.task,
                engine_type=r.engine_type,
                created_at=r.created_at
            )
            for r in recipes
        ]


@router.post("/recipes", response_model=RecipeDetail)
async def create_recipe(
    body: CreateRecipeRequest,
    _: dict = Depends(require_admin)
):
    """Create a new recipe."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    
    async with SessionLocal() as session:
        # Check if recipe name already exists
        existing = await session.execute(
            select(Recipe).where(Recipe.name == body.name)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Recipe name already exists")
        
        # Create recipe with all parameters
        recipe = Recipe(
        name=body.name,
        description=body.description,
        model_id=body.model_id,
        model_name=body.model_name,
        served_model_name=body.served_model_name,
        task=body.task,
        engine_type=body.engine_type,
        mode=body.mode,
        repo_id=body.repo_id,
        local_path=body.local_path,
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
        repetition_penalty=body.repetition_penalty,
        frequency_penalty=body.frequency_penalty,
        presence_penalty=body.presence_penalty,
        temperature=body.temperature,
        top_k=body.top_k,
        top_p=body.top_p,
    )
    
    session.add(recipe)
    await session.commit()
    await session.refresh(recipe)
    
    return RecipeDetail(
        id=recipe.id,
        name=recipe.name,
        description=recipe.description,
        model_id=recipe.model_id,
        model_name=recipe.model_name,
        served_model_name=recipe.served_model_name,
        task=recipe.task,
        engine_type=recipe.engine_type,
        mode=recipe.mode,
        repo_id=recipe.repo_id,
        local_path=recipe.local_path,
        dtype=recipe.dtype,
        tp_size=recipe.tp_size,
        gpu_memory_utilization=recipe.gpu_memory_utilization,
        max_model_len=recipe.max_model_len,
        kv_cache_dtype=recipe.kv_cache_dtype,
        max_num_batched_tokens=recipe.max_num_batched_tokens,
        quantization=recipe.quantization,
        block_size=recipe.block_size,
        swap_space_gb=recipe.swap_space_gb,
        enforce_eager=recipe.enforce_eager,
        trust_remote_code=recipe.trust_remote_code,
        cpu_offload_gb=recipe.cpu_offload_gb,
        enable_prefix_caching=recipe.enable_prefix_caching,
        prefix_caching_hash_algo=recipe.prefix_caching_hash_algo,
        enable_chunked_prefill=recipe.enable_chunked_prefill,
        max_num_seqs=recipe.max_num_seqs,
        cuda_graph_sizes=recipe.cuda_graph_sizes,
        pipeline_parallel_size=recipe.pipeline_parallel_size,
        device=recipe.device,
        tokenizer=recipe.tokenizer,
        hf_config_path=recipe.hf_config_path,
        hf_token=recipe.hf_token,
        selected_gpus=json.loads(recipe.selected_gpus) if recipe.selected_gpus else None,
        ngl=recipe.ngl,
        tensor_split=recipe.tensor_split,
        batch_size=recipe.batch_size,
        ubatch_size=recipe.ubatch_size,
        threads=recipe.threads,
        context_size=recipe.context_size,
        parallel_slots=recipe.parallel_slots,
        rope_freq_base=recipe.rope_freq_base,
        rope_freq_scale=recipe.rope_freq_scale,
        flash_attention=recipe.flash_attention,
        mlock=recipe.mlock,
        no_mmap=recipe.no_mmap,
        numa_policy=recipe.numa_policy,
        split_mode=recipe.split_mode,
        cache_type_k=recipe.cache_type_k,
        cache_type_v=recipe.cache_type_v,
        repetition_penalty=recipe.repetition_penalty,
        frequency_penalty=recipe.frequency_penalty,
        presence_penalty=recipe.presence_penalty,
        temperature=recipe.temperature,
        top_k=recipe.top_k,
        top_p=recipe.top_p,
        created_at=recipe.created_at,
        updated_at=recipe.updated_at
    )


@router.get("/recipes/{recipe_id}", response_model=RecipeDetail)
async def get_recipe(
    recipe_id: int,
    _: dict = Depends(require_admin)
):
    """Get a specific recipe by ID."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    
    async with SessionLocal() as session:
        result = await session.execute(
            select(Recipe).where(Recipe.id == recipe_id)
        )
        recipe = result.scalar_one_or_none()
        
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        
        return RecipeDetail(
            id=recipe.id,
            name=recipe.name,
            description=recipe.description,
            model_id=recipe.model_id,
            model_name=recipe.model_name,
            served_model_name=recipe.served_model_name,
            task=recipe.task,
            engine_type=recipe.engine_type,
            mode=recipe.mode,
            repo_id=recipe.repo_id,
            local_path=recipe.local_path,
            dtype=recipe.dtype,
            tp_size=recipe.tp_size,
            gpu_memory_utilization=recipe.gpu_memory_utilization,
            max_model_len=recipe.max_model_len,
            kv_cache_dtype=recipe.kv_cache_dtype,
            max_num_batched_tokens=recipe.max_num_batched_tokens,
            quantization=recipe.quantization,
            block_size=recipe.block_size,
            swap_space_gb=recipe.swap_space_gb,
            enforce_eager=recipe.enforce_eager,
            trust_remote_code=recipe.trust_remote_code,
            cpu_offload_gb=recipe.cpu_offload_gb,
            enable_prefix_caching=recipe.enable_prefix_caching,
            prefix_caching_hash_algo=recipe.prefix_caching_hash_algo,
            enable_chunked_prefill=recipe.enable_chunked_prefill,
            max_num_seqs=recipe.max_num_seqs,
            cuda_graph_sizes=recipe.cuda_graph_sizes,
            pipeline_parallel_size=recipe.pipeline_parallel_size,
            device=recipe.device,
            tokenizer=recipe.tokenizer,
            hf_config_path=recipe.hf_config_path,
            hf_token=recipe.hf_token,
            selected_gpus=json.loads(recipe.selected_gpus) if recipe.selected_gpus else None,
            ngl=recipe.ngl,
            tensor_split=recipe.tensor_split,
            batch_size=recipe.batch_size,
            ubatch_size=recipe.ubatch_size,
            threads=recipe.threads,
            context_size=recipe.context_size,
            parallel_slots=recipe.parallel_slots,
            rope_freq_base=recipe.rope_freq_base,
            rope_freq_scale=recipe.rope_freq_scale,
            flash_attention=recipe.flash_attention,
            mlock=recipe.mlock,
            no_mmap=recipe.no_mmap,
            numa_policy=recipe.numa_policy,
            split_mode=recipe.split_mode,
            cache_type_k=recipe.cache_type_k,
            cache_type_v=recipe.cache_type_v,
            repetition_penalty=recipe.repetition_penalty,
            frequency_penalty=recipe.frequency_penalty,
            presence_penalty=recipe.presence_penalty,
            temperature=recipe.temperature,
            top_k=recipe.top_k,
            top_p=recipe.top_p,
            created_at=recipe.created_at,
            updated_at=recipe.updated_at
        )


@router.patch("/recipes/{recipe_id}", response_model=RecipeDetail)
async def update_recipe(
    recipe_id: int,
    body: UpdateRecipeRequest,
    _: dict = Depends(require_admin)
):
    """Update a recipe's name and description."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    
    async with SessionLocal() as session:
        result = await session.execute(
            select(Recipe).where(Recipe.id == recipe_id)
        )
        recipe = result.scalar_one_or_none()
        
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        
        # Check if new name conflicts with existing recipe
        if body.name and body.name != recipe.name:
            existing = await session.execute(
                select(Recipe).where(Recipe.name == body.name)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Recipe name already exists")
        
        # Update fields
        if body.name is not None:
            recipe.name = body.name
        if body.description is not None:
            recipe.description = body.description
        
        recipe.updated_at = datetime.utcnow()
        
        await session.commit()
        await session.refresh(recipe)
        
        return RecipeDetail(
            id=recipe.id,
            name=recipe.name,
            description=recipe.description,
            model_id=recipe.model_id,
            model_name=recipe.model_name,
            served_model_name=recipe.served_model_name,
            task=recipe.task,
            engine_type=recipe.engine_type,
            mode=recipe.mode,
            repo_id=recipe.repo_id,
            local_path=recipe.local_path,
            dtype=recipe.dtype,
            tp_size=recipe.tp_size,
            gpu_memory_utilization=recipe.gpu_memory_utilization,
            max_model_len=recipe.max_model_len,
            kv_cache_dtype=recipe.kv_cache_dtype,
            max_num_batched_tokens=recipe.max_num_batched_tokens,
            quantization=recipe.quantization,
            block_size=recipe.block_size,
            swap_space_gb=recipe.swap_space_gb,
            enforce_eager=recipe.enforce_eager,
            trust_remote_code=recipe.trust_remote_code,
            cpu_offload_gb=recipe.cpu_offload_gb,
            enable_prefix_caching=recipe.enable_prefix_caching,
            prefix_caching_hash_algo=recipe.prefix_caching_hash_algo,
            enable_chunked_prefill=recipe.enable_chunked_prefill,
            max_num_seqs=recipe.max_num_seqs,
            cuda_graph_sizes=recipe.cuda_graph_sizes,
            pipeline_parallel_size=recipe.pipeline_parallel_size,
            device=recipe.device,
            tokenizer=recipe.tokenizer,
            hf_config_path=recipe.hf_config_path,
            hf_token=recipe.hf_token,
            selected_gpus=json.loads(recipe.selected_gpus) if recipe.selected_gpus else None,
            ngl=recipe.ngl,
            tensor_split=recipe.tensor_split,
            batch_size=recipe.batch_size,
            ubatch_size=recipe.ubatch_size,
            threads=recipe.threads,
            context_size=recipe.context_size,
            parallel_slots=recipe.parallel_slots,
            rope_freq_base=recipe.rope_freq_base,
            rope_freq_scale=recipe.rope_freq_scale,
            flash_attention=recipe.flash_attention,
            mlock=recipe.mlock,
            no_mmap=recipe.no_mmap,
            numa_policy=recipe.numa_policy,
            split_mode=recipe.split_mode,
            cache_type_k=recipe.cache_type_k,
            cache_type_v=recipe.cache_type_v,
            repetition_penalty=recipe.repetition_penalty,
            frequency_penalty=recipe.frequency_penalty,
            presence_penalty=recipe.presence_penalty,
            temperature=recipe.temperature,
            top_k=recipe.top_k,
            top_p=recipe.top_p,
            created_at=recipe.created_at,
            updated_at=recipe.updated_at
        )


@router.delete("/recipes/{recipe_id}")
async def delete_recipe(
    recipe_id: int,
    _: dict = Depends(require_admin)
):
    """Delete a recipe."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    
    async with SessionLocal() as session:
        result = await session.execute(
            select(Recipe).where(Recipe.id == recipe_id)
        )
        recipe = result.scalar_one_or_none()
        
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        
        await session.delete(recipe)
        await session.commit()
        
        return {"message": "Recipe deleted successfully"}


@router.post("/recipes/from-model/{model_id}", response_model=RecipeDetail)
async def create_recipe_from_model(
    model_id: int,
    request_data: dict,
    _: dict = Depends(require_admin)
):
    """Create a recipe from an existing model configuration."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    
    async with SessionLocal() as session:
        # Extract name and description from request body
        name = request_data.get("name")
        description = request_data.get("description")
        
        if not name:
            raise HTTPException(status_code=400, detail="Recipe name is required")
        
        # Get the model
        result = await session.execute(
            select(Model).where(Model.id == model_id)
        )
        model = result.scalar_one_or_none()
        
        if not model:
            raise HTTPException(status_code=404, detail="Model not found")
        
        # Check if recipe name already exists
        existing = await session.execute(
            select(Recipe).where(Recipe.name == name)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Recipe name already exists")
        
        # Determine mode
        mode = "online" if model.repo_id else "offline"
        
        # Create recipe with all model parameters
        recipe = Recipe(
            name=name,
            description=description,
            model_id=model.id,
            model_name=model.name,
            served_model_name=model.served_model_name,
            task=model.task,
            engine_type=model.engine_type,
            mode=mode,
            repo_id=model.repo_id,
            local_path=model.local_path,
            dtype=model.dtype,
            tp_size=model.tp_size,
            gpu_memory_utilization=model.gpu_memory_utilization,
            max_model_len=model.max_model_len,
            kv_cache_dtype=model.kv_cache_dtype,
            max_num_batched_tokens=model.max_num_batched_tokens,
            quantization=model.quantization,
            block_size=model.block_size,
            swap_space_gb=model.swap_space_gb,
            enforce_eager=model.enforce_eager,
            trust_remote_code=model.trust_remote_code,
            cpu_offload_gb=model.cpu_offload_gb,
            enable_prefix_caching=model.enable_prefix_caching,
            prefix_caching_hash_algo=model.prefix_caching_hash_algo,
            enable_chunked_prefill=model.enable_chunked_prefill,
            max_num_seqs=model.max_num_seqs,
            cuda_graph_sizes=model.cuda_graph_sizes,
            pipeline_parallel_size=model.pipeline_parallel_size,
            device=model.device,
            tokenizer=model.tokenizer,
            hf_config_path=model.hf_config_path,
            hf_token=model.hf_token,
            selected_gpus=model.selected_gpus,
            ngl=model.ngl,
            tensor_split=model.tensor_split,
            batch_size=model.batch_size,
            ubatch_size=model.ubatch_size,
            threads=model.threads,
            context_size=model.context_size,
            parallel_slots=model.parallel_slots,
            rope_freq_base=model.rope_freq_base,
            rope_freq_scale=model.rope_freq_scale,
            flash_attention=model.flash_attention,
            mlock=model.mlock,
            no_mmap=model.no_mmap,
            numa_policy=model.numa_policy,
            split_mode=model.split_mode,
            cache_type_k=model.cache_type_k,
            cache_type_v=model.cache_type_v,
            repetition_penalty=model.repetition_penalty,
            frequency_penalty=model.frequency_penalty,
            presence_penalty=model.presence_penalty,
            temperature=model.temperature,
            top_k=model.top_k,
            top_p=model.top_p,
        )
        
        session.add(recipe)
        await session.commit()
        await session.refresh(recipe)
        
        return RecipeDetail(
            id=recipe.id,
            name=recipe.name,
            description=recipe.description,
            model_id=recipe.model_id,
            model_name=recipe.model_name,
            served_model_name=recipe.served_model_name,
            task=recipe.task,
            engine_type=recipe.engine_type,
            mode=recipe.mode,
            repo_id=recipe.repo_id,
            local_path=recipe.local_path,
            dtype=recipe.dtype,
            tp_size=recipe.tp_size,
            gpu_memory_utilization=recipe.gpu_memory_utilization,
            max_model_len=recipe.max_model_len,
            kv_cache_dtype=recipe.kv_cache_dtype,
            max_num_batched_tokens=recipe.max_num_batched_tokens,
            quantization=recipe.quantization,
            block_size=recipe.block_size,
            swap_space_gb=recipe.swap_space_gb,
            enforce_eager=recipe.enforce_eager,
            trust_remote_code=recipe.trust_remote_code,
            cpu_offload_gb=recipe.cpu_offload_gb,
            enable_prefix_caching=recipe.enable_prefix_caching,
            prefix_caching_hash_algo=recipe.prefix_caching_hash_algo,
            enable_chunked_prefill=recipe.enable_chunked_prefill,
            max_num_seqs=recipe.max_num_seqs,
            cuda_graph_sizes=recipe.cuda_graph_sizes,
            pipeline_parallel_size=recipe.pipeline_parallel_size,
            device=recipe.device,
            tokenizer=recipe.tokenizer,
            hf_config_path=recipe.hf_config_path,
            hf_token=recipe.hf_token,
            selected_gpus=json.loads(recipe.selected_gpus) if recipe.selected_gpus else None,
            ngl=recipe.ngl,
            tensor_split=recipe.tensor_split,
            batch_size=recipe.batch_size,
            ubatch_size=recipe.ubatch_size,
            threads=recipe.threads,
            context_size=recipe.context_size,
            parallel_slots=recipe.parallel_slots,
            rope_freq_base=recipe.rope_freq_base,
            rope_freq_scale=recipe.rope_freq_scale,
            flash_attention=recipe.flash_attention,
            mlock=recipe.mlock,
            no_mmap=recipe.no_mmap,
            numa_policy=recipe.numa_policy,
            split_mode=recipe.split_mode,
            cache_type_k=recipe.cache_type_k,
            cache_type_v=recipe.cache_type_v,
            repetition_penalty=recipe.repetition_penalty,
            frequency_penalty=recipe.frequency_penalty,
            presence_penalty=recipe.presence_penalty,
            temperature=recipe.temperature,
            top_k=recipe.top_k,
            top_p=recipe.top_p,
            created_at=recipe.created_at,
            updated_at=recipe.updated_at
        )
