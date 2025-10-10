from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, DateTime, Text, Boolean, ForeignKey, Float
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime


class Base(DeclarativeBase):
    pass


class APIKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    org_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"), nullable=True)
    prefix: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    hash: Mapped[str] = mapped_column(String(256))
    scopes: Mapped[str] = mapped_column(String(128), default="chat,completions,embeddings")
    ip_allowlist: Mapped[str] = mapped_column(Text, default="")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"), nullable=True)
    username: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    role: Mapped[str] = mapped_column(String(32), default="User")
    status: Mapped[str] = mapped_column(String(16), default="active")
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class Usage(Base):
    __tablename__ = "usage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    key_id: Mapped[int | None] = mapped_column(ForeignKey("api_keys.id"), nullable=True)
    model_name: Mapped[str] = mapped_column(String(255))
    task: Mapped[str] = mapped_column(String(32))
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    status_code: Mapped[int] = mapped_column(Integer, default=0)
    req_id: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
 
class Model(Base):
    __tablename__ = "models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    served_model_name: Mapped[str] = mapped_column(String(255))
    repo_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    local_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    task: Mapped[str] = mapped_column(String(32), default="generate")
    dtype: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tp_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gpu_memory_utilization: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_model_len: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # New tuning fields
    kv_cache_dtype: Mapped[str | None] = mapped_column(String(32), nullable=True)
    max_num_batched_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quantization: Mapped[str | None] = mapped_column(String(64), nullable=True)
    block_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    swap_space_gb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    enforce_eager: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # Additional advanced tuning fields
    trust_remote_code: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    cpu_offload_gb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    enable_prefix_caching: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    prefix_caching_hash_algo: Mapped[str | None] = mapped_column(String(32), nullable=True)
    enable_chunked_prefill: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    max_num_seqs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cuda_graph_sizes: Mapped[str | None] = mapped_column(Text, nullable=True)  # comma-separated ints
    pipeline_parallel_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    device: Mapped[str | None] = mapped_column(String(16), nullable=True)  # 'cpu' | 'cuda'
    # GGUF support: optional tokenizer HF repo id and optional HF config path
    tokenizer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hf_config_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Optional per-model Hugging Face access token (read from env if empty)
    hf_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Engine type selection (vllm or llamacpp)
    engine_type: Mapped[str] = mapped_column(String(16), default="vllm")
    # GPU selection for both vLLM and llama.cpp
    selected_gpus: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array of GPU indices
    # llama.cpp specific configuration fields
    ngl: Mapped[int | None] = mapped_column(Integer, nullable=True)  # GPU layers
    tensor_split: Mapped[str | None] = mapped_column(String(128), nullable=True)  # GPU memory distribution
    batch_size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Logical batch size
    ubatch_size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Physical batch size
    threads: Mapped[int | None] = mapped_column(Integer, nullable=True)  # CPU threads
    context_size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Context window
    parallel_slots: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Number of parallel slots
    rope_freq_base: Mapped[float | None] = mapped_column(Float, nullable=True)  # RoPE frequency base
    rope_freq_scale: Mapped[float | None] = mapped_column(Float, nullable=True)  # RoPE frequency scale
    flash_attention: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # Flash attention
    mlock: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # Memory locking
    no_mmap: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # Disable memory mapping
    numa_policy: Mapped[str | None] = mapped_column(String(32), nullable=True)  # NUMA policy
    split_mode: Mapped[str | None] = mapped_column(String(32), nullable=True)  # Layer/row split mode
    cache_type_k: Mapped[str | None] = mapped_column(String(16), nullable=True)  # KV cache type for K
    cache_type_v: Mapped[str | None] = mapped_column(String(16), nullable=True)  # KV cache type for V
    # Repetition control parameters (common to both vLLM and llama.cpp)
    repetition_penalty: Mapped[float | None] = mapped_column(Float, nullable=True)  # Penalty for repeated tokens
    frequency_penalty: Mapped[float | None] = mapped_column(Float, nullable=True)  # Penalty for frequent tokens
    presence_penalty: Mapped[float | None] = mapped_column(Float, nullable=True)  # Penalty for present tokens
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)  # Sampling temperature
    top_k: Mapped[int | None] = mapped_column(Integer, nullable=True)  # Top-k sampling
    top_p: Mapped[float | None] = mapped_column(Float, nullable=True)  # Top-p (nucleus) sampling
    state: Mapped[str] = mapped_column(String(16), default="stopped")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    container_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Reference to the model this recipe was created from
    model_id: Mapped[int | None] = mapped_column(ForeignKey("models.id"), nullable=True)
    # Basic model info (copied for reference)
    model_name: Mapped[str] = mapped_column(String(255))
    served_model_name: Mapped[str] = mapped_column(String(255))
    task: Mapped[str] = mapped_column(String(32), default="generate")
    engine_type: Mapped[str] = mapped_column(String(16), default="vllm")
    # GPU selection for both vLLM and llama.cpp
    selected_gpus: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array of GPU indices
    # All configuration parameters (copied from Model)
    mode: Mapped[str] = mapped_column(String(16), default="offline")  # 'online' or 'offline'
    repo_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    local_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    dtype: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tp_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gpu_memory_utilization: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_model_len: Mapped[int | None] = mapped_column(Integer, nullable=True)
    kv_cache_dtype: Mapped[str | None] = mapped_column(String(32), nullable=True)
    max_num_batched_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quantization: Mapped[str | None] = mapped_column(String(64), nullable=True)
    block_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    swap_space_gb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    enforce_eager: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    trust_remote_code: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    cpu_offload_gb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    enable_prefix_caching: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    prefix_caching_hash_algo: Mapped[str | None] = mapped_column(String(32), nullable=True)
    enable_chunked_prefill: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    max_num_seqs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cuda_graph_sizes: Mapped[str | None] = mapped_column(Text, nullable=True)
    pipeline_parallel_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    device: Mapped[str | None] = mapped_column(String(16), nullable=True)
    tokenizer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hf_config_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    hf_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    # llama.cpp specific configuration fields
    ngl: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tensor_split: Mapped[str | None] = mapped_column(String(128), nullable=True)
    batch_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ubatch_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    threads: Mapped[int | None] = mapped_column(Integer, nullable=True)
    context_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parallel_slots: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rope_freq_base: Mapped[float | None] = mapped_column(Float, nullable=True)
    rope_freq_scale: Mapped[float | None] = mapped_column(Float, nullable=True)
    flash_attention: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    mlock: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    no_mmap: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    numa_policy: Mapped[str | None] = mapped_column(String(32), nullable=True)
    split_mode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    cache_type_k: Mapped[str | None] = mapped_column(String(16), nullable=True)
    cache_type_v: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Repetition control parameters
    repetition_penalty: Mapped[float | None] = mapped_column(Float, nullable=True)
    frequency_penalty: Mapped[float | None] = mapped_column(Float, nullable=True)
    presence_penalty: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    top_k: Mapped[int | None] = mapped_column(Integer, nullable=True)
    top_p: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Metadata
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class ConfigKV(Base):
    __tablename__ = "config_kv"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text)