# Auto-Startup Configuration

This guide explains how to configure Cortex-vLLM to automatically start when the server host machine boots up.

## Overview

Cortex-vLLM can be configured to start automatically using systemd, the standard service manager on modern Linux distributions. This ensures that your LLM inference gateway is always available after system reboots.

## Prerequisites

- Linux system with systemd (Ubuntu 16.04+, CentOS 7+, RHEL 7+, etc.)
- Docker and Docker Compose installed
- Root or sudo access
- Cortex-vLLM project files

## Installation Methods

### Method 1: Automated Installation (Recommended)

Use the provided installation script for easy setup:

```bash
# Navigate to your Cortex-vLLM directory
cd /path/to/Cortex-vLLM

# Run the installation script as root
sudo ./scripts/install-autostart.sh
```

This script will:
- Create a dedicated `cortex` user
- Install Cortex-vLLM to `/opt/cortex-vllm`
- Create and install the systemd service
- Enable auto-startup
- Configure logging

### Method 2: Manual Installation

If you prefer manual installation or need to customize the setup:

#### 1. Create Service User

```bash
# Create dedicated user for Cortex
sudo useradd -r -s /bin/bash -d /opt/cortex-vllm -m cortex

# Add user to docker group
sudo usermod -aG docker cortex
```

#### 2. Install Cortex Files

```bash
# Copy project to system location
sudo cp -r /path/to/Cortex-vLLM /opt/cortex-vllm

# Set ownership
sudo chown -R cortex:cortex /opt/cortex-vllm

# Make scripts executable
sudo chmod +x /opt/cortex-vllm/scripts/*.sh
```

#### 3. Install Systemd Service

```bash
# Copy service file
sudo cp /opt/cortex-vllm/scripts/cortex.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable cortex.service
```

## Service Management

### Starting the Service

```bash
# Start Cortex service
sudo systemctl start cortex

# Check status
sudo systemctl status cortex
```

### Stopping the Service

```bash
# Stop Cortex service
sudo systemctl stop cortex
```

### Viewing Logs

```bash
# View systemd logs
sudo journalctl -u cortex -f

# View application logs
tail -f /var/log/cortex-startup.log

# View Docker Compose logs
cd /opt/cortex-vllm
docker compose logs -f
```

### Service Status

```bash
# Check if service is enabled for auto-start
sudo systemctl is-enabled cortex

# Check if service is running
sudo systemctl is-active cortex

# View detailed status
sudo systemctl status cortex
```

## Configuration

### Service Configuration

The systemd service file is located at `/etc/systemd/system/cortex.service`. Key configuration options:

```ini
[Unit]
Description=Cortex-vLLM Gateway and Admin UI
After=network.target docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=cortex
Group=cortex
WorkingDirectory=/opt/cortex-vllm
ExecStart=/opt/cortex-vllm/scripts/cortex-startup.sh
ExecStop=/opt/cortex-vllm/scripts/cortex-stop.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Environment Variables

You can customize the service by editing the service file and adding environment variables:

```ini
[Service]
Environment=COMPOSE_FILE=/opt/cortex-vllm/docker.compose.prod.yaml
Environment=ENV=prod
Environment=PROFILES=linux,gpu
```

### Startup Script Customization

The startup script (`/opt/cortex-vllm/scripts/cortex-startup.sh`) can be customized for your environment:

- Modify `COMPOSE_FILE` to use production compose file
- Add custom environment variables
- Implement custom health checks
- Add notification mechanisms

## Troubleshooting

### Service Won't Start

1. **Check Docker status:**
   ```bash
   sudo systemctl status docker
   ```

2. **Check service logs:**
   ```bash
   sudo journalctl -u cortex -n 50
   ```

3. **Check application logs:**
   ```bash
   tail -n 50 /var/log/cortex-startup.log
   ```

4. **Test manual startup:**
   ```bash
   sudo -u cortex /opt/cortex-vllm/scripts/cortex-startup.sh
   ```

### Service Starts But Services Are Unhealthy

1. **Check Docker Compose status:**
   ```bash
   cd /opt/cortex-vllm
   docker compose ps
   ```

2. **Check individual service logs:**
   ```bash
   docker compose logs gateway
   docker compose logs postgres
   ```

3. **Check port availability:**
   ```bash
   sudo netstat -tlnp | grep -E ':(3001|8084|5432)'
   ```

### Permission Issues

1. **Check user permissions:**
   ```bash
   id cortex
   groups cortex
   ```

2. **Check Docker socket permissions:**
   ```bash
   ls -la /var/run/docker.sock
   ```

3. **Fix permissions if needed:**
   ```bash
   sudo chown root:docker /var/run/docker.sock
   sudo chmod 660 /var/run/docker.sock
   ```

## Security Considerations

### Service User Isolation

The service runs as a dedicated `cortex` user with minimal privileges:

- No shell access by default
- Limited file system access
- Docker group membership for container management

### File System Protection

The service uses systemd security features:

- `NoNewPrivileges=true` - Prevents privilege escalation
- `PrivateTmp=true` - Isolated temporary directory
- `ProtectSystem=strict` - Read-only system directories
- `ProtectHome=true` - No access to user home directories

### Network Security

- Services bind to specific ports only
- CORS configuration limits access origins
- Internal API key authentication

## Monitoring and Maintenance

### Health Monitoring

Monitor service health using:

```bash
# Service status
sudo systemctl status cortex

# Application health
curl http://localhost:8084/health

# Prometheus metrics
curl http://localhost:9090/metrics
```

### Log Rotation

Configure log rotation to prevent disk space issues:

```bash
# Create logrotate configuration
sudo tee /etc/logrotate.d/cortex << EOF
/var/log/cortex-startup.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 cortex cortex
}
EOF
```

### Backup Considerations

Ensure database backups are configured:

```bash
# Add to crontab for regular backups
0 2 * * * cd /opt/cortex-vllm && docker compose exec -T postgres pg_dump -U cortex cortex > /backups/cortex_$(date +\%Y\%m\%d).sql
```

## Alternative Methods

### Cron-based Startup

For systems without systemd or as an alternative:

```bash
# Add to crontab
@reboot /opt/cortex-vllm/scripts/cortex-startup.sh
```

### Docker Compose Restart Policy

Configure Docker Compose with restart policies:

```yaml
services:
  gateway:
    restart: unless-stopped
  postgres:
    restart: unless-stopped
  redis:
    restart: unless-stopped
```

### Init Scripts

For older systems, create traditional init scripts:

```bash
# Create init script
sudo tee /etc/init.d/cortex << 'EOF'
#!/bin/bash
case "$1" in
    start)
        /opt/cortex-vllm/scripts/cortex-startup.sh
        ;;
    stop)
        /opt/cortex-vllm/scripts/cortex-stop.sh
        ;;
    restart)
        $0 stop
        $0 start
        ;;
esac
EOF

sudo chmod +x /etc/init.d/cortex
sudo update-rc.d cortex defaults
```

## Best Practices

1. **Test the installation** before relying on auto-startup
2. **Monitor logs** regularly for any issues
3. **Keep backups** of your configuration and data
4. **Update regularly** to get security patches
5. **Use production compose file** for production deployments
6. **Configure monitoring** (Prometheus, Grafana) for observability
7. **Set up alerts** for service failures

## Uninstallation

To remove the auto-startup configuration:

```bash
# Stop and disable service
sudo systemctl stop cortex
sudo systemctl disable cortex

# Remove service file
sudo rm /etc/systemd/system/cortex.service

# Reload systemd
sudo systemctl daemon-reload

# Remove installation (optional)
sudo rm -rf /opt/cortex-vllm
sudo userdel cortex
```

## Support

For issues with auto-startup configuration:

1. Check the troubleshooting section above
2. Review logs for error messages
3. Test manual startup to isolate issues
4. Consult the main Cortex-vLLM documentation
5. Open an issue on the GitHub repository
