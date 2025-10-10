from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class RecipeItem(BaseModel):
    """Recipe item returned by list endpoint."""
    id: int
    name: str
    description: Optional[str] = None
    model_id: Optional[int] = None
    model_name: str
    served_model_name: str
    task: str
    engine_type: str
    created_at: datetime


class CreateRecipeRequest(BaseModel):
    """Request body for creating a new recipe."""
    name: str
    description: Optional[str] = None
    model_id: Optional[int] = None
    # Basic model info
    model_name: str
    served_model_name: str
    task: str = "generate"
    engine_type: str = "vllm"
    # All configuration parameters
    mode: str = "offline"  # 'online' or 'offline'
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
    cuda_graph_sizes: Optional[str] = None
    pipeline_parallel_size: Optional[int] = None
    device: Optional[str] = None
    tokenizer: Optional[str] = None
    hf_config_path: Optional[str] = None
    hf_token: Optional[str] = None
    # GPU selection for both vLLM and llama.cpp
    selected_gpus: Optional[List[int]] = None
    # llama.cpp specific configuration
    ngl: Optional[int] = None
    tensor_split: Optional[str] = None
    batch_size: Optional[int] = None
    ubatch_size: Optional[int] = None
    threads: Optional[int] = None
    context_size: Optional[int] = None
    parallel_slots: Optional[int] = None
    rope_freq_base: Optional[float] = None
    rope_freq_scale: Optional[float] = None
    flash_attention: Optional[bool] = None
    mlock: Optional[bool] = None
    no_mmap: Optional[bool] = None
    numa_policy: Optional[str] = None
    split_mode: Optional[str] = None
    cache_type_k: Optional[str] = None
    cache_type_v: Optional[str] = None
    # Repetition control parameters
    repetition_penalty: Optional[float] = None
    frequency_penalty: Optional[float] = None
    presence_penalty: Optional[float] = None
    temperature: Optional[float] = None
    top_k: Optional[int] = None
    top_p: Optional[float] = None


class UpdateRecipeRequest(BaseModel):
    """Request body for updating an existing recipe."""
    name: Optional[str] = None
    description: Optional[str] = None


class RecipeDetail(BaseModel):
    """Full recipe details including all configuration parameters."""
    id: int
    name: str
    description: Optional[str] = None
    model_id: Optional[int] = None
    # Basic model info
    model_name: str
    served_model_name: str
    task: str
    engine_type: str
    # All configuration parameters
    mode: str
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
    cuda_graph_sizes: Optional[str] = None
    pipeline_parallel_size: Optional[int] = None
    device: Optional[str] = None
    tokenizer: Optional[str] = None
    hf_config_path: Optional[str] = None
    hf_token: Optional[str] = None
    # GPU selection for both vLLM and llama.cpp
    selected_gpus: Optional[List[int]] = None
    # llama.cpp specific configuration
    ngl: Optional[int] = None
    tensor_split: Optional[str] = None
    batch_size: Optional[int] = None
    ubatch_size: Optional[int] = None
    threads: Optional[int] = None
    context_size: Optional[int] = None
    parallel_slots: Optional[int] = None
    rope_freq_base: Optional[float] = None
    rope_freq_scale: Optional[float] = None
    flash_attention: Optional[bool] = None
    mlock: Optional[bool] = None
    no_mmap: Optional[bool] = None
    numa_policy: Optional[str] = None
    split_mode: Optional[str] = None
    cache_type_k: Optional[str] = None
    cache_type_v: Optional[str] = None
    # Repetition control parameters
    repetition_penalty: Optional[float] = None
    frequency_penalty: Optional[float] = None
    presence_penalty: Optional[float] = None
    temperature: Optional[float] = None
    top_k: Optional[int] = None
    top_p: Optional[float] = None
    # Metadata
    created_at: datetime
    updated_at: datetime
