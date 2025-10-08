from functools import lru_cache
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    VLLM_GEN_URLS: str = "http://localhost:8001"
    VLLM_EMB_URLS: str = "http://localhost:8002"
    INTERNAL_VLLM_API_KEY: str = ""
    GATEWAY_DEV_ALLOW_ALL_KEYS: bool = True
    REQUEST_MAX_BODY_BYTES: int = 1_048_576
    # Rate limiting / Redis
    RATE_LIMIT_ENABLED: bool = False
    RATE_LIMIT_RPS: int = 10
    RATE_LIMIT_BURST: int = 20
    RATE_LIMIT_WINDOW_SEC: int = 0  # 0 disables sliding window check
    RATE_LIMIT_MAX_REQUESTS: int = 0  # max requests within window when enabled
    REDIS_URL: str = "redis://redis:6379/0"
    # Concurrency caps (for streaming)
    CONCURRENCY_LIMIT_ENABLED: bool = False
    MAX_CONCURRENT_STREAMS_PER_ID: int = 5
    # Circuit breaker (simple)
    CB_ENABLED: bool = False
    CB_FAILURE_THRESHOLD: int = 5
    CB_COOLDOWN_SEC: int = 30
    # Enhanced circuit breaker for timeout scenarios
    CB_TIMEOUT_THRESHOLD: int = 3      # Timeouts before opening breaker
    CB_TIMEOUT_COOLDOWN: int = 60      # Cooldown after timeout surge
    CB_HEALTH_CHECK_INTERVAL: int = 10 # More frequent health checks
    # Upstream health checks
    HEALTH_CHECK_TTL_SEC: int = 10
    HEALTH_CHECK_PATH: str = "/health"
    HEALTH_POLL_SEC: int = 15
    # OpenTelemetry (optional)
    OTEL_ENABLED: bool = False
    OTEL_SERVICE_NAME: str = "cortex-gateway"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = ""
    # Token estimation (when engines don't return usage)
    TOKEN_ESTIMATION_ENABLED: bool = True
    # Prometheus
    PROMETHEUS_URL: str = "http://prometheus:9090"
    # CORS & security headers
    CORS_ENABLED: bool = True
    # For cookie auth to work across origins, this must NOT be "*"; set your frontend origin.
    # Docker Compose automatically sets this to detected host IP + localhost fallbacks.
    # Format: comma-separated origins, e.g., "http://192.168.1.181:3001,http://localhost:3001"
    CORS_ALLOW_ORIGINS: str = "http://localhost:3001,http://127.0.0.1:3001"  # Override via env
    SECURITY_HEADERS_ENABLED: bool = True
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://cortex:cortex@postgres:5432/cortex"
    # Admin bootstrap
    ADMIN_BOOTSTRAP_USERNAME: str = ""
    ADMIN_BOOTSTRAP_PASSWORD: str = ""
    ADMIN_BOOTSTRAP_ORG: str = ""
    # Models & vLLM
    # Container-visible paths (mounted inside gateway)
    CORTEX_MODELS_DIR: str = "/var/cortex/models"
    HF_CACHE_DIR: str = "/var/cortex/hf-cache"
    # Host paths (used when creating vLLM containers via Docker SDK)
    CORTEX_MODELS_DIR_HOST: str | None = None
    HF_CACHE_DIR_HOST: str | None = None
    VLLM_IMAGE: str = "vllm/vllm-openai:latest"
    # llama.cpp settings
    # Use official llama.cpp server with CUDA support
    # The 'server-cuda' tag includes CUDA-compiled llama-server binary
    LLAMACPP_IMAGE: str = "ghcr.io/ggml-org/llama.cpp:server-cuda"
    LLAMACPP_GEN_URLS: str = ""
    LLAMACPP_DEFAULT_NGL: int = 999
    LLAMACPP_DEFAULT_BATCH_SIZE: int = 2048  # Increased from 512 for better throughput
    LLAMACPP_DEFAULT_UBATCH_SIZE: int = 2048  # Physical batch size for prompt processing
    LLAMACPP_DEFAULT_THREADS: int = 32
    LLAMACPP_DEFAULT_CONTEXT: int = 16384  # Increased from 8192 for longer prompts
    # Server-side timeout controls for multi-user stability
    LLAMACPP_SERVER_TIMEOUT: int = 300  # 5 minutes max per request
    LLAMACPP_MAX_PARALLEL: int = 16  # Increased from 4 for better concurrency (16 slots)
    LLAMACPP_CONT_BATCHING: bool = True  # Enable continuous batching
    # KV cache optimization (50% memory reduction with q8_0)
    LLAMACPP_CACHE_TYPE_K: str = "q8_0"  # KV cache quantization for K (keys)
    LLAMACPP_CACHE_TYPE_V: str = "q8_0"  # KV cache quantization for V (values)

    def gen_urls(self) -> List[str]:
        return [u.strip() for u in self.VLLM_GEN_URLS.split(",") if u.strip()]

    def emb_urls(self) -> List[str]:
        return [u.strip() for u in self.VLLM_EMB_URLS.split(",") if u.strip()]

    def llamacpp_gen_urls(self) -> List[str]:
        return [u.strip() for u in self.LLAMACPP_GEN_URLS.split(",") if u.strip()]

    def all_gen_urls(self) -> List[str]:
        """Combined vLLM and llama.cpp generation URLs."""
        return self.gen_urls() + self.llamacpp_gen_urls()

    class Config:
        env_file = ".env"
        case_sensitive = True

@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # Fallback host paths to container paths if not provided
    if not s.CORTEX_MODELS_DIR_HOST:
        s.CORTEX_MODELS_DIR_HOST = s.CORTEX_MODELS_DIR
    if not s.HF_CACHE_DIR_HOST:
        s.HF_CACHE_DIR_HOST = s.HF_CACHE_DIR
    return s