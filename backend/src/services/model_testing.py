"""Model testing and readiness checking utilities."""

import httpx
import time
from typing import Any, Dict
from pydantic import BaseModel, Field
from typing import Optional


class ModelTestResult(BaseModel):
    success: bool
    test_type: str
    request: dict[str, Any]
    response: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    latency_ms: int
    timestamp: float


class ReadinessResp(BaseModel):
    status: str  # 'ready' | 'loading' | 'stopped' | 'error'
    detail: Optional[str] = None


async def test_chat_model(base_url: str, model_name: str, internal_key: str = "") -> Dict[str, Any]:
    """Send test chat completion request to verify model is responding.
    
    Args:
        base_url: Model endpoint URL
        model_name: Served model name
        internal_key: Optional internal API key
        
    Returns:
        Dict with 'request' and 'response' keys
        
    Raises:
        Exception: If model returns error or invalid response
    """
    from ..main import http_client  # type: ignore
    
    request_data = {
        "model": model_name,
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 50,
        "temperature": 0.7
    }
    
    headers = {"Content-Type": "application/json"}
    if internal_key:
        headers["Authorization"] = f"Bearer {internal_key}"
    
    response = await http_client.post(
        f"{base_url}/v1/chat/completions",
        json=request_data,
        headers=headers,
        timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)
    )
    
    if response.status_code >= 400:
        raise Exception(f"Model returned HTTP {response.status_code}: {response.text[:200]}")
    
    response_data = response.json()
    
    # Verify response format
    if not response_data.get("choices"):
        raise Exception("Invalid response: missing 'choices' field")
    
    return {
        "request": request_data,
        "response": response_data
    }


async def test_embedding_model(base_url: str, model_name: str, internal_key: str = "") -> Dict[str, Any]:
    """Send test embeddings request to verify model is responding.
    
    Args:
        base_url: Model endpoint URL
        model_name: Served model name
        internal_key: Optional internal API key
        
    Returns:
        Dict with 'request' and 'response' keys
        
    Raises:
        Exception: If model returns error or invalid response
    """
    from ..main import http_client  # type: ignore
    
    request_data = {
        "model": model_name,
        "input": "test"
    }
    
    headers = {"Content-Type": "application/json"}
    if internal_key:
        headers["Authorization"] = f"Bearer {internal_key}"
    
    response = await http_client.post(
        f"{base_url}/v1/embeddings",
        json=request_data,
        headers=headers,
        timeout=httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
    )
    
    if response.status_code >= 400:
        raise Exception(f"Model returned HTTP {response.status_code}: {response.text[:200]}")
    
    response_data = response.json()
    
    # Verify embedding format
    if not response_data.get("data") or not isinstance(response_data["data"], list):
        raise Exception("Invalid response: missing or invalid 'data' field")
    
    if not response_data["data"][0].get("embedding"):
        raise Exception("Invalid response: missing 'embedding' in data")
    
    return {
        "request": request_data,
        "response": response_data
    }


async def check_model_readiness(container_name: str, served_model_name: str) -> ReadinessResp:
    """Check if a model is ready to serve requests.
    
    For llama.cpp, a 503 with message 'Loading model' indicates the server is up but
    still loading weights; we report 'loading' in that case. On 200 from chat, we
    report 'ready'.
    
    Args:
        container_name: Docker container name
        served_model_name: Model's served name
        
    Returns:
        ReadinessResp with status and optional detail
    """
    base_url = f"http://{container_name}:8000"
    
    # Minimal chat request
    request_data = {
        "model": served_model_name,
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 1,
        "temperature": 0.0,
    }
    
    try:
        from ..main import http_client  # type: ignore
        r = await http_client.post(
            f"{base_url}/v1/chat/completions",
            json=request_data,
            headers={"Content-Type": "application/json"},
            timeout=httpx.Timeout(connect=2.0, read=2.0, write=2.0, pool=5.0),
        )
        
        if r.status_code == 200:
            return ReadinessResp(status="ready")
        
        if r.status_code == 503:
            try:
                j = r.json()
                msg = (j or {}).get("error", {}).get("message", "")
            except Exception:
                msg = r.text[:200]
            
            if "Loading model" in msg:
                return ReadinessResp(status="loading", detail="loading_model")
            return ReadinessResp(status="error", detail=f"503: {msg}")
        
        return ReadinessResp(status="error", detail=f"HTTP {r.status_code}")
        
    except Exception as e:
        return ReadinessResp(status="error", detail=str(e)[:200])
