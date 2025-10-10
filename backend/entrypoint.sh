#!/usr/bin/env bash
# Cortex Gateway Entrypoint
# Automatically detects host IP and configures CORS if needed

set -e

echo "[entrypoint] Starting Cortex Gateway..."

# Function to detect IP using multiple methods
detect_container_host_ip() {
    local best_ip="localhost"
    local best_score=0
    
    # Try to get IP from docker host gateway
    local gateway_ip=$(ip route | grep default | awk '{print $3}' 2>/dev/null || echo "")
    if [[ -n "$gateway_ip" && "$gateway_ip" != "localhost" ]]; then
        # Try to resolve what network the gateway is on
        local host_ip=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' | head -1)
        if [[ -n "$host_ip" && "$host_ip" != "127.0.0.1" ]]; then
            best_ip="$host_ip"
        fi
    fi
    
    # Fallback: check mounted /proc if available (when running with host network visibility)
    if [[ "$best_ip" == "localhost" && -f "/host-proc/net/route" ]]; then
        # Read host's routing table
        best_ip=$(awk '/^[^\t]+\t00000000/ {print $1}' /host-proc/net/route | head -1 | xargs -I {} sh -c "cat /host-proc/net/fib_triestat 2>/dev/null || echo localhost")
    fi
    
    echo "$best_ip"
}

# Check if HOST_IP is provided by Docker Compose, otherwise detect it
if [[ -n "$HOST_IP" && "$HOST_IP" != "localhost" && "$HOST_IP" != "127.0.0.1" ]]; then
    echo "[entrypoint] Using provided HOST_IP: $HOST_IP"
    DETECTED_IP="$HOST_IP"
else
    echo "[entrypoint] HOST_IP not provided or is localhost, attempting to detect..."
    DETECTED_IP=$(detect_container_host_ip)
fi

# Check if CORS_ALLOW_ORIGINS is set and contains actual IP or is just localhost
CURRENT_CORS="${CORS_ALLOW_ORIGINS:-}"

if [[ -z "$CURRENT_CORS" ]] || [[ "$CURRENT_CORS" == *"localhost"* && "$CURRENT_CORS" != *"192.168."* && "$CURRENT_CORS" != *"10."* ]]; then
    echo "[entrypoint] CORS appears to be localhost-only, attempting to enhance..."
    
    if [[ -n "$DETECTED_IP" && "$DETECTED_IP" != "localhost" && "$DETECTED_IP" != "127.0.0.1" ]]; then
        echo "[entrypoint] Using detected host IP: $DETECTED_IP"
        
        # Enhance CORS to include detected IP
        if [[ -n "$CURRENT_CORS" ]]; then
            export CORS_ALLOW_ORIGINS="http://${DETECTED_IP}:3001,${CURRENT_CORS}"
        else
            export CORS_ALLOW_ORIGINS="http://${DETECTED_IP}:3001,http://localhost:3001,http://127.0.0.1:3001"
        fi
        
        echo "[entrypoint] Enhanced CORS_ALLOW_ORIGINS: $CORS_ALLOW_ORIGINS"
    else
        echo "[entrypoint] Could not detect host IP, using provided CORS configuration"
    fi
else
    echo "[entrypoint] CORS already configured with network IP: $CURRENT_CORS"
fi

# Start the FastAPI application
echo "[entrypoint] Starting uvicorn..."
exec uvicorn src.main:app --host 0.0.0.0 --port 8084
