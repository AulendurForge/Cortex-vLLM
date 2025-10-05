#!/usr/bin/env bash
# Cleanup orphaned model containers
# Run this if you have model containers running but not in the database

set -e

echo "========================================="
echo "Cortex Model Container Cleanup"
echo "========================================="
echo ""

# Find all model containers
echo "Scanning for model containers..."
VLLM_CONTAINERS=$(docker ps -a --filter "name=vllm-model-" --format "{{.Names}}" | sort)
LLAMACPP_CONTAINERS=$(docker ps -a --filter "name=llamacpp-model-" --format "{{.Names}}" | sort)

ALL_CONTAINERS=$(echo -e "$VLLM_CONTAINERS\n$LLAMACPP_CONTAINERS" | grep -v '^$')

if [ -z "$ALL_CONTAINERS" ]; then
    echo "✓ No model containers found"
    exit 0
fi

echo "Found model containers:"
echo "$ALL_CONTAINERS" | sed 's/^/  - /'
echo ""

# Count
TOTAL=$(echo "$ALL_CONTAINERS" | wc -l)
echo "Total: $TOTAL container(s)"
echo ""

# Ask for confirmation
read -p "Stop and remove all these containers? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelled"
    exit 0
fi

echo ""
echo "Stopping and removing containers..."
echo ""

STOPPED=0
FAILED=0

for container in $ALL_CONTAINERS; do
    echo -n "Processing $container... "
    if docker stop "$container" >/dev/null 2>&1 && docker rm "$container" >/dev/null 2>&1; then
        echo "✓ Removed"
        ((STOPPED++))
    else
        echo "✗ Failed"
        ((FAILED++))
    fi
done

echo ""
echo "========================================="
echo "Cleanup Complete"
echo "========================================="
echo "Stopped and removed: $STOPPED"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "✓ All model containers cleaned up successfully"
else
    echo "⚠ Some containers failed to clean up"
    echo "You may need to run: docker rm -f <container-name>"
fi
