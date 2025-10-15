#!/bin/bash
#
# Cortex-vLLM Startup Script
# This script starts Cortex-vLLM using Docker Compose with proper error handling
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${PROJECT_ROOT}/docker.compose.dev.yaml"
LOG_FILE="/var/log/cortex-startup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}$(date '+%Y-%m-%d %H:%M:%S') - ERROR: $1${NC}" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}$(date '+%Y-%m-%d %H:%M:%S') - SUCCESS: $1${NC}" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}$(date '+%Y-%m-%d %H:%M:%S') - INFO: $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}$(date '+%Y-%m-%d %H:%M:%S') - WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    log_error "This script should not be run as root. Please run as a regular user with sudo privileges."
    exit 1
fi

# Check if Docker is installed and running
check_docker() {
    log_info "Checking Docker installation..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running. Please start Docker first."
        exit 1
    fi
    
    log_success "Docker is installed and running"
}

# Check if Docker Compose is available
check_docker_compose() {
    log_info "Checking Docker Compose..."
    
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available. Please install Docker Compose plugin."
        exit 1
    fi
    
    log_success "Docker Compose is available"
}

# Check if compose file exists
check_compose_file() {
    log_info "Checking compose file..."
    
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_error "Compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    log_success "Compose file found: $COMPOSE_FILE"
}

# Detect host IP
detect_host_ip() {
    log_info "Detecting host IP address..."
    
    if [[ -f "${PROJECT_ROOT}/scripts/detect-ip.sh" ]]; then
        HOST_IP=$(bash "${PROJECT_ROOT}/scripts/detect-ip.sh" 2>/dev/null || echo "localhost")
    else
        # Fallback IP detection
        HOST_IP=$(ip route get 1.1.1.1 | awk '{print $7; exit}' 2>/dev/null || echo "localhost")
    fi
    
    log_success "Detected host IP: $HOST_IP"
    export HOST_IP
}

# Wait for Docker daemon to be ready
wait_for_docker() {
    log_info "Waiting for Docker daemon to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if docker info &> /dev/null; then
            log_success "Docker daemon is ready"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts: Docker daemon not ready, waiting 2 seconds..."
        sleep 2
        ((attempt++))
    done
    
    log_error "Docker daemon did not become ready within $((max_attempts * 2)) seconds"
    exit 1
}

# Start Cortex services
start_cortex() {
    log_info "Starting Cortex-vLLM services..."
    
    cd "$PROJECT_ROOT"
    
    # Set up environment
    export HOST_IP="${HOST_IP:-localhost}"
    
    # Start services
    if docker compose -f "$COMPOSE_FILE" up -d; then
        log_success "Cortex services started successfully"
    else
        log_error "Failed to start Cortex services"
        exit 1
    fi
}

# Wait for services to be healthy
wait_for_services() {
    log_info "Waiting for services to be healthy..."
    
    local max_attempts=60
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -sf "http://${HOST_IP}:8084/health" &> /dev/null; then
            log_success "Gateway service is healthy"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts: Services not ready, waiting 5 seconds..."
        sleep 5
        ((attempt++))
    done
    
    log_warning "Services did not become healthy within $((max_attempts * 5)) seconds"
    log_info "Check logs with: docker compose -f $COMPOSE_FILE logs"
}

# Main execution
main() {
    log_info "Starting Cortex-vLLM startup script"
    log_info "Project root: $PROJECT_ROOT"
    log_info "Compose file: $COMPOSE_FILE"
    
    # Run checks
    check_docker
    wait_for_docker
    check_docker_compose
    check_compose_file
    detect_host_ip
    
    # Start services
    start_cortex
    wait_for_services
    
    log_success "Cortex-vLLM startup completed successfully"
    log_info "Admin UI: http://${HOST_IP}:3001"
    log_info "Gateway: http://${HOST_IP}:8084"
    log_info "Prometheus: http://${HOST_IP}:9090"
    
    exit 0
}

# Handle script interruption
trap 'log_error "Script interrupted"; exit 130' INT TERM

# Run main function
main "$@"
