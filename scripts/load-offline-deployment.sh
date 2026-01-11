#!/usr/bin/env bash
# Load pre-downloaded Docker images on offline machine

set -e

IMAGE_DIR=${IMAGE_DIR:-"./cortex-offline-images"}

# Timeout controls (seconds). Set to 0 to disable.
LOAD_TIMEOUT_SEC=${LOAD_TIMEOUT_SEC:-1800}   # 30 minutes per tar file
DOCKER_RETRY_COUNT=${DOCKER_RETRY_COUNT:-2}

# timeout wrapper (uses GNU `timeout` when available)
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

retry() {
    local attempts="$1"
    shift
    local i=1
    while true; do
        if "$@"; then
            return 0
        fi
        if [ "$i" -ge "$attempts" ]; then
            return 1
        fi
        i=$((i+1))
        echo -e "${YELLOW}  retry ${i}/${attempts}...${NC}"
        sleep 2
    done
}

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Cortex Offline Image Loader"
echo "=========================================="
echo ""

if [ ! -d "$IMAGE_DIR" ]; then
    echo -e "${RED}Error: Image directory not found: $IMAGE_DIR${NC}"
    echo ""
    echo "Expected to find: cortex-offline-images/"
    echo ""
    echo "Please ensure:"
    echo "  1. The offline package was transferred to this machine"
    echo "  2. You're running this script from Cortex directory"
    echo ""
    echo "Set custom location with:"
    echo "  IMAGE_DIR=/path/to/images bash $0"
    exit 1
fi

# Check if manifest exists
if [ -f "$IMAGE_DIR/manifest.json" ]; then
    echo -e "${BLUE}Package manifest:${NC}"
    cat "$IMAGE_DIR/manifest.json" | python3 -m json.tool 2>/dev/null || cat "$IMAGE_DIR/manifest.json"
    echo ""
else
    echo -e "${YELLOW}Warning: manifest.json not found${NC}"
    echo "Will load all .tar files found..."
    echo ""
fi

# Check for checksums file
VERIFY_CHECKSUMS=${VERIFY_CHECKSUMS:-"true"}
if [ "$VERIFY_CHECKSUMS" = "true" ] && [ -f "$IMAGE_DIR/checksums.sha256" ]; then
    echo -e "${BLUE}Verifying file checksums...${NC}"
    CHECKSUM_ERRORS=0
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip empty lines
        [ -z "$line" ] && continue
        checksum=$(echo "$line" | awk '{print $1}')
        filepath=$(echo "$line" | awk '{print $2}')
        full_path="$IMAGE_DIR/$filepath"
        
        if [ -f "$full_path" ]; then
            actual=$(sha256sum "$full_path" | awk '{print $1}')
            if [ "$checksum" = "$actual" ]; then
                printf "  %-50s ${GREEN}✓${NC}\n" "$filepath"
            else
                printf "  %-50s ${RED}✗ CHECKSUM MISMATCH${NC}\n" "$filepath"
                ((++CHECKSUM_ERRORS))
            fi
        else
            printf "  %-50s ${YELLOW}⚠ File not found${NC}\n" "$filepath"
        fi
    done < "$IMAGE_DIR/checksums.sha256"
    
    if [ $CHECKSUM_ERRORS -gt 0 ]; then
        echo ""
        echo -e "${RED}ERROR: $CHECKSUM_ERRORS file(s) failed checksum verification!${NC}"
        echo "The package may be corrupted or tampered with."
        echo ""
        read -p "Continue anyway? (yes/no): " CONTINUE_ANYWAY
        if [ "$CONTINUE_ANYWAY" != "yes" ]; then
            echo "Aborted due to checksum failure."
            exit 1
        fi
    else
        echo -e "${GREEN}✓ All checksums verified${NC}"
    fi
    echo ""
elif [ "$VERIFY_CHECKSUMS" = "true" ]; then
    echo -e "${YELLOW}Warning: checksums.sha256 not found. Skipping verification.${NC}"
    echo "Set VERIFY_CHECKSUMS=false to suppress this warning."
    echo ""
fi

# Count tar files
TAR_COUNT=$(find "$IMAGE_DIR" -name "*.tar" -type f | wc -l)

if [ "$TAR_COUNT" -eq 0 ]; then
    echo -e "${RED}Error: No .tar files found in $IMAGE_DIR${NC}"
    echo ""
    echo "Directory contents:"
    ls -la "$IMAGE_DIR"
    exit 1
fi

echo "Found $TAR_COUNT image tar file(s) to load"
echo ""

# Ask for confirmation
read -p "Load all images? This may take several minutes. (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelled"
    exit 0
fi

echo ""
echo "Loading images..."
echo ""

# Load each tar file with progress
LOADED=0
FAILED=0
START_TIME=$(date +%s)

for tar_file in "$IMAGE_DIR"/*.tar; do
    if [ ! -f "$tar_file" ]; then
        continue
    fi
    
    filename=$(basename "$tar_file")
    filesize=$(du -h "$tar_file" | cut -f1)
    
    echo -n "Loading $filename ($filesize)... "
    
    if retry "${DOCKER_RETRY_COUNT}" run_with_timeout "${LOAD_TIMEOUT_SEC}" docker load -i "$tar_file" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        # NOTE: avoid `((var++))` under `set -e` (it returns exit code 1 when var was 0)
        ((++LOADED))
    else
        if command -v timeout >/dev/null 2>&1; then
            echo -e "${RED}✗ Failed (or timed out after ${LOAD_TIMEOUT_SEC}s)${NC}"
        else
            echo -e "${RED}✗ Failed${NC}"
        fi
        ((++FAILED))
    fi
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo -e "Successfully loaded: ${GREEN}$LOADED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo "Time taken: ${DURATION} seconds"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tar files loaded successfully!${NC}"
    echo ""
else
    echo -e "${RED}⚠ Some tar files failed to load${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  - Check tar file integrity"
    echo "  - Ensure sufficient disk space"
    echo "  - Try loading failed files individually:"
    echo "    docker load -i $IMAGE_DIR/<filename>.tar"
fi

# =========================================
# Post-load verification
# =========================================
VERIFY_AFTER_LOAD=${VERIFY_AFTER_LOAD:-"true"}
if [ "$VERIFY_AFTER_LOAD" = "true" ]; then
    echo ""
    echo "=========================================="
    echo "Post-Load Verification"
    echo "=========================================="
    echo ""
    
    # Read expected images from manifest if available
    EXPECTED_IMAGES=()
    if [ -f "$IMAGE_DIR/manifest.json" ]; then
        # Extract image names from manifest using python
        if command -v python3 >/dev/null 2>&1; then
            EXPECTED_IMAGES=($(python3 -c "
import json
import sys
try:
    with open('$IMAGE_DIR/manifest.json') as f:
        data = json.load(f)
    images = []
    # Handle engines array
    if 'images' in data:
        for engine in data['images'].get('engines', []):
            name = engine.get('name', '')
            version = engine.get('version', engine.get('tag', ''))
            if name and version:
                images.append(f'{name}:{version}')
        # Handle infrastructure array
        for infra in data['images'].get('infrastructure', []):
            name = infra.get('name', '')
            if name:
                images.append(name)
    # Handle settings-style manifest
    if 'settings' in data:
        vllm = data['settings'].get('VLLM_IMAGE', '')
        llamacpp = data['settings'].get('LLAMACPP_IMAGE', '')
        if vllm: images.append(vllm)
        if llamacpp: images.append(llamacpp)
    for img in images:
        print(img)
except Exception as e:
    pass
" 2>/dev/null))
        fi
    fi
    
    # Fallback to versions.env if no manifest images
    if [ ${#EXPECTED_IMAGES[@]} -eq 0 ]; then
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        if [ -f "${SCRIPT_DIR}/versions.env" ]; then
            source "${SCRIPT_DIR}/versions.env"
        fi
        VLLM_VERSION=${VLLM_VERSION:-${CORTEX_VLLM_VERSION:-"latest"}}
        LLAMACPP_TAG=${LLAMACPP_TAG:-${CORTEX_LLAMACPP_TAG:-"server-cuda"}}
        EXPECTED_IMAGES=(
            "vllm/vllm-openai:${VLLM_VERSION}"
            "ghcr.io/ggml-org/llama.cpp:${LLAMACPP_TAG}"
            "python:3.11-slim"
            "node:18-alpine"
            "postgres:16"
            "redis:7"
        )
    fi
    
    echo -e "${BLUE}Verifying loaded images...${NC}"
    echo ""
    
    VERIFY_PASSED=0
    VERIFY_FAILED=0
    CRITICAL_MISSING=0
    
    for image in "${EXPECTED_IMAGES[@]}"; do
        # Skip empty entries
        [ -z "$image" ] && continue
        
        printf "  %-55s " "$image"
        
        if docker image inspect "$image" > /dev/null 2>&1; then
            SIZE=$(docker image inspect "$image" --format='{{.Size}}' 2>/dev/null | awk '{printf "%.1f GB", $1/1024/1024/1024}')
            echo -e "${GREEN}✓${NC} ($SIZE)"
            ((++VERIFY_PASSED))
        else
            # Check if it's a critical image
            if [[ "$image" == *"vllm"* ]] || [[ "$image" == *"llama"* ]] || [[ "$image" == *"postgres"* ]] || [[ "$image" == *"redis"* ]]; then
                echo -e "${RED}✗ MISSING (critical)${NC}"
                ((++CRITICAL_MISSING))
            else
                echo -e "${YELLOW}⚠ Missing${NC}"
            fi
            ((++VERIFY_FAILED))
        fi
    done
    
    echo ""
    echo -e "Verified: ${GREEN}$VERIFY_PASSED${NC} | Missing: ${RED}$VERIFY_FAILED${NC}"
    echo ""
    
    if [ $CRITICAL_MISSING -gt 0 ]; then
        echo -e "${RED}ERROR: $CRITICAL_MISSING critical image(s) are missing!${NC}"
        echo "Cortex may not function properly without these images."
        echo ""
        echo "Try re-loading the failed images or run:"
        echo "  bash scripts/verify-offline-images.sh"
        exit 1
    elif [ $VERIFY_FAILED -gt 0 ]; then
        echo -e "${YELLOW}Warning: Some optional images are missing${NC}"
        echo "Core functionality should work, but some features may be unavailable."
    else
        echo -e "${GREEN}✓ All expected images verified!${NC}"
    fi
fi

echo ""
echo "Loaded images:"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | head -20
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Configure offline mode: echo 'OFFLINE_MODE=True' >> backend/.env"
echo "2. Start Cortex: make quick-start"
echo ""

# Exit with failure if any tar files failed to load
if [ $FAILED -gt 0 ]; then
    exit 1
fi

