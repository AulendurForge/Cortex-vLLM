#!/usr/bin/env bash
# Load pre-downloaded Docker images on offline machine

set -e

IMAGE_DIR=${IMAGE_DIR:-"./cortex-offline-images"}

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
    echo "  2. You're running this script from cortex-vllm directory"
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
    
    if docker load -i "$tar_file" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        ((LOADED++))
    else
        echo -e "${RED}✗ Failed${NC}"
        ((FAILED++))
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
    echo -e "${GREEN}✓ All images loaded successfully!${NC}"
    echo ""
    echo "Loaded images:"
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | head -20
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "1. Verify images: bash scripts/verify-offline-images.sh"
    echo "2. Configure offline mode: echo 'OFFLINE_MODE=True' >> backend/.env"
    echo "3. Start Cortex: make quick-start"
    echo ""
else
    echo -e "${RED}⚠ Some images failed to load${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  - Check tar file integrity"
    echo "  - Ensure sufficient disk space"
    echo "  - Try loading failed files individually:"
    echo "    docker load -i $IMAGE_DIR/<filename>.tar"
    exit 1
fi

