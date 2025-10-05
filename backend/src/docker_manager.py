from __future__ import annotations

import docker
import os
import re
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
    # Max context length:
    # For embeddings models, let vLLM derive the correct limit from the model config
    # (e.g., max_position_embeddings) to remain model‑agnostic. Do not pass the flag.
    # For generation models, pass through when provided.
    if m.max_model_len and not ((getattr(m, "task", "") or "").lower().startswith("embed")):
        try:
            cmd += ["--max-model-len", str(int(m.max_model_len))]
        except Exception:
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


def _build_llamacpp_command(m: Model) -> list[str]:
    """Build llama-server command arguments for llama.cpp containers.
    Note: The official image has ENTRYPOINT ["/app/llama-server"], so we only pass arguments.
    """
    model_path = _resolve_llamacpp_model_path(m)
    
    # Don't include 'llama-server' - it's already in the ENTRYPOINT
    cmd: list[str] = [
        "-m", model_path,
        "--host", "0.0.0.0",
        "--port", "8000",
    ]
    
    # Core parameters with defaults from settings
    settings = get_settings()
    context_size = getattr(m, 'context_size', None) or settings.LLAMACPP_DEFAULT_CONTEXT
    ngl = getattr(m, 'ngl', None) or settings.LLAMACPP_DEFAULT_NGL
    batch_size = getattr(m, 'batch_size', None) or settings.LLAMACPP_DEFAULT_BATCH_SIZE
    threads = getattr(m, 'threads', None) or settings.LLAMACPP_DEFAULT_THREADS
    
    cmd += ["-c", str(context_size)]
    cmd += ["-ngl", str(ngl)]
    cmd += ["-b", str(batch_size)]
    cmd += ["-t", str(threads)]
    
    # GPU tensor split
    if getattr(m, 'tensor_split', None):
        cmd += ["--tensor-split", str(m.tensor_split)]
    
    # Performance flags
    if getattr(m, 'flash_attention', None) is not None:
        cmd += ["--flash-attn", "on" if m.flash_attention else "off"]
    if getattr(m, 'mlock', None) and m.mlock:
        cmd += ["--mlock"]
    if getattr(m, 'no_mmap', None) and m.no_mmap:
        cmd += ["--no-mmap"]
    if getattr(m, 'numa_policy', None):
        cmd += ["--numa", str(m.numa_policy)]
    
    # RoPE parameters
    if getattr(m, 'rope_freq_base', None):
        cmd += ["--rope-freq-base", str(m.rope_freq_base)]
    if getattr(m, 'rope_freq_scale', None):
        cmd += ["--rope-freq-scale", str(m.rope_freq_scale)]
    
    return cmd


def _resolve_llamacpp_model_path(m: Model) -> str:
    """Resolve and validate GGUF file path for llama.cpp.
    
    Args:
        m: Model database object with local_path set
        
    Returns:
        str: Validated absolute path to GGUF file in container (/models/...)
        
    Raises:
        ValueError: If local_path invalid, file not found, or multiple GGUFs without selection
    """
    if not m.local_path:
        raise ValueError("llama.cpp requires local_path to be set")
    
    settings = get_settings()
    # Container path (what llama-server will see)
    container_path = f"/models/{m.local_path}"
    # Host path (for validation - gateway has models dir mounted)
    host_base = settings.CORTEX_MODELS_DIR
    host_path = os.path.join(host_base, m.local_path)
    
    # Case 1: Direct .gguf file path
    if m.local_path.lower().endswith('.gguf'):
        # If the selected file exists, but we also find a multi-part set in the
        # same directory, prefer the first part so llama.cpp can auto-load all parts.
        if not os.path.isfile(host_path):
            raise ValueError(f"GGUF file not found: {m.local_path}")
        try:
            parent_dir = os.path.dirname(host_path)
            # Look for any file like <base>-00001-of-<total>.gguf
            part_candidates = []
            for name in os.listdir(parent_dir):
                if re.match(r".+-00001-of-\d{5}\.gguf$", name, re.IGNORECASE):
                    part_candidates.append(name)
            if part_candidates:
                part_candidates.sort()
                first_part = part_candidates[0]
                return f"/models/{os.path.relpath(os.path.join(parent_dir, first_part), settings.CORTEX_MODELS_DIR)}"
        except Exception:
            # Fall back to the provided file
            pass
        return container_path
    
    # Case 2: Special handling for GPT-OSS (known location)
    if "huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated" in m.local_path:
        special_path = "/models/huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated/Q8_0-GGUF/gpt-oss-120b.Q8_0.gguf"
        host_special = os.path.join(host_base, "huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated/Q8_0-GGUF/gpt-oss-120b.Q8_0.gguf")
        if os.path.isfile(host_special):
            return special_path
        # Fall through to directory scan if special file not found
    
    # Case 3: Directory - scan for .gguf files
    if os.path.isdir(host_path):
        try:
            files = os.listdir(host_path)
            gguf_files = sorted([f for f in files if f.lower().endswith('.gguf')])
            
            if not gguf_files:
                raise ValueError(f"No GGUF files found in directory: {m.local_path}")
            
            if len(gguf_files) > 1:
                print(f"[WARNING] Multiple GGUF files found in {m.local_path}: {gguf_files}", flush=True)
                print(f"[WARNING] Using first file: {gguf_files[0]}", flush=True)
            
            # Use first GGUF file found
            return f"/models/{m.local_path}/{gguf_files[0]}"
        except OSError as e:
            raise ValueError(f"Cannot read directory {m.local_path}: {e}")
    
    # Case 4: Path doesn't exist or invalid
    raise ValueError(f"Invalid local_path: {m.local_path} - must be a .gguf file or directory containing GGUF files")


def start_llamacpp_container_for_model(m: Model) -> Tuple[str, int]:
    """Create llama.cpp container for the model."""
    settings = get_settings()
    image = settings.LLAMACPP_IMAGE
    _ensure_image(image)
    
    name = f"llamacpp-model-{m.id}"
    cli = _client()
    
    # Stop existing container
    try:
        existing = cli.containers.get(name)
        try:
            existing.stop(timeout=10)
        except Exception:
            pass
        try:
            existing.remove(force=True)
        except Exception:
            pass
    except Exception:
        pass
    
    # Set up volumes - same as vLLM for models directory
    binds = {
        settings.CORTEX_MODELS_DIR_HOST or settings.CORTEX_MODELS_DIR: 
        {"bind": "/models", "mode": "ro"}
    }
    
    # Get ngl setting to determine if GPU is needed
    ngl = getattr(m, 'ngl', None) or settings.LLAMACPP_DEFAULT_NGL
    
    # Environment variables for GPU access
    # When using nvidia runtime, these env vars tell it to expose all GPUs
    environment = {
        "NVIDIA_VISIBLE_DEVICES": "all",
        "NVIDIA_DRIVER_CAPABILITIES": "compute,utility",
    }
    
    # Device requests for Docker API (used with nvidia runtime)
    device_requests = None
    if ngl > 0:
        device_requests = [DeviceRequest(count=-1, capabilities=[["gpu"]])]
    
    # Health check - llama.cpp server responds to /v1/models endpoint
    healthcheck = {
        "Test": ["CMD-SHELL", "curl -f http://localhost:8000/v1/models || exit 1"],
        "Interval": 10_000_000_000,  # 10s
        "Timeout": 8_000_000_000,    # 8s (llama.cpp may be slower)
        "Retries": 3,
        "StartPeriod": 45_000_000_000,  # 45s (large models take time to load)
    }
    
    # Build command
    cmd = _build_llamacpp_command(m)
    
    print(f"[docker_manager] starting llamacpp model {m.id}, cmd: {cmd}", flush=True)
    print(f"[docker_manager] ngl={ngl}, device_requests={device_requests}", flush=True)
    
    # Use containers.run() with runtime parameter (supported per Docker SDK docs)
    # The nvidia runtime ensures CUDA libraries are mounted from the host
    run_kwargs = {
        "image": image,
        "name": name,
        "command": cmd,
        "detach": True,
        "environment": environment,
        "volumes": binds,
        "healthcheck": healthcheck,
        "restart_policy": {"Name": "no"},
        "ports": {"8000/tcp": ("0.0.0.0", 0)},
        "network": "cortex_default",
        "labels": {"com.docker.compose.project": "cortex"},
        "shm_size": "8g",
        "ipc_mode": "host",
    }
    
    # Add runtime and device_requests for GPU support
    # Both are required for nvidia runtime to expose GPUs
    if ngl > 0 and device_requests:
        run_kwargs["runtime"] = "nvidia"
        run_kwargs["device_requests"] = device_requests
        print(f"[docker_manager] GPU mode: runtime=nvidia, device_requests={device_requests}", flush=True)
    else:
        print(f"[docker_manager] CPU mode: ngl={ngl}", flush=True)
    
    container: Container = cli.containers.run(**run_kwargs)
    
    container.reload()
    port_info = container.attrs.get("NetworkSettings", {}).get("Ports", {}).get("8000/tcp", [])
    host_port = 0
    if port_info:
        try:
            host_port = int(port_info[0].get("HostPort"))
        except Exception:
            host_port = 0
    
    return name, host_port


def start_vllm_container_for_model(m: Model, hf_token: Optional[str] | None = None) -> Tuple[str, int]:
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
        restart_policy={"Name": "no"},  # No auto-restart - models start only when admin clicks Start
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


def start_container_for_model(m: Model, hf_token: Optional[str] | None = None) -> Tuple[str, int]:
    """Route to appropriate engine based on model.engine_type."""
    engine_type = getattr(m, 'engine_type', 'vllm')
    
    if engine_type == 'llamacpp':
        return start_llamacpp_container_for_model(m)
    else:
        return start_vllm_container_for_model(m, hf_token)


def stop_container_for_model(m: Model) -> None:
    """Stop container regardless of engine type."""
    cli = _client()
    engine_type = getattr(m, 'engine_type', 'vllm')
    prefix = 'llamacpp' if engine_type == 'llamacpp' else 'vllm'
    name = f"{prefix}-model-{m.id}"
    
    try:
        c = cli.containers.get(name)
        try:
            timeout = 10 if engine_type == 'llamacpp' else 5
            c.stop(timeout=timeout)
        except Exception:
            pass
        try:
            c.remove(force=True)
        except Exception:
            pass
    except Exception:
        pass


def tail_logs_for_model(m: Model, tail: int = 1000) -> str:
    """Get container logs regardless of engine type."""
    cli = _client()
    engine_type = getattr(m, 'engine_type', 'vllm')
    prefix = 'llamacpp' if engine_type == 'llamacpp' else 'vllm'
    name = f"{prefix}-model-{m.id}"
    
    try:
        c = cli.containers.get(name)
        out = c.logs(tail=tail)
        try:
            return out.decode("utf-8", errors="ignore")
        except Exception:
            return str(out)
    except Exception:
        return ""


