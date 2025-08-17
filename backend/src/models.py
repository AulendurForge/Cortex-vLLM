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
    state: Mapped[str] = mapped_column(String(16), default="stopped")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    container_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

class ConfigKV(Base):
    __tablename__ = "config_kv"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text)