# Dynamic IP Detection for Cortex-vLLM

## Overview

Cortex-vLLM automatically detects the host machine's LAN IP address and uses it throughout the system for:
1. **CORS configuration** - Allows frontend access from the detected IP
2. **Terminal output** - All URLs shown use the detected IP
3. **Network access** - Enables other devices on the network to connect

## How It Works

### Detection Script (`scripts/detect-ip.sh`)

The script uses a **scoring algorithm** to select the best IP address:

1. **Collects all IPs** from multiple sources:
   - `ip route` (most reliable - shows the IP used for internet routing)
   - `hostname -I` (Linux - lists all IPs)
   - `ifconfig` (macOS/older Linux)
   - Direct interface checks (eth0, enp0s3, etc.)

2. **Filters out unwanted IPs**:
   - Loopback addresses (127.0.0.1)
   - Docker bridge networks (172.17-31.x.x)
   - Link-local addresses (169.254.x.x)

3. **Scores remaining IPs** (higher = better):
   - **100 points**: 192.168.x.x (home/small office networks)
   - **95 points**: 10.x.x.x (corporate networks)
   - **85 points**: 172.16-31.x.x (non-Docker private networks)
   - **50 points**: Public IPs
   - **10 points**: Link-local

4. **Returns highest-scored IP**

### Example Detection

```bash
# Host has these IPs:
# - 127.0.0.1 (loopback) → rejected
# - 172.18.0.1 (Docker bridge) → rejected
# - 192.168.1.181 (LAN) → score: 100 ✓ SELECTED
# - 10.0.0.5 (VPN) → score: 95

# Result: 192.168.1.181
```

## Integration Points

### 1. Makefile

The Makefile detects the IP at runtime:

```makefile
# Detect host IP address dynamically
HOST_IP := $(shell bash scripts/detect-ip.sh 2>/dev/null || echo "localhost")

# Use in all output
@echo "Gateway: http://$(HOST_IP):8084"
```

**Every `make` command** automatically uses the current IP.

### 2. Docker Compose

The detected IP is passed to Docker Compose as an environment variable:

```makefile
DOCKER_COMPOSE = HOST_IP=$(HOST_IP) docker compose -f $(COMPOSE_FILE)
```

Docker Compose uses it to configure CORS:

```yaml
environment:
  CORS_ALLOW_ORIGINS: http://${HOST_IP:-localhost}:3001,http://localhost:3001,http://127.0.0.1:3001
```

This creates a CORS whitelist like:
```
http://192.168.1.181:3001,http://localhost:3001,http://127.0.0.1:3001
```

### 3. Frontend (Next.js)

The frontend **also auto-detects** the gateway URL based on the browser's location:

```typescript
// src/lib/api-clients.ts
export function getGatewayBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;  // e.g., "192.168.1.181"
    return `http://${host}:8084`;
  }
  return 'http://localhost:8084';
}
```

**Result**: Frontend and backend automatically sync on the detected IP!

## Usage Examples

### For Administrators

```bash
# See your host IP and endpoints
make info

# Output:
# Detected Host IP: 192.168.1.181
# Gateway:          http://192.168.1.181:8084
# Admin UI:         http://192.168.1.181:3001
```

### For Network Users

If the host IP is `192.168.1.181`:

1. **Admin UI**: `http://192.168.1.181:3001`
2. **API Endpoint**: `http://192.168.1.181:8084`

The frontend will automatically connect to the correct gateway.

### When IP Changes

If the host's IP address changes (e.g., DHCP renewal):

```bash
# Restart services to detect new IP
make restart

# Verify new IP
make info
```

The new IP will be automatically detected and CORS will be updated.

## Troubleshooting

### "Can't access from other devices"

1. **Verify IP detection**:
   ```bash
   make info
   ```

2. **Check firewall** (allow ports 3001 and 8084):
   ```bash
   # Ubuntu/Debian
   sudo ufw allow 3001/tcp
   sudo ufw allow 8084/tcp
   
   # CentOS/RHEL
   sudo firewall-cmd --add-port=3001/tcp --permanent
   sudo firewall-cmd --add-port=8084/tcp --permanent
   sudo firewall-cmd --reload
   ```

3. **Ensure same network**: Other devices must be on the same LAN

### "Detection shows wrong IP"

If the script detects the wrong IP (e.g., VPN instead of LAN):

**Option 1**: Manually override
```bash
# Set HOST_IP before running make
HOST_IP=192.168.1.181 make up
HOST_IP=192.168.1.181 make info
```

**Option 2**: Edit the script
```bash
# Force a specific IP in scripts/detect-ip.sh
echo "192.168.1.181"  # Add at the start of detect_ip()
```

**Option 3**: Use environment variable
```bash
# Export HOST_IP in your shell
export HOST_IP=192.168.1.181
make up
```

### "Detection script fails"

Fallback to localhost:

```bash
# The script returns "localhost" if detection fails
# Check what's detected:
bash scripts/detect-ip.sh

# If it returns "localhost", manually set:
export HOST_IP=192.168.1.181
make up
```

## Technical Details

### Supported Platforms

- ✅ **Linux** (Ubuntu, Debian, RHEL, CentOS) - Primary support via `ip` command
- ✅ **macOS** - Support via `ifconfig` fallback
- ✅ **Windows WSL2** - Works via Linux detection
- ⚠️ **Windows native** - Limited support, may need manual override

### IP Prioritization Logic

The script prefers IPs in this order:

1. **192.168.x.x** - Home/small office (most common)
2. **10.x.x.x** - Corporate networks
3. **172.16-31.x.x** - Private networks (excluding Docker bridges)
4. **Public IPs** - Cloud/VPS deployments
5. **169.254.x.x** - Link-local (last resort)

### Security Implications

**Automatic CORS Whitelist**:
- The detected IP is automatically added to `CORS_ALLOW_ORIGINS`
- localhost and 127.0.0.1 are always included for local development
- **Production**: Review CORS settings with `make prod-check`

**Network Exposure**:
- By default, services bind to `0.0.0.0` (all interfaces)
- This allows network access - ensure proper firewall rules
- Use reverse proxy with TLS for production deployments

## Advanced Configuration

### Force Specific IP

Create a `.env.local` file:

```bash
# .env.local
HOST_IP=10.1.10.241
```

Then:
```bash
export $(cat .env.local | xargs)
make up
```

### Multiple Networks

If the host has multiple network interfaces:

```bash
# Check all detected IPs
hostname -I

# The script chooses the highest-scored one
# Override if needed:
HOST_IP=10.1.10.241 make up
```

### Docker Desktop (macOS/Windows)

On Docker Desktop, the host network is different:

- **macOS**: Use `host.docker.internal` (special DNS name)
- **Windows**: Similar to macOS
- **Best practice**: Let Cortex run on Linux for production

## Testing

### Verify Detection

```bash
# Test the script directly
bash scripts/detect-ip.sh

# Test within Makefile
make info

# Test with verbose output
bash scripts/detect-ip.sh --verbose
```

### Verify CORS Configuration

After starting:

```bash
# Check what CORS origins are configured
docker exec $(docker compose -f docker.compose.dev.yaml ps -q gateway) \
  printenv CORS_ALLOW_ORIGINS
```

## Summary

✅ **Fully automatic** - No manual IP configuration needed  
✅ **Cross-platform** - Works on Linux, macOS, WSL2  
✅ **Network-aware** - Filters out Docker and loopback IPs  
✅ **Failsafe** - Falls back to localhost if detection fails  
✅ **Override-friendly** - Can manually set HOST_IP if needed  

**For 99% of deployments**: Just run `make quick-start` and it works! 🚀

