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
    # Engine metadata for reproducibility (Plane D)
    engine_image: Optional[str] = None
    engine_version: Optional[str] = None
    engine_digest: Optional[str] = None
    selected_gpus: Optional[List[int]] = None
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
    # vLLM advanced engine args (Gap #4)
    attention_backend: Optional[str] = None
    disable_log_requests: Optional[bool] = None
    disable_log_stats: Optional[bool] = None
    vllm_v1_enabled: Optional[bool] = None
    # vLLM GGUF weight format (Gap #7)
    gguf_weight_format: Optional[str] = None  # auto, gguf, ggml
    # Version-aware entrypoint (Gap #5)
    entrypoint_override: Optional[str] = None
    # Debug logging configuration (Gap #11)
    debug_logging: Optional[bool] = None
    trace_mode: Optional[bool] = None
    # Request timeout configuration (Gap #13)
    engine_request_timeout: Optional[int] = None
    max_log_len: Optional[int] = None
    # Request defaults (Plane C - Phase 1)
    request_defaults_json: Optional[str] = None
    request_timeout_sec: Optional[int] = None
    stream_timeout_sec: Optional[int] = None
    # Custom startup configuration (Plane B - Phase 2)
    engine_startup_args_json: Optional[str] = None
    engine_startup_env_json: Optional[str] = None
    # Speculative decoding for llama.cpp (Gap #6)
    draft_model_path: Optional[str] = None
    draft_n: Optional[int] = None
    draft_p_min: Optional[float] = None
    # Startup timeout configuration (Gap #2)
    startup_timeout_sec: Optional[int] = None
    # Logging configuration (Gap #3)
    verbose_logging: Optional[bool] = None
    # Startup options (Gap #6)
    check_tensors: Optional[bool] = None
    skip_warmup: Optional[bool] = None
    # Chat template options (Gap #7)
    chat_template: Optional[str] = None
    chat_template_file: Optional[str] = None
    jinja_enabled: Optional[bool] = None
    # Memory management (Gap #8)
    defrag_thold: Optional[float] = None
    # LoRA adapter support (Gap #10)
    lora_adapters_json: Optional[str] = None
    lora_init_without_apply: Optional[bool] = None
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
    # Engine metadata for reproducibility
    engine_image: Optional[str] = None
    engine_version: Optional[str] = None
    engine_digest: Optional[str] = None
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
    # vLLM advanced engine args (Gap #4)
    attention_backend: Optional[str] = None
    disable_log_requests: Optional[bool] = None
    disable_log_stats: Optional[bool] = None
    vllm_v1_enabled: Optional[bool] = None
    # vLLM GGUF weight format (Gap #7)
    gguf_weight_format: Optional[str] = None  # auto, gguf, ggml
    # Version-aware entrypoint (Gap #5)
    entrypoint_override: Optional[str] = None
    # Debug logging configuration (Gap #11)
    debug_logging: Optional[bool] = None
    trace_mode: Optional[bool] = None
    # Request timeout configuration (Gap #13)
    engine_request_timeout: Optional[int] = None
    max_log_len: Optional[int] = None
    # Repetition control parameters (stored in both old columns and request_defaults_json)
    repetition_penalty: Optional[float] = None
    frequency_penalty: Optional[float] = None
    presence_penalty: Optional[float] = None
    temperature: Optional[float] = None
    top_k: Optional[int] = None
    top_p: Optional[float] = None
    # Custom request extensions (Plane C - advanced)
    custom_request_json: Optional[str] = None
    # Request defaults (Plane C - Phase 1)
    request_defaults_json: Optional[str] = None
    request_timeout_sec: Optional[int] = None
    stream_timeout_sec: Optional[int] = None
    # Custom startup configuration (Plane B - Phase 2)
    engine_startup_args_json: Optional[str] = None
    engine_startup_env_json: Optional[str] = None
    # Speculative decoding for llama.cpp (Gap #6)
    draft_model_path: Optional[str] = None
    draft_n: Optional[int] = None
    draft_p_min: Optional[float] = None
    # Startup timeout configuration (Gap #2)
    startup_timeout_sec: Optional[int] = None
    # Logging configuration (Gap #3)
    verbose_logging: Optional[bool] = None
    # Startup options (Gap #6)
    check_tensors: Optional[bool] = None
    skip_warmup: Optional[bool] = None
    # Chat template options (Gap #7)
    chat_template: Optional[str] = None
    chat_template_file: Optional[str] = None
    jinja_enabled: Optional[bool] = None
    # Memory management (Gap #8)
    defrag_thold: Optional[float] = None
    # LoRA adapter support (Gap #10)
    lora_adapters_json: Optional[str] = None
    lora_init_without_apply: Optional[bool] = None


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
    # Engine metadata for reproducibility
    engine_image: Optional[str] = None
    engine_version: Optional[str] = None
    engine_digest: Optional[str] = None
    # llama.cpp specific fields for updates
    selected_gpus: Optional[List[int]] = None
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
    # vLLM advanced engine args (Gap #4)
    attention_backend: Optional[str] = None
    disable_log_requests: Optional[bool] = None
    disable_log_stats: Optional[bool] = None
    vllm_v1_enabled: Optional[bool] = None
    # vLLM GGUF weight format (Gap #7)
    gguf_weight_format: Optional[str] = None  # auto, gguf, ggml
    # Version-aware entrypoint (Gap #5)
    entrypoint_override: Optional[str] = None
    # Debug logging configuration (Gap #11)
    debug_logging: Optional[bool] = None
    trace_mode: Optional[bool] = None
    # Request timeout configuration (Gap #13)
    engine_request_timeout: Optional[int] = None
    max_log_len: Optional[int] = None
    # Repetition control parameters (stored in both old columns and request_defaults_json)
    repetition_penalty: Optional[float] = None
    frequency_penalty: Optional[float] = None
    presence_penalty: Optional[float] = None
    temperature: Optional[float] = None
    top_k: Optional[int] = None
    top_p: Optional[float] = None
    # Custom request extensions (Plane C - advanced)
    custom_request_json: Optional[str] = None
    # Request defaults (Plane C - Phase 1)
    request_defaults_json: Optional[str] = None
    request_timeout_sec: Optional[int] = None
    stream_timeout_sec: Optional[int] = None
    # Custom startup configuration (Plane B - Phase 2)
    engine_startup_args_json: Optional[str] = None
    engine_startup_env_json: Optional[str] = None
    # Speculative decoding for llama.cpp (Gap #6)
    draft_model_path: Optional[str] = None
    draft_n: Optional[int] = None
    draft_p_min: Optional[float] = None
    # Startup timeout configuration (Gap #2)
    startup_timeout_sec: Optional[int] = None
    # Logging configuration (Gap #3)
    verbose_logging: Optional[bool] = None
    # Startup options (Gap #6)
    check_tensors: Optional[bool] = None
    skip_warmup: Optional[bool] = None
    # Chat template options (Gap #7)
    chat_template: Optional[str] = None
    chat_template_file: Optional[str] = None
    jinja_enabled: Optional[bool] = None
    # Memory management (Gap #8)
    defrag_thold: Optional[float] = None
    # LoRA adapter support (Gap #10)
    lora_adapters_json: Optional[str] = None
    lora_init_without_apply: Optional[bool] = None


class BaseDirCfg(BaseModel):
    """Base directory configuration."""
    base_dir: str


class GGUFValidationSummary(BaseModel):
    """Summary of GGUF file validation results (Gap #5)."""
    total_files: int
    valid_files: int
    invalid_files: int
    warnings: list[str]  # List of validation warnings
    errors: list[str]    # List of validation errors


class EngineRecommendation(BaseModel):
    """Smart engine recommendation based on folder contents."""
    recommended: str  # 'vllm', 'llamacpp', or 'either'
    reason: str
    has_multipart_gguf: bool
    has_safetensors: bool
    has_gguf: bool
    vllm_gguf_compatible: bool  # True only if single-file GGUF exists
    options: list[dict]  # List of available options with explanations


class SafeTensorInfo(BaseModel):
    """Information about SafeTensor files in a model folder."""
    files: list[str]  # List of SafeTensor filenames
    total_size_gb: float  # Total size in GB
    file_count: int
    # Extracted from config.json
    architecture: str | None = None
    model_type: str | None = None
    vocab_size: int | None = None
    max_position_embeddings: int | None = None
    torch_dtype: str | None = None
    tie_word_embeddings: bool | None = None


class InspectFolderResp(BaseModel):
    """Response from folder inspection endpoint."""
    has_safetensors: bool
    safetensor_info: SafeTensorInfo | None = None  # Detailed SafeTensor info
    gguf_files: list[str]  # Legacy: flat list
    gguf_groups: list[GGUFGroup]  # New: smart grouped analysis
    tokenizer_files: list[str]
    config_files: list[str]
    warnings: list[str]
    params_b: float | None = None
    hidden_size: int | None = None
    num_hidden_layers: int | None = None
    num_attention_heads: int | None = None
    # Smart engine recommendation (Gap #2)
    engine_recommendation: EngineRecommendation | None = None
    # GGUF validation summary (Gap #5)
    gguf_validation: GGUFValidationSummary | None = None


class HfConfigResp(BaseModel):
    """Response from HuggingFace config fetch."""
    hidden_size: int | None = None
    num_hidden_layers: int | None = None
    num_attention_heads: int | None = None
    params_b: float | None = None
