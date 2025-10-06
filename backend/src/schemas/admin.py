"""Pydantic schemas for admin endpoints."""

from pydantic import BaseModel
from typing import Optional


class SystemSummary(BaseModel):
    """System resource summary."""
    cpu_count: int | None = None
    load_avg_1m: float | None = None
    mem_total_mb: float | None = None
    mem_used_mb: float | None = None
    disk_total_gb: float | None = None
    disk_used_gb: float | None = None
    gpus: int | None = None
    cuda_driver: str | None = None


class ThroughputSummary(BaseModel):
    """Gateway throughput and latency metrics."""
    req_per_sec: float
    prompt_tokens_per_sec: float
    generation_tokens_per_sec: float
    latency_p50_ms: float
    latency_p95_ms: float
    ttft_p50_ms: float
    ttft_p95_ms: float


class GpuMetrics(BaseModel):
    """Per-GPU metrics."""
    index: int
    name: str | None = None
    utilization_pct: float | None = None
    mem_used_mb: float | None = None
    mem_total_mb: float | None = None
    temperature_c: float | None = None


class BootstrapRequest(BaseModel):
    """Request to bootstrap initial admin user."""
    username: str
    password: str
    org_name: str = ""


class RegistryEntry(BaseModel):
    """Model registry entry."""
    served_name: str
    url: str
    task: str


class UsageItem(BaseModel):
    """Individual usage record."""
    id: int
    key_id: int | None
    model_name: str
    task: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    latency_ms: int
    status_code: int
    req_id: str
    created_at: float


class UsageAggItem(BaseModel):
    """Aggregated usage by model."""
    model_name: str
    requests: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class UsageSeriesItem(BaseModel):
    """Time-series usage data point."""
    ts: float
    requests: int
    total_tokens: int


class LatencySummary(BaseModel):
    """Latency percentile summary."""
    p50_ms: float
    p95_ms: float
    avg_ms: float


class TtftSummary(BaseModel):
    """Time-to-first-token summary."""
    p50_s: float
    p95_s: float


class HealthRefreshRequest(BaseModel):
    """Request to refresh upstream health checks."""
    urls: list[str] | None = None


class HostSummary(BaseModel):
    """Host system metrics summary."""
    cpu_util_pct: float
    load_avg_1m: float | None = None
    mem_total_mb: float
    mem_used_mb: float
    disk_total_gb: float | None = None
    disk_used_gb: float | None = None
    disk_used_pct: float | None = None
    net_rx_bps: float
    net_tx_bps: float


class TimePoint(BaseModel):
    """Time-series data point."""
    ts: float
    value: float


class HostTrends(BaseModel):
    """Host system metrics trends over time."""
    cpu_util_pct: list[TimePoint]
    mem_used_mb: list[TimePoint]
    disk_used_pct: list[TimePoint]
    net_rx_bps: list[TimePoint]
    net_tx_bps: list[TimePoint]
    # Expanded breakdowns
    cpu_per_core_pct: dict[str, list[TimePoint]] | None = None
    disk_rw_bps: dict[str, dict[str, list[TimePoint]]] | None = None  # {device: {read: [], write: []}}
    net_per_iface_bps: dict[str, dict[str, list[TimePoint]]] | None = None  # {iface: {rx: [], tx: []}}


class PromTargets(BaseModel):
    """Prometheus targets health status."""
    up: bool
    nodeExporter: str | None = None
    dcgmExporter: str | None = None
    cadvisor: str | None = None


class Capabilities(BaseModel):
    """System capabilities and monitoring status."""
    os: str
    isContainer: bool
    isWSL: bool
    prometheus: PromTargets
    gpu: dict
    selectedProviders: dict
    suggestions: list[str]

