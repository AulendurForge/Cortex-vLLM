"""IP utility functions for host IP detection and allowlist management."""

import os
import socket
from typing import Optional
from fastapi import Request


def get_host_ip() -> Optional[str]:
    """Get the host machine's IP address.
    
    Tries multiple methods:
    1. HOST_IP environment variable (set by Docker Compose/entrypoint)
    2. Detect from network interfaces (best-effort)
    
    Returns:
        Host IP address string, or None if detection fails
    """
    # Method 1: Check environment variable (set by entrypoint.sh)
    host_ip = os.environ.get("HOST_IP")
    if host_ip and host_ip not in ("localhost", "127.0.0.1"):
        return host_ip.strip()
    
    # Method 2: Try to detect from network interfaces
    try:
        # Connect to external address to determine local IP
        # This doesn't actually send data, just determines routing
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # Connect to a public DNS server (doesn't actually connect)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            # Filter out loopback and Docker bridge networks
            if local_ip and local_ip != "127.0.0.1" and not local_ip.startswith("172.17."):
                return local_ip
        except Exception:
            s.close()
    except Exception:
        pass
    
    # Method 3: Try hostname resolution
    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        if local_ip and local_ip != "127.0.0.1":
            return local_ip
    except Exception:
        pass
    
    return None


def ensure_host_ip_in_allowlist(ip_allowlist: str) -> str:
    """Ensure host machine IP is included in the allowlist.
    
    If ip_allowlist is empty, returns empty string (allows all IPs).
    If ip_allowlist has values, adds host IP if not already present.
    
    Args:
        ip_allowlist: Comma-separated string of allowed IPs
        
    Returns:
        Updated allowlist string with host IP included
    """
    # If empty, return empty (allows all IPs)
    if not ip_allowlist or not ip_allowlist.strip():
        return ""
    
    # Get host IP
    host_ip = get_host_ip()
    if not host_ip:
        # If we can't detect host IP, return original allowlist
        return ip_allowlist
    
    # Parse existing allowlist
    existing_ips = [ip.strip() for ip in ip_allowlist.split(",") if ip.strip()]
    
    # Add host IP if not already present
    if host_ip not in existing_ips:
        existing_ips.append(host_ip)
    
    # Return comma-separated string
    return ",".join(existing_ips)


def get_client_ip(request: Request) -> Optional[str]:
    """Get the real client IP address from a request.
    
    Handles both direct connections and reverse proxy scenarios:
    1. Checks X-Forwarded-For header (most common proxy header)
    2. Checks X-Real-IP header (nginx, traefik)
    3. Falls back to request.client.host (direct connection)
    
    Args:
        request: FastAPI Request object
        
    Returns:
        Client IP address string, or None if not available
    """
    # Method 1: Check X-Forwarded-For (most common proxy header)
    # Format: "client_ip, proxy1_ip, proxy2_ip"
    # We want the first IP (original client)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first IP from the comma-separated list
        first_ip = forwarded_for.split(",")[0].strip()
        if first_ip:
            return first_ip
    
    # Method 2: Check X-Real-IP (nginx, traefik)
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        ip = real_ip.strip()
        if ip:
            return ip
    
    # Method 3: Fallback to direct connection IP
    if request.client:
        return request.client.host
    
    return None

