from __future__ import annotations

import docker
import os
from docker.models.containers import Container
from docker.types import DeviceRequest
from typing import Optional, Tuple
from .config import get_settings
from .models import Model


def _client() -> docker.DockerClient:
    return docker.from_env()


def _ensure_image(image: str) -> None:
    cli = _client()
    try:
        cli.images.get(image)
    except docker.errors.ImageNotFound:
        cli.images.pull(image)


def _build_command(m: Model) -> list[str]:
    """Build args for the vllm/vllm-openai image (api_server.py flags).
    Note: This image expects only flags, not a `vllm serve` prefix.
    """
    model_arg = m.repo_id if (m.repo_id and not m.local_path) else (f"/models/{m.local_path}" if m.local_path else (m.repo_id or ""))
    if not model_arg:
        raise ValueError("model path or repo_id required")
    cmd: list[str] = [
        "--model", model_arg,
        "--host", "0.0.0.0",
        "--port", "8000",
    ]
    # GGUF handling: if using a local .gguf file or repo_id that endswith .gguf, pass tokenizer and optional hf-config-path
    try:
        is_gguf = str(model_arg).lower().endswith('.gguf')
    except Exception:
        is_gguf = False
    if is_gguf:
        try:
            # Only pass --tokenizer if provided; otherwise rely on --hf-config-path to locate local tokenizer files
            tok = getattr(m, 'tokenizer', None)
            hf_cfg = getattr(m, 'hf_config_path', None)
            if tok:
                cmd += ["--tokenizer", str(m.tokenizer)]
            elif hf_cfg:
                # vLLM can accept a local directory path as tokenizer id; ensure it's a string
                cmd += ["--tokenizer", str(hf_cfg)]
        except Exception:
            pass
        try:
            if getattr(m, 'hf_config_path', None):
                cmd += ["--hf-config-path", str(m.hf_config_path)]
        except Exception:
            pass
    # Served name allows routing stability via our registry
    if getattr(m, "served_model_name", None):
        cmd += ["--served-model-name", str(m.served_model_name)]
    if m.task and m.task.lower().startswith("embed"):
        cmd += ["--task", "embed"]
    if m.dtype:
        cmd += ["--dtype", m.dtype]
    if m.tp_size and m.tp_size > 1:
        cmd += ["--tensor-parallel-size", str(m.tp_size)]
    # Optional distributed/pipeline parallel
    try:
        if getattr(m, "pipeline_parallel_size", None):
            cmd += ["--pipeline-parallel-size", str(int(m.pipeline_parallel_size))]
    except Exception:
        pass
    if m.gpu_memory_utilization:
        cmd += ["--gpu-memory-utilization", str(m.gpu_memory_utilization)]
    if m.max_model_len:
        cmd += ["--max-model-len", str(m.max_model_len)]
    # Optional tuning flags
    try:
        if getattr(m, "max_num_batched_tokens", None):
            cmd += ["--max-num-batched-tokens", str(int(m.max_num_batched_tokens))]
    except Exception:
        pass
    try:
        if getattr(m, "kv_cache_dtype", None):
            cmd += ["--kv-cache-dtype", str(m.kv_cache_dtype)]
    except Exception:
        pass
    try:
        if getattr(m, "quantization", None):
            cmd += ["--quantization", str(m.quantization)]
    except Exception:
        pass
    try:
        if getattr(m, "block_size", None):
            cmd += ["--block-size", str(int(m.block_size))]
    except Exception:
        pass
    try:
        if getattr(m, "swap_space_gb", None):
            cmd += ["--swap-space", str(int(m.swap_space_gb))]
    except Exception:
        pass
    try:
        if getattr(m, "enforce_eager", None):
            if bool(m.enforce_eager):
                cmd += ["--enforce-eager"]
    except Exception:
        pass
    # Advanced: trust remote code
    try:
        if getattr(m, "trust_remote_code", None):
            if bool(m.trust_remote_code):
                cmd += ["--trust-remote-code"]
    except Exception:
        pass
    # Advanced cache/offload/prefix/chunked/scheduler
    try:
        if getattr(m, "cpu_offload_gb", None):
            val = int(m.cpu_offload_gb) if m.cpu_offload_gb is not None else 0
            if val > 0:
                cmd += ["--cpu-offload-gb", str(val)]
    except Exception:
        pass
    try:
        if getattr(m, "enable_prefix_caching", None) is not None:
            if bool(m.enable_prefix_caching):
                cmd += ["--enable-prefix-caching"]
            else:
                cmd += ["--no-enable-prefix-caching"]
    except Exception:
        pass
    try:
        algo = getattr(m, "prefix_caching_hash_algo", None)
        if algo:
            cmd += ["--prefix-caching-hash-algo", str(algo)]
    except Exception:
        pass
    try:
        if getattr(m, "enable_chunked_prefill", None):
            if bool(m.enable_chunked_prefill):
                cmd += ["--enable-chunked-prefill"]
    except Exception:
        pass
    try:
        if getattr(m, "max_num_seqs", None):
            cmd += ["--max-num-seqs", str(int(m.max_num_seqs))]
    except Exception:
        pass
    try:
        sizes = getattr(m, "cuda_graph_sizes", None)
        if sizes:
            parts = [p.strip() for p in str(sizes).split(",") if p.strip()]
            if parts:
                cmd += ["--cuda-graph-sizes", *parts]
    except Exception:
        pass
    # Use internal API key so gateway can authenticate to this upstream
    try:
        from .config import get_settings as _gs  # local import to avoid cycles
        key = _gs().INTERNAL_VLLM_API_KEY
        if key:
            cmd += ["--api-key", str(key)]
    except Exception:
        pass
    # If we mounted an HF cache dir in online mode, hint the download dir
    try:
        from .config import get_settings as _gs2
        if _gs2().HF_CACHE_DIR:
            cmd += ["--download-dir", "/root/.cache/huggingface"]
    except Exception:
        pass
    return cmd


def start_container_for_model(m: Model, hf_token: Optional[str] | None = None) -> Tuple[str, int]:
    """Create (or recreate) a vLLM container for the model.
    Returns (container_name, host_port).
    """
    settings = get_settings()
    image = settings.VLLM_IMAGE
    _ensure_image(image)

    name = f"vllm-model-{m.id}"
    cli = _client()

    # stop existing with same name
    try:
        existing = cli.containers.get(name)
        try:
            existing.stop(timeout=5)
        except Exception:
            pass
        try:
            existing.remove(force=True)
        except Exception:
            pass
    except Exception:
        pass

    binds = {}
    environment = {}
    if m.local_path:
        # bind host models dir at /models (RO)
        binds[settings.CORTEX_MODELS_DIR_HOST or settings.CORTEX_MODELS_DIR] = {"bind": "/models", "mode": "ro"}
        # offline mode optional; we always allow offline
        environment["HF_HUB_OFFLINE"] = "1"
    else:
        # online: share HF cache (optional)
        if settings.HF_CACHE_DIR_HOST or settings.HF_CACHE_DIR:
            binds[settings.HF_CACHE_DIR_HOST or settings.HF_CACHE_DIR] = {"bind": "/root/.cache/huggingface", "mode": "rw"}
        # Pass through HF token (per-model overrides process env)
        try:
            token = hf_token or os.environ.get("HUGGING_FACE_HUB_TOKEN") or os.environ.get("HF_TOKEN")
            if token:
                environment["HUGGING_FACE_HUB_TOKEN"] = str(token)
                # Enable faster transfer backend when downloading from HF
                environment.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "1")
        except Exception:
            pass

    # GPU vs CPU mode
    device_mode = (getattr(m, "device", None) or "cuda").lower()
    device_requests = None
    if device_mode != "cpu":
        devreq = DeviceRequest(count=-1, capabilities=[["gpu"]])
        device_requests = [devreq]

    # NCCL/SHM defaults to improve multi-GPU stability inside containers
    try:
        environment.setdefault("NCCL_P2P_DISABLE", "1")  # safer default across docker hosts
        environment.setdefault("NCCL_IB_DISABLE", "1")   # disable InfiniBand when not present
        environment.setdefault("NCCL_SHM_DISABLE", "0")  # allow SHM for intra-node comms
        # Reduce CUDA memory fragmentation in PyTorch allocator
        environment.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    except Exception:
        pass

    # Healthcheck: hit local /health
    healthcheck = {
        "Test": ["CMD-SHELL", "wget -qO- http://localhost:8000/health || exit 1"],
        "Interval": 10_000_000_000,  # 10s ns
        "Timeout": 5_000_000_000,    # 5s ns
        "Retries": 3,
        "StartPeriod": 15_000_000_000,
    }

    # publish container port 8000 to an ephemeral host port (still useful for logs/debug),
    # but we'll prefer service-to-service via container name on the compose network
    ports = {"8000/tcp": ("0.0.0.0", 0)}

    # Ensure managed container joins the same compose network as gateway when available
    host_config_kwargs = {}
    try:
        # If the gateway service is on a user-defined network named 'cortex_default', prefer it
        # Fallbacks will let Docker create a bridge network automatically.
        host_config_kwargs["network"] = "cortex_default"
    except Exception:
        pass

    # Build final command and log for troubleshooting
    preview_cmd = _build_command(m)
    try:
        print("[docker_manager] starting model", m.id, "cmd:", preview_cmd, flush=True)
    except Exception:
        pass
    container: Container = cli.containers.run(
        image=image,
        name=name,
        command=preview_cmd,
        detach=True,
        environment=environment,
        volumes=binds,
        device_requests=device_requests,
        healthcheck=healthcheck,
        restart_policy={"Name": "unless-stopped"},
        ports=ports,
        network=host_config_kwargs.get("network"),
        labels={"com.docker.compose.project": "cortex"},
        shm_size="2g",
        ipc_mode="host",
    )

    container.reload()
    port_info = container.attrs.get("NetworkSettings", {}).get("Ports", {}).get("8000/tcp", [])
    host_port = 0
    if port_info:
        try:
            host_port = int(port_info[0].get("HostPort"))
        except Exception:
            host_port = 0
    return name, host_port


def stop_container_for_model(m: Model) -> None:
    cli = _client()
    name = f"vllm-model-{m.id}"
    try:
        c = cli.containers.get(name)
        try:
            c.stop(timeout=5)
        except Exception:
            pass
        try:
            c.remove(force=True)
        except Exception:
            pass
    except Exception:
        pass


def tail_logs_for_model(m: Model, tail: int = 1000) -> str:
    cli = _client()
    name = f"vllm-model-{m.id}"
    try:
        c = cli.containers.get(name)
        out = c.logs(tail=tail)
        try:
            return out.decode("utf-8", errors="ignore")
        except Exception:
            return str(out)
    except Exception:
        return ""


