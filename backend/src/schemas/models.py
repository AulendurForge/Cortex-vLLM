"""Pydantic schemas for model management endpoints."""

from pydantic import BaseModel
from typing import Optional, List, Any
from ..utils.gguf_utils import GGUFGroup


class ModelItem(BaseModel):
    """Model item returned by list endpoint."""
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
    cuda_graph_sizes: Optional[str] = None
    pipeline_parallel_size: Optional[int] = None
    device: Optional[str] = None
    tokenizer: Optional[str] = None
    hf_config_path: Optional[str] = None
    # Engine type and llama.cpp specific fields
    engine_type: str = "vllm"
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
    # Runtime state
    state: str
    archived: bool
    port: Optional[int] = None
    container_name: Optional[str] = None


class CreateModelRequest(BaseModel):
    """Request body for creating a new model."""
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
    # Engine type selection
    engine_type: str = "vllm"
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


class UpdateModelRequest(BaseModel):
    """Request body for updating an existing model."""
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
    # llama.cpp specific fields for updates
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


class BaseDirCfg(BaseModel):
    """Base directory configuration."""
    base_dir: str


class InspectFolderResp(BaseModel):
    """Response from folder inspection endpoint."""
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


class HfConfigResp(BaseModel):
    """Response from HuggingFace config fetch."""
    hidden_size: int | None = None
    num_hidden_layers: int | None = None
    num_attention_heads: int | None = None
    params_b: float | None = None
