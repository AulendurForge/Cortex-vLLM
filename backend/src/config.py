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
    # Default dev origin aligns with the Next.js app on port 3001.
    CORS_ALLOW_ORIGINS: str = "http://localhost:3001,http://10.1.10.241:3001"  # comma-separated or *
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

    def gen_urls(self) -> List[str]:
        return [u.strip() for u in self.VLLM_GEN_URLS.split(",") if u.strip()]

    def emb_urls(self) -> List[str]:
        return [u.strip() for u in self.VLLM_EMB_URLS.split(",") if u.strip()]

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