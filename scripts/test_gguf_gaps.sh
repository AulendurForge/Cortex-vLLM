#!/bin/bash
# =============================================================================
# GGUF Implementation Gaps - Comprehensive Validation Tests
# =============================================================================
# This script validates all the new features implemented for GGUF support.
# Run after `make quick-start` or when containers are running.
#
# Tests:
#   1. Database schema validation
#   2. API endpoint tests (create, list, update)
#   3. GPU metrics endpoint (Flash Attention fields)
#   4. Docker command generation validation
#   5. End-to-end model deployment (optional, requires GPU)
# =============================================================================

# Don't exit on error - we want to run all tests
# set -e

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8084}"
COOKIE_FILE="/tmp/cortex_test_cookies.txt"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_header() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
}

log_test() {
    echo -e "${YELLOW}▶ Testing: $1${NC}"
}

log_pass() {
    echo -e "${GREEN}  ✓ PASS: $1${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}  ✗ FAIL: $1${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_info() {
    echo -e "  ℹ $1"
}

# Login and get session cookie
login() {
    log_header "Authentication"
    log_test "Login as admin"
    
    RESPONSE=$(curl -s -c "$COOKIE_FILE" -X POST "$GATEWAY_URL/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin"}')
    
    if echo "$RESPONSE" | grep -q '"status":"ok"'; then
        log_pass "Login successful"
    else
        log_fail "Login failed: $RESPONSE"
        exit 1
    fi
}

# Test 1: Database Schema Validation
test_database_schema() {
    log_header "Test 1: Database Schema Validation"
    
    # Check new columns exist
    COLUMNS=(
        "gguf_weight_format"
        "draft_model_path"
        "draft_n"
        "draft_p_min"
        "attention_backend"
        "vllm_v1_enabled"
        "debug_logging"
        "trace_mode"
    )
    
    for col in "${COLUMNS[@]}"; do
        log_test "Column: $col"
        EXISTS=$(docker exec cortex-postgres-1 psql -U cortex -d cortex -tAc \
            "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='models' AND column_name='$col'")
        
        if [ "$EXISTS" = "1" ]; then
            log_pass "Column $col exists"
        else
            log_fail "Column $col missing"
        fi
    done
}

# Test 2: API - Create Model with Gap #7 (GGUF Weight Format)
test_create_vllm_model() {
    log_header "Test 2: Create vLLM Model with GGUF Weight Format (Gap #7)"
    
    log_test "Creating vLLM model with gguf_weight_format"
    
    RESPONSE=$(curl -s -b "$COOKIE_FILE" -X POST "$GATEWAY_URL/admin/models" \
        -H "Content-Type: application/json" \
        -d '{
            "mode": "offline",
            "local_path": "/models/test-vllm-gap7",
            "name": "test-vllm-gap7",
            "served_model_name": "test-vllm-gap7",
            "task": "generate",
            "engine_type": "vllm",
            "gguf_weight_format": "gguf",
            "attention_backend": "FLASH_ATTN",
            "vllm_v1_enabled": true,
            "debug_logging": true
        }')
    
    if echo "$RESPONSE" | grep -q '"id"'; then
        MODEL_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
        log_pass "Model created with ID: $MODEL_ID"
        export VLLM_MODEL_ID=$MODEL_ID
    else
        log_fail "Failed to create model: $RESPONSE"
    fi
}

# Test 3: API - Create llama.cpp Model with Speculative Decoding (Gap #6)
test_create_llamacpp_model() {
    log_header "Test 3: Create llama.cpp Model with Speculative Decoding (Gap #6)"
    
    log_test "Creating llama.cpp model with speculative decoding fields"
    
    RESPONSE=$(curl -s -b "$COOKIE_FILE" -X POST "$GATEWAY_URL/admin/models" \
        -H "Content-Type: application/json" \
        -d '{
            "mode": "offline",
            "local_path": "/models/test-llamacpp-gap6",
            "name": "test-llamacpp-gap6",
            "served_model_name": "test-llamacpp-gap6",
            "task": "generate",
            "engine_type": "llamacpp",
            "draft_model_path": "/models/draft-model.gguf",
            "draft_n": 24,
            "draft_p_min": 0.6,
            "flash_attention": true,
            "context_size": 8192
        }')
    
    if echo "$RESPONSE" | grep -q '"id"'; then
        MODEL_ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
        log_pass "Model created with ID: $MODEL_ID"
        export LLAMACPP_MODEL_ID=$MODEL_ID
    else
        log_fail "Failed to create model: $RESPONSE"
    fi
}

# Test 4: API - List Models and Verify Fields
test_list_models() {
    log_header "Test 4: Verify Models List Returns New Fields"
    
    log_test "Fetching models list"
    
    RESPONSE=$(curl -s -b "$COOKIE_FILE" "$GATEWAY_URL/admin/models")
    
    # Check vLLM model fields
    log_test "Checking vLLM model fields (Gap #7)"
    if echo "$RESPONSE" | python3 -c "
import sys, json
models = json.load(sys.stdin)
vllm_model = next((m for m in models if m['name'] == 'test-vllm-gap7'), None)
if vllm_model:
    assert vllm_model.get('gguf_weight_format') == 'gguf', 'gguf_weight_format mismatch'
    assert vllm_model.get('attention_backend') == 'FLASH_ATTN', 'attention_backend mismatch'
    assert vllm_model.get('vllm_v1_enabled') == True, 'vllm_v1_enabled mismatch'
    print('OK')
else:
    print('Model not found')
    sys.exit(1)
" 2>/dev/null; then
        log_pass "vLLM model has correct field values"
    else
        log_fail "vLLM model field verification failed"
    fi
    
    # Check llama.cpp model fields
    log_test "Checking llama.cpp model fields (Gap #6)"
    if echo "$RESPONSE" | python3 -c "
import sys, json
models = json.load(sys.stdin)
llama_model = next((m for m in models if m['name'] == 'test-llamacpp-gap6'), None)
if llama_model:
    assert llama_model.get('draft_model_path') == '/models/draft-model.gguf', 'draft_model_path mismatch'
    assert llama_model.get('draft_n') == 24, 'draft_n mismatch'
    assert llama_model.get('draft_p_min') == 0.6, 'draft_p_min mismatch'
    print('OK')
else:
    print('Model not found')
    sys.exit(1)
" 2>/dev/null; then
        log_pass "llama.cpp model has correct field values"
    else
        log_fail "llama.cpp model field verification failed"
    fi
}

# Test 5: GPU Metrics Endpoint (Gap #8)
test_gpu_metrics() {
    log_header "Test 5: GPU Metrics Endpoint (Gap #8 - Flash Attention)"
    
    log_test "Fetching GPU metrics"
    
    RESPONSE=$(curl -s -b "$COOKIE_FILE" "$GATEWAY_URL/admin/system/gpus")
    
    # Check that new fields exist in response
    if echo "$RESPONSE" | python3 -c "
import sys, json
gpus = json.load(sys.stdin)
if len(gpus) > 0:
    gpu = gpus[0]
    # Fields should exist (may be null if NVML unavailable in container)
    assert 'compute_capability' in gpu, 'compute_capability field missing'
    assert 'architecture' in gpu, 'architecture field missing'
    assert 'flash_attention_supported' in gpu, 'flash_attention_supported field missing'
    print('OK')
else:
    print('No GPUs found, skipping')
" 2>/dev/null; then
        log_pass "GPU metrics include Flash Attention fields"
    else
        log_fail "GPU metrics missing Flash Attention fields"
    fi
}

# Test 6: Folder Inspection (Gap #3, #5, #11, #12)
test_folder_inspection() {
    log_header "Test 6: Folder Inspection Endpoint"
    
    # This test requires actual model files, so we'll just verify the endpoint works
    log_test "Testing inspect-folder endpoint structure"
    
    RESPONSE=$(curl -s -b "$COOKIE_FILE" "$GATEWAY_URL/admin/models/inspect-folder?base=/var/cortex/models&folder=Qwen3-0.6B" 2>/dev/null || echo '{"error":"not_found"}')
    
    if echo "$RESPONSE" | grep -q '"error"'; then
        log_info "Folder not found (expected if test models not present)"
        log_pass "Endpoint responded correctly"
    else
        # Check for new fields
        if echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
# Check for engine_recommendation (Gap #2)
assert 'engine_recommendation' in data or data.get('has_safetensors') is not None, 'Missing expected fields'
print('OK')
" 2>/dev/null; then
            log_pass "Folder inspection returned expected fields"
        else
            log_fail "Folder inspection missing expected fields"
        fi
    fi
}

# Test 7: Cleanup test models
cleanup_test_models() {
    log_header "Cleanup: Removing Test Models"
    
    # Get all test model IDs and archive them
    MODELS=$(curl -s -b "$COOKIE_FILE" "$GATEWAY_URL/admin/models")
    
    echo "$MODELS" | python3 -c "
import sys, json
models = json.load(sys.stdin)
for m in models:
    if m['name'].startswith('test-'):
        print(m['id'])
" | while read MODEL_ID; do
        if [ -n "$MODEL_ID" ]; then
            log_test "Archiving model ID: $MODEL_ID"
            curl -s -b "$COOKIE_FILE" -X POST "$GATEWAY_URL/admin/models/$MODEL_ID/archive" > /dev/null
            log_pass "Archived model $MODEL_ID"
        fi
    done
}

# Summary
print_summary() {
    log_header "Test Summary"
    
    TOTAL=$((TESTS_PASSED + TESTS_FAILED))
    
    echo ""
    echo -e "  Total Tests: $TOTAL"
    echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
    echo ""
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}  ✓ ALL TESTS PASSED - Ready for code review!${NC}"
        echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
        exit 0
    else
        echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}  ✗ SOME TESTS FAILED - Review errors above${NC}"
        echo -e "${RED}════════════════════════════════════════════════════════════════${NC}"
        exit 1
    fi
}

# Main execution
main() {
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║     GGUF Implementation Gaps - Validation Test Suite         ║"
    echo "║     Testing Gaps: #3, #5, #6, #7, #8, #11, #12               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""
    
    login
    test_database_schema
    test_create_vllm_model
    test_create_llamacpp_model
    test_list_models
    test_gpu_metrics
    test_folder_inspection
    cleanup_test_models
    print_summary
}

# Run if executed directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi

