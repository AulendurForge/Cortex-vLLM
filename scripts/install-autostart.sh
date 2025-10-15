#!/bin/bash
#
# Cortex-vLLM Auto-Start Installation Script
# This script installs Cortex-vLLM as a systemd service for automatic startup
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="/opt/cortex-vllm"
SERVICE_USER="cortex"
SERVICE_GROUP="cortex"
SERVICE_FILE="/etc/systemd/system/cortex.service"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Check system requirements
check_requirements() {
    log_info "Checking system requirements..."
    
    # Check if systemd is available
    if ! command -v systemctl &> /dev/null; then
        log_error "systemd is not available on this system"
        exit 1
    fi
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available. Please install Docker Compose plugin."
        exit 1
    fi
    
    log_success "System requirements met"
}

# Create service user
create_service_user() {
    log_info "Creating service user: $SERVICE_USER"
    
    if ! id "$SERVICE_USER" &>/dev/null; then
        useradd -r -s /bin/bash -d "$INSTALL_DIR" -m "$SERVICE_USER"
        log_success "Created user: $SERVICE_USER"
    else
        log_info "User $SERVICE_USER already exists"
    fi
    
    # Add user to docker group
    if ! groups "$SERVICE_USER" | grep -q docker; then
        usermod -aG docker "$SERVICE_USER"
        log_success "Added $SERVICE_USER to docker group"
    else
        log_info "$SERVICE_USER already in docker group"
    fi
}

# Install Cortex files
install_files() {
    log_info "Installing Cortex-vLLM files to $INSTALL_DIR"
    
    # Create installation directory
    mkdir -p "$INSTALL_DIR"
    
    # Copy project files
    cp -r "$PROJECT_ROOT"/* "$INSTALL_DIR/"
    
    # Set ownership
    chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"
    
    # Set permissions
    chmod +x "$INSTALL_DIR/scripts/"*.sh
    
    log_success "Files installed to $INSTALL_DIR"
}

# Install systemd service
install_service() {
    log_info "Installing systemd service..."
    
    # Copy service file
    cp "$PROJECT_ROOT/scripts/cortex.service" "$SERVICE_FILE"
    
    # Update service file with correct paths
    sed -i "s|/opt/cortex-vllm|$INSTALL_DIR|g" "$SERVICE_FILE"
    sed -i "s|cortex|cortex|g" "$SERVICE_FILE"
    
    # Reload systemd
    systemctl daemon-reload
    
    log_success "Systemd service installed"
}

# Enable service
enable_service() {
    log_info "Enabling Cortex service for auto-start..."
    
    systemctl enable cortex.service
    
    log_success "Cortex service enabled for auto-start"
}

# Create log directory
setup_logging() {
    log_info "Setting up logging..."
    
    # Create log directory
    mkdir -p /var/log
    touch /var/log/cortex-startup.log
    chown "$SERVICE_USER:$SERVICE_GROUP" /var/log/cortex-startup.log
    
    log_success "Logging configured"
}

# Test service
test_service() {
    log_info "Testing service installation..."
    
    # Check service status
    if systemctl is-enabled cortex.service &>/dev/null; then
        log_success "Service is enabled"
    else
        log_error "Service is not enabled"
        exit 1
    fi
    
    # Check service file syntax
    if systemctl is-system-running &>/dev/null; then
        log_success "Service file syntax is valid"
    else
        log_warning "Could not validate service file syntax"
    fi
}

# Show usage instructions
show_instructions() {
    log_success "Installation completed successfully!"
    echo ""
    echo -e "${BLUE}Usage Instructions:${NC}"
    echo ""
    echo "1. Start the service:"
    echo "   sudo systemctl start cortex"
    echo ""
    echo "2. Check service status:"
    echo "   sudo systemctl status cortex"
    echo ""
    echo "3. View logs:"
    echo "   sudo journalctl -u cortex -f"
    echo "   tail -f /var/log/cortex-startup.log"
    echo ""
    echo "4. Stop the service:"
    echo "   sudo systemctl stop cortex"
    echo ""
    echo "5. Disable auto-start:"
    echo "   sudo systemctl disable cortex"
    echo ""
    echo -e "${BLUE}Service Configuration:${NC}"
    echo "  Service file: $SERVICE_FILE"
    echo "  Installation: $INSTALL_DIR"
    echo "  User: $SERVICE_USER"
    echo "  Log file: /var/log/cortex-startup.log"
    echo ""
    echo -e "${YELLOW}Note:${NC} The service will automatically start on system boot."
    echo "      Make sure Docker is configured to start on boot as well."
    echo ""
}

# Main installation function
main() {
    log_info "Starting Cortex-vLLM auto-start installation"
    
    check_root
    check_requirements
    create_service_user
    install_files
    install_service
    enable_service
    setup_logging
    test_service
    show_instructions
    
    log_success "Installation completed successfully!"
}

# Run main function
main "$@"
