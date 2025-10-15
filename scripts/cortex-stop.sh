#!/bin/bash
#
# Cortex-vLLM Stop Script
# This script stops Cortex-vLLM services gracefully
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

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    log_error "This script should not be run as root. Please run as a regular user with sudo privileges."
    exit 1
fi

# Stop Cortex services
stop_cortex() {
    log_info "Stopping Cortex-vLLM services..."
    
    cd "$PROJECT_ROOT"
    
    # Stop services gracefully
    if docker compose -f "$COMPOSE_FILE" down; then
        log_success "Cortex services stopped successfully"
    else
        log_error "Failed to stop Cortex services"
        exit 1
    fi
}

# Main execution
main() {
    log_info "Starting Cortex-vLLM stop script"
    log_info "Project root: $PROJECT_ROOT"
    log_info "Compose file: $COMPOSE_FILE"
    
    stop_cortex
    
    log_success "Cortex-vLLM stop completed successfully"
    exit 0
}

# Handle script interruption
trap 'log_error "Script interrupted"; exit 130' INT TERM

# Run main function
main "$@"
