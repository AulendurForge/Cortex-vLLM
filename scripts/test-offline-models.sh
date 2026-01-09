#!/bin/bash
# Test script to validate offline model paths and container startup
# Usage: ./scripts/test-offline-models.sh [model_id] [model_id2] ...

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get gateway URL from env or default
GATEWAY_URL="${CORTEX_GATEWAY_URL:-http://localhost:8084}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-admin}"

echo -e "${BLUE}=== Cortex Offline Model Validation Test ===${NC}\n"

# Function to login and get session cookie
login() {
    echo -e "${YELLOW}Logging in as ${ADMIN_USER}...${NC}"
    RESPONSE=$(curl -s -c /tmp/cortex_cookies.txt -X POST "${GATEWAY_URL}/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\"}")
    
    if echo "$RESPONSE" | grep -q '"status":"ok"'; then
        echo -e "${GREEN}✓ Login successful${NC}\n"
        return 0
    else
        echo -e "${RED}✗ Login failed: ${RESPONSE}${NC}\n"
        return 1
    fi
}

# Function to make authenticated API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [ -n "$data" ]; then
        curl -s -b /tmp/cortex_cookies.txt -X "$method" "${GATEWAY_URL}${endpoint}" \
            -H "Content-Type: application/json" \
            -d "$data"
    else
        curl -s -b /tmp/cortex_cookies.txt -X "$method" "${GATEWAY_URL}${endpoint}"
    fi
}

# Function to test a single model
test_model() {
    local model_id=$1
    echo -e "${BLUE}--- Testing Model ID: ${model_id} ---${NC}"
    
    # Get model details
    echo -e "${YELLOW}Fetching model details...${NC}"
    MODEL_DATA=$(api_call "GET" "/admin/models/${model_id}")
    
    if echo "$MODEL_DATA" | grep -q '"id"'; then
        MODEL_NAME=$(echo "$MODEL_DATA" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
        LOCAL_PATH=$(echo "$MODEL_DATA" | grep -o '"local_path":"[^"]*"' | cut -d'"' -f4 || echo "")
        ENGINE_TYPE=$(echo "$MODEL_DATA" | grep -o '"engine_type":"[^"]*"' | cut -d'"' -f4 || echo "vllm")
        STATE=$(echo "$MODEL_DATA" | grep -o '"state":"[^"]*"' | cut -d'"' -f4)
        
        echo -e "  Name: ${MODEL_NAME}"
        echo -e "  Local Path: ${LOCAL_PATH:-<none>}"
        echo -e "  Engine: ${ENGINE_TYPE}"
        echo -e "  Current State: ${STATE}"
        
        # Check if model has local_path (offline model)
        if [ -z "$LOCAL_PATH" ]; then
            echo -e "${YELLOW}  ⚠ Model has no local_path (online model) - skipping path validation${NC}\n"
            return 0
        fi
        
        # Get models directory from config
        echo -e "${YELLOW}Checking model path...${NC}"
        BASE_DIR_RESP=$(api_call "GET" "/admin/models/base-dir")
        BASE_DIR=$(echo "$BASE_DIR_RESP" | grep -o '"base_dir":"[^"]*"' | cut -d'"' -f4 || echo "/var/cortex/models")
        
        # Construct full path (assuming BASE_DIR is container path, need host path)
        # For testing, we'll check if path validation endpoint exists or check logs
        echo -e "  Base Directory: ${BASE_DIR}"
        echo -e "  Model Path: ${LOCAL_PATH}"
        
        # Test 1: Try to start the model (this will trigger path validation)
        echo -e "\n${YELLOW}Test 1: Attempting to start model (path validation)...${NC}"
        
        # Stop model first if running
        if [ "$STATE" = "running" ]; then
            echo -e "  Stopping model first..."
            api_call "POST" "/admin/models/${model_id}/stop" > /dev/null
            sleep 2
        fi
        
        # Attempt start
        START_RESPONSE=$(api_call "POST" "/admin/models/${model_id}/start")
        
        if echo "$START_RESPONSE" | grep -q '"status":"running"'; then
            echo -e "${GREEN}  ✓ Model started successfully${NC}"
            
            # Wait a moment and check if still running
            sleep 5
            MODEL_DATA=$(api_call "GET" "/admin/models/${model_id}")
            NEW_STATE=$(echo "$MODEL_DATA" | grep -o '"state":"[^"]*"' | cut -d'"' -f4)
            
            if [ "$NEW_STATE" = "running" ]; then
                echo -e "${GREEN}  ✓ Model is running (verified)${NC}"
                
                # Get container logs to verify
                echo -e "\n${YELLOW}Test 2: Checking container logs...${NC}"
                LOGS=$(api_call "GET" "/admin/models/${model_id}/logs?diagnose=true")
                
                if echo "$LOGS" | grep -q '"logs"'; then
                    LOG_CONTENT=$(echo "$LOGS" | grep -o '"logs":"[^"]*"' | cut -d'"' -f4 || echo "")
                    if echo "$LOG_CONTENT" | grep -qi "error\|failed\|exception"; then
                        echo -e "${RED}  ✗ Logs contain errors:${NC}"
                        echo "$LOG_CONTENT" | grep -i "error\|failed\|exception" | head -5
                    else
                        echo -e "${GREEN}  ✓ No errors in logs${NC}"
                    fi
                fi
                
                # Test 3: Check model readiness
                echo -e "\n${YELLOW}Test 3: Checking model readiness...${NC}"
                READINESS=$(api_call "GET" "/admin/models/${model_id}/readiness")
                READINESS_STATUS=$(echo "$READINESS" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "")
                
                if [ "$READINESS_STATUS" = "ready" ]; then
                    echo -e "${GREEN}  ✓ Model is ready to serve requests${NC}"
                else
                    echo -e "${YELLOW}  ⚠ Model readiness: ${READINESS_STATUS}${NC}"
                fi
                
                # Stop model
                echo -e "\n${YELLOW}Stopping model...${NC}"
                api_call "POST" "/admin/models/${model_id}/stop" > /dev/null
                echo -e "${GREEN}  ✓ Model stopped${NC}"
                
            else
                echo -e "${RED}  ✗ Model failed after start (state: ${NEW_STATE})${NC}"
                
                # Get logs for diagnosis
                LOGS=$(api_call "GET" "/admin/models/${model_id}/logs?diagnose=true")
                echo -e "\n${YELLOW}Container logs:${NC}"
                echo "$LOGS" | head -50
            fi
            
        elif echo "$START_RESPONSE" | grep -q "path not found\|not found\|Model path"; then
            echo -e "${RED}  ✗ Path validation failed:${NC}"
            echo "$START_RESPONSE" | grep -o '"detail":"[^"]*"' | cut -d'"' -f4 | head -10
            echo -e "\n${YELLOW}  This indicates the model path does not exist or is invalid.${NC}"
            echo -e "${YELLOW}  Check:${NC}"
            echo -e "    - Path exists in models directory"
            echo -e "    - CORTEX_MODELS_DIR configuration"
            echo -e "    - Model files are in expected location"
            
        elif echo "$START_RESPONSE" | grep -q '"status":"failed"'; then
            echo -e "${RED}  ✗ Model start failed:${NC}"
            echo "$START_RESPONSE"
            
            # Get logs
            LOGS=$(api_call "GET" "/admin/models/${model_id}/logs?diagnose=true")
            if echo "$LOGS" | grep -q '"diagnosis"'; then
                echo -e "\n${YELLOW}Diagnosis:${NC}"
                echo "$LOGS" | grep -A 20 '"diagnosis"'
            fi
            
        else
            echo -e "${RED}  ✗ Unexpected response:${NC}"
            echo "$START_RESPONSE"
        fi
        
    else
        echo -e "${RED}✗ Failed to fetch model: ${MODEL_DATA}${NC}"
    fi
    
    echo -e "\n"
}

# Function to list all offline models
list_offline_models() {
    echo -e "${BLUE}--- Listing All Offline Models ---${NC}\n"
    
    MODELS=$(api_call "GET" "/admin/models")
    
    # Extract model IDs with local_path
    echo "$MODELS" | grep -o '"id":[0-9]*' | cut -d':' -f2 | while read -r model_id; do
        MODEL_DATA=$(api_call "GET" "/admin/models/${model_id}")
        LOCAL_PATH=$(echo "$MODEL_DATA" | grep -o '"local_path":"[^"]*"' | cut -d'"' -f4 || echo "")
        
        if [ -n "$LOCAL_PATH" ]; then
            MODEL_NAME=$(echo "$MODEL_DATA" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
            echo -e "  ${GREEN}ID: ${model_id}${NC} - ${MODEL_NAME} (${LOCAL_PATH})"
        fi
    done
    echo ""
}

# Main execution
main() {
    # Login first
    if ! login; then
        echo -e "${RED}Failed to login. Check credentials and gateway URL.${NC}"
        exit 1
    fi
    
    # If model IDs provided, test those
    if [ $# -gt 0 ]; then
        for model_id in "$@"; do
            test_model "$model_id"
        done
    else
        # Otherwise, list all offline models and ask which to test
        list_offline_models
        echo -e "${YELLOW}No model IDs provided.${NC}"
        echo -e "Usage: $0 [model_id] [model_id2] ..."
        echo -e "Or run: $0 \$(docker exec cortex-gateway-1 python3 -c \"from src.models import Model; from src.main import SessionLocal; import asyncio; async def f(): async with SessionLocal() as s: from sqlalchemy import select; r = await s.execute(select(Model).where(Model.local_path != None)); print(' '.join(str(m.id) for m in r.scalars().all()))\"; asyncio.run(f()))"
    fi
    
    # Cleanup
    rm -f /tmp/cortex_cookies.txt
}

main "$@"

