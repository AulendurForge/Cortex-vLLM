#!/usr/bin/env bash
# Verify all required Docker images are cached locally

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}=========================================="
echo "Cortex Offline Readiness Verification"
echo -e "==========================================${NC}"
echo ""

# Read versions from config if available
VLLM_VERSION=${VLLM_VERSION:-"v0.6.3"}
LLAMACPP_TAG=${LLAMACPP_TAG:-"server-cuda"}

REQUIRED_IMAGES=(
    # Core engines
    "vllm/vllm-openai:${VLLM_VERSION}|Critical - vLLM inference engine"
    "ghcr.io/ggml-org/llama.cpp:${LLAMACPP_TAG}|Critical - llama.cpp inference engine"
    
    # Application runtime
    "python:3.11-slim|Critical - Backend runtime"
    "node:18-alpine|Critical - Frontend runtime"
    
    # Infrastructure
    "postgres:16|Critical - Database"
    "redis:7|Critical - Cache/rate limiting"
    "prom/prometheus:v2.47.0|Required - Metrics"
    
    # Monitoring (optional but recommended)
    "prom/node-exporter:v1.6.1|Optional - Host metrics"
    "nvidia/dcgm-exporter:3.1.8-3.1.5-ubuntu22.04|Optional - GPU metrics"
    "gcr.io/cadvisor/cadvisor:v0.47.0|Optional - Container metrics"
    
    # Registry (optional)
    "registry:2|Optional - Local registry"
)

CACHED=0
MISSING_CRITICAL=0
MISSING_OPTIONAL=0

echo -e "${BLUE}Checking required images...${NC}"
echo ""

# Protect against Docker daemon hangs.
# This script is usually fast, but in failure modes docker can hang; time out those calls.
INSPECT_TIMEOUT_SEC=${INSPECT_TIMEOUT_SEC:-15}

run_with_timeout() {
    local timeout_sec="$1"
    shift
    if [ "${timeout_sec}" = "0" ] || [ "${timeout_sec}" = "0s" ]; then
        "$@"
        return $?
    fi
    if command -v timeout >/dev/null 2>&1; then
        timeout --preserve-status "${timeout_sec}" "$@"
        return $?
    fi
    "$@"
}

for entry in "${REQUIRED_IMAGES[@]}"; do
    IFS='|' read -r image description <<< "$entry"
    
    printf "  %-60s " "$image"
    
    if run_with_timeout "${INSPECT_TIMEOUT_SEC}" docker image inspect "$image" > /dev/null 2>&1; then
        # Get image size
        SIZE=$(run_with_timeout "${INSPECT_TIMEOUT_SEC}" docker image inspect "$image" --format='{{.Size}}' | awk '{printf "%.1f GB", $1/1024/1024/1024}')
        echo -e "${GREEN}✓${NC} ($SIZE)"
        # NOTE: avoid `((var++))` under `set -e` (it returns exit code 1 when var was 0)
        ((++CACHED))
    else
        if [[ "$description" == Critical* ]]; then
            echo -e "${RED}✗ MISSING (${description})${NC}"
            ((++MISSING_CRITICAL))
        else
            echo -e "${YELLOW}⚠ Missing (${description})${NC}"
            ((++MISSING_OPTIONAL))
        fi
    fi
done

echo ""
echo -e "${BOLD}=========================================="
echo "Summary"
echo -e "==========================================${NC}"
echo -e "Cached:             ${GREEN}${CACHED}${NC}"
echo -e "Missing (critical): ${RED}${MISSING_CRITICAL}${NC}"
echo -e "Missing (optional): ${YELLOW}${MISSING_OPTIONAL}${NC}"
echo ""

# Overall status
if [ $MISSING_CRITICAL -eq 0 ]; then
    if [ $MISSING_OPTIONAL -eq 0 ]; then
        echo -e "${GREEN}${BOLD}✓ READY FOR OFFLINE OPERATION${NC}"
        echo ""
        echo "All required images are cached locally."
        echo "You can deploy Cortex in a fully offline environment."
        echo ""
        echo -e "${BLUE}To enable offline mode:${NC}"
        echo "  1. Set OFFLINE_MODE=True in backend/.env"
        echo "  2. Start: make quick-start"
        echo ""
    else
        echo -e "${YELLOW}${BOLD}✓ READY (with limitations)${NC}"
        echo ""
        echo "Core functionality available, but some monitoring disabled."
        echo ""
        echo -e "${YELLOW}Missing optional images:${NC}"
        echo "  - GPU metrics (dcgm-exporter) - install if GPUs present"
        echo "  - Container metrics (cadvisor) - useful for debugging"
        echo ""
        echo "To load missing images:"
        echo "  make load-offline"
        echo ""
    fi
else
    echo -e "${RED}${BOLD}✗ NOT READY FOR OFFLINE OPERATION${NC}"
    echo ""
    echo -e "${RED}Critical images are missing!${NC}"
    echo ""
    echo "To prepare for offline operation:"
    echo ""
    echo -e "${BLUE}Option 1: Use offline package (recommended)${NC}"
    echo "  1. On internet-connected machine:"
    echo "     make prepare-offline"
    echo "  2. Transfer cortex-offline-images/ directory"
    echo "  3. On this machine:"
    echo "     make load-offline"
    echo ""
    echo -e "${BLUE}Option 2: Pull manually${NC}"
    echo "  docker pull <image-name>"
    echo "  (repeat for each missing critical image)"
    echo ""
    exit 1
fi

# Show current Docker images summary
echo -e "${BLUE}Current Docker image cache:${NC}"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}" | head -15
echo ""

# Check offline mode status
if [ -f "backend/.env" ]; then
    if grep -q "OFFLINE_MODE=True" backend/.env 2>/dev/null; then
        echo -e "${GREEN}✓ OFFLINE_MODE enabled in backend/.env${NC}"
    else
        echo -e "${YELLOW}ℹ OFFLINE_MODE not enabled${NC}"
        echo "  To enable: echo 'OFFLINE_MODE=True' >> backend/.env"
    fi
fi

echo ""

