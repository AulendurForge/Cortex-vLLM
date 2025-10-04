#!/usr/bin/env bash
# Detect host machine IP address for Cortex-vLLM
# This script detects the primary LAN IP address, excluding Docker bridge networks and loopback

set -e

# Check if IP is a Docker bridge network (172.17.0.0/16 through 172.31.0.0/16)
is_docker_bridge() {
    local ip="$1"
    # Docker default bridge networks use 172.17-31.x.x
    if [[ "$ip" =~ ^172\.(1[7-9]|2[0-9]|3[0-1])\. ]]; then
        return 0  # Is a Docker bridge
    fi
    return 1  # Not a Docker bridge
}

# Score IP addresses (higher score = more preferred for LAN access)
score_ip() {
    local ip="$1"
    
    # Reject invalid IPs
    if [[ -z "$ip" || "$ip" == "127.0.0.1" ]]; then
        echo "0"
        return
    fi
    
    # Reject Docker bridge networks
    if is_docker_bridge "$ip"; then
        echo "0"
        return
    fi
    
    # Prefer standard home/office private networks
    if [[ "$ip" =~ ^192\.168\. ]]; then
        echo "100"  # Highest - typical home/small office
        return
    fi
    
    if [[ "$ip" =~ ^10\. ]]; then
        echo "95"  # Very high - large corporate networks
        return
    fi
    
    # Private network 172.16-172.31 (non-Docker, if any)
    if [[ "$ip" =~ ^172\.(1[6-9]|2[0-9]|3[0-1])\. ]] && ! is_docker_bridge "$ip"; then
        echo "85"  # Medium-high
        return
    fi
    
    # Link-local (169.254.x.x) - lowest priority
    if [[ "$ip" =~ ^169\.254\. ]]; then
        echo "10"
        return
    fi
    
    # Public IPs or other
    echo "50"
}

# Collect and score all available IP addresses
detect_ip() {
    local best_ip="localhost"
    local best_score=0
    declare -A seen_ips  # Deduplicate IPs
    
    # Method 1: ip route (most reliable for default route IP)
    if command -v ip &> /dev/null; then
        local route_ip
        route_ip=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' | head -1)
        if [[ -n "$route_ip" ]]; then
            seen_ips["$route_ip"]=1
        fi
    fi
    
    # Method 2: hostname -I (Linux - all IPs)
    if command -v hostname &> /dev/null; then
        while read -r ip; do
            if [[ -n "$ip" ]]; then
                seen_ips["$ip"]=1
            fi
        done < <(hostname -I 2>/dev/null | tr ' ' '\n')
    fi
    
    # Method 3: ifconfig (macOS, older Linux)
    if command -v ifconfig &> /dev/null; then
        while read -r ip; do
            if [[ -n "$ip" ]]; then
                seen_ips["$ip"]=1
            fi
        done < <(ifconfig 2>/dev/null | grep 'inet ' | awk '{print $2}' | sed 's/addr://')
    fi
    
    # Score all collected IPs and pick the best
    for ip in "${!seen_ips[@]}"; do
        local score
        score=$(score_ip "$ip")
        if [[ "$score" -gt "$best_score" ]]; then
            best_score=$score
            best_ip="$ip"
        fi
    done
    
    echo "$best_ip"
    return 0
}

# Main execution
HOST_IP=$(detect_ip)

# If called with --export, output as environment variable format
if [[ "$1" == "--export" ]]; then
    echo "export HOST_IP=$HOST_IP"
elif [[ "$1" == "--verbose" ]]; then
    echo "Detected host IP: $HOST_IP" >&2
    echo "$HOST_IP"
else
    # Just output the IP
    echo "$HOST_IP"
fi
