# Administrator Setup Guide for Cortex-vLLM

## 🎯 Quick Start (5 Minutes)

**For new administrators - no configuration needed!**

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd Cortex-vLLM

# 2. Start everything
make quick-start

# 3. Access at the IP shown in output
# Example: http://192.168.1.181:3001/login
# Username: admin
# Password: admin
```

**That's it!** The system automatically:
- ✅ Detects your host machine's IP address
- ✅ Configures CORS for network access
- ✅ Sets up the database
- ✅ Creates admin user
- ✅ Starts all services

---

## ⚙️ What Gets Configured Automatically

### 1. **IP Address Detection** (No Manual Config Needed!)

**The system automatically detects your LAN IP and configures:**

```bash
# When you run: make up
# System detects: 192.168.1.181 (example)
# Automatically sets:
# - CORS_ALLOW_ORIGINS=http://192.168.1.181:3001,http://localhost:3001,http://127.0.0.1:3001
# - All URLs in output use your real IP
# - Frontend connects to correct gateway IP
```

**To verify your detected IP:**
```bash
make ip      # Shows IP prominently
make info    # Shows full configuration
```

### 2. **CORS Configuration** (Automatic!)

**How it works:**
1. Makefile runs `scripts/detect-ip.sh`
2. Detected IP is passed to Docker Compose: `HOST_IP=192.168.1.181`
3. Docker Compose injects into gateway environment: `CORS_ALLOW_ORIGINS=http://${HOST_IP}:3001,...`
4. Gateway allows requests from your network!

**No manual CORS configuration required!**

### 3. **Network Access** (Works Out of the Box!)

After running `make quick-start`, anyone on your network can access:
- **Admin UI**: `http://YOUR_HOST_IP:3001`
- **API Gateway**: `http://YOUR_HOST_IP:8084`

The frontend automatically detects the gateway URL based on which IP the user accesses it from.

---

## 📋 Pre-Installation Checklist

### Required (Must Have)
- [ ] Docker installed (v20.10+)
- [ ] Docker Compose installed (v2.0+)
- [ ] At least 8GB RAM available
- [ ] At least 20GB free disk space

### Optional (For Enhanced Features)
- [ ] NVIDIA GPU + drivers (for GPU model serving)
- [ ] NVIDIA Container Toolkit (for GPU access)
- [ ] Static IP on host machine (recommended for production)

### Verify Prerequisites
```bash
make install-deps
```

---

## 🔧 Configuration Files (Optional Overrides Only)

### Directory Structure
```
Cortex-vLLM/
├── docker.compose.dev.yaml   ← Main config (edit if needed)
├── docker.compose.prod.yaml  ← Production config
├── backend/
│   └── .env.dev              ← Optional overrides (create if needed)
├── Makefile                  ← Admin commands
└── scripts/
    └── detect-ip.sh          ← IP detection logic
```

### When You DON'T Need to Edit Config Files

**Never edit for:**
- ✅ IP addresses (auto-detected)
- ✅ CORS settings (auto-configured)
- ✅ Basic usage (defaults work)
- ✅ Development mode (pre-configured)

### When You MIGHT Edit Config Files

**Only edit `docker.compose.dev.yaml` if you need to:**
- Change port mappings (if ports conflict)
- Modify storage paths for models
- Change database credentials
- Add environment-specific settings

**Example - Change Ports:**
```yaml
# docker.compose.dev.yaml
gateway:
  ports: ["8085:8084"]  # Changed from 8084 to 8085

frontend:
  ports: ["3002:3001"]  # Changed from 3001 to 3002
```

Then restart:
```bash
make restart
make info  # See new URLs
```

---

## 🚀 Step-by-Step First Time Setup

### Step 1: Install Prerequisites

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin make git

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add your user to docker group (optional - avoid sudo)
sudo usermod -aG docker $USER
# Log out and back in for this to take effect
```

### Step 2: Clone Repository

```bash
git clone <your-repo-url>
cd Cortex-vLLM
```

### Step 3: Verify System Can Detect IP

```bash
# Test IP detection
bash scripts/detect-ip.sh

# Should show your LAN IP, e.g., 192.168.1.181
# NOT localhost
# NOT a Docker bridge IP (172.17-31.x.x)
```

**If it shows "localhost":**
- Your network interface might not be configured
- Set manually: `export HOST_IP=192.168.1.181`
- See troubleshooting below

### Step 4: Start Cortex

```bash
make quick-start
```

**What happens:**
1. Detects IP: `192.168.1.181`
2. Passes to Docker Compose: `HOST_IP=192.168.1.181`
3. Builds containers
4. Starts all services
5. Configures CORS automatically
6. Creates admin user
7. Shows you the URLs

### Step 5: Access Admin UI

```bash
# The output will show something like:
# ✓ Cortex is ready!
# Login at: http://192.168.1.181:3001/login (admin/admin)

# Open that URL in your browser
# Use the IP shown, NOT localhost
```

### Step 6: Create API Key

```bash
# Option 1: Via Makefile
make login      # Enter admin/admin
make create-key # Copy the token

# Option 2: Via Admin UI
# Login → API Keys → Create New Key
```

### Step 7: Test API

```bash
# Get your detected IP
make ip

# Test the API (replace YOUR_TOKEN and YOUR_IP)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://YOUR_IP:8084/v1/chat/completions \
  -d '{"model":"test","messages":[{"role":"user","content":"Hello!"}]}'
```

---

## 🔍 Verifying Everything is Configured Correctly

### Check 1: Services Running

```bash
make status

# Should show:
# - gateway (Up)
# - frontend (Up)
# - postgres (Up, healthy)
# - redis (Up)
# - prometheus (Up)
```

### Check 2: Detected IP is Correct

```bash
make ip

# Should show your LAN IP, not localhost
# Example: 192.168.1.181
```

### Check 3: CORS is Configured

```bash
# Check CORS in gateway container
docker exec cortex-gateway-1 printenv CORS_ALLOW_ORIGINS

# Should show:
# http://192.168.1.181:3001,http://localhost:3001,http://127.0.0.1:3001
# (with YOUR actual IP, not localhost at the start)
```

### Check 4: Health Checks Pass

```bash
make health

# Should show:
# - Gateway Health: {"status":"ok"}
# - Containers: All running
# - Prometheus: Ready
```

### Check 5: Network Access Works

```bash
# From host machine
curl http://192.168.1.181:8084/health

# Should return: {"status":"ok"}

# From another device on your network (same command)
curl http://192.168.1.181:8084/health

# Should also work!
```

---

## 🛠 Advanced Configuration (Optional)

### Override Detected IP (If Needed)

If IP detection picks the wrong interface:

```bash
# Method 1: Environment variable (temporary)
HOST_IP=10.1.10.241 make up
HOST_IP=10.1.10.241 make info

# Method 2: Export for session (persistent)
export HOST_IP=10.1.10.241
make up
make info

# Method 3: Create .env file (permanent)
echo "HOST_IP=10.1.10.241" > .env.local
export $(cat .env.local | xargs)
make up
```

### Change Storage Paths

Edit `docker.compose.dev.yaml`:

```yaml
environment:
  CORTEX_MODELS_DIR_HOST: /path/to/your/models  # Host path
  HF_CACHE_DIR_HOST: /path/to/hf/cache         # Host cache path
```

Then:
```bash
make restart
```

### Enable Rate Limiting

Edit `docker.compose.dev.yaml`:

```yaml
gateway:
  environment:
    RATE_LIMIT_ENABLED: "true"
    RATE_LIMIT_RPS: 10
    RATE_LIMIT_BURST: 20
```

Then:
```bash
make restart
```

### Production Deployment

```bash
# 1. Edit docker.compose.prod.yaml
# - Set GATEWAY_DEV_ALLOW_ALL_KEYS=false
# - Set strong INTERNAL_VLLM_API_KEY
# - Configure TLS reverse proxy

# 2. Pre-flight check
make prod-check

# 3. Start in production mode
make up ENV=prod

# 4. Change default admin password immediately!
# Login → Users → Edit admin user → Change password
```

---

## 🐛 Troubleshooting

### "Can't access from another device"

**Check IP detection:**
```bash
make ip

# Use the IP shown here in your browser
# NOT "localhost"
```

**Check CORS configuration:**
```bash
docker exec cortex-gateway-1 printenv CORS_ALLOW_ORIGINS

# Should include your detected IP
```

**Check firewall:**
```bash
# Ubuntu/Debian - allow ports
sudo ufw status
sudo ufw allow 3001/tcp
sudo ufw allow 8084/tcp

# CentOS/RHEL
sudo firewall-cmd --list-all
sudo firewall-cmd --add-port=3001/tcp --permanent
sudo firewall-cmd --add-port=8084/tcp --permanent
sudo firewall-cmd --reload
```

### "Wrong IP detected"

If the script detects a VPN or wrong interface:

```bash
# See all available IPs
ip addr show | grep 'inet '

# Identify the correct one (usually 192.168.x.x or 10.x.x.x)

# Override detection
export HOST_IP=192.168.1.181
make restart
make ip  # Verify
```

### "Services won't start"

```bash
# Full diagnostic
make status       # What's running?
make logs        # Any errors?
make health      # Services healthy?

# Nuclear option - reset everything
make clean-all
make quick-start
```

### "Frontend shows but API calls fail"

**Check gateway is running:**
```bash
make status
make logs-gateway
```

**Test gateway directly:**
```bash
curl http://192.168.1.181:8084/health
```

**Check CORS:**
```bash
# From browser console (F12), check if you see CORS errors
# If yes, verify CORS config:
docker exec cortex-gateway-1 printenv CORS_ALLOW_ORIGINS
```

---

## 🔒 Security Checklist (Production)

### Before Going to Production

```bash
# Run pre-flight check
make prod-check
```

**Must configure:**

1. **Disable Dev Mode**
   ```yaml
   # docker.compose.prod.yaml
   GATEWAY_DEV_ALLOW_ALL_KEYS: "false"
   ```

2. **Set Strong API Key**
   ```yaml
   INTERNAL_VLLM_API_KEY: "your-strong-random-key-here"
   ```

3. **Restrict CORS** (if needed)
   ```yaml
   # If you want to restrict to specific IPs only:
   CORS_ALLOW_ORIGINS: http://192.168.1.181:3001
   ```

4. **Change Default Admin Password**
   - Login → Users → Edit admin → Set new password

5. **Enable TLS**
   - Set up nginx or traefik reverse proxy
   - Get SSL certificate (Let's Encrypt)

6. **Set Up Backups**
   ```bash
   # Add to crontab
   crontab -e
   # Add: 0 2 * * * cd /path/to/Cortex-vLLM && make db-backup
   ```

7. **Configure Firewall**
   - Only allow ports 3001 and 8084 from trusted networks
   - Block all other incoming traffic

---

## 📊 Monitoring Your Deployment

### Daily Checks

```bash
# Morning routine
make status   # Services up?
make health   # Everything healthy?

# If issues found
make logs     # Check for errors
```

### Weekly Maintenance

```bash
# Backup database
make db-backup

# Review logs for errors
make logs-gateway | grep ERROR

# Check disk space
df -h
```

### Monthly Tasks

```bash
# Clean unused Docker resources
make prune

# Review security settings
make prod-check

# Update containers (if new versions available)
make down
git pull
make up
```

---

## 🌐 Network Configuration Details

### How Dynamic IP Detection Works

```mermaid
graph LR
    A[make up] --> B[detect-ip.sh]
    B --> C[Scan all interfaces]
    C --> D[Filter out Docker/loopback]
    D --> E[Score remaining IPs]
    E --> F[Select best: 192.168.1.181]
    F --> G[Export HOST_IP]
    G --> H[Docker Compose]
    H --> I[Gateway CORS Config]
```

### IP Scoring Algorithm

The system prefers IPs in this order:

1. **192.168.x.x** → Score: 100 (home/small office)
2. **10.x.x.x** → Score: 95 (corporate network)
3. **172.16-31.x.x** → Score: 85 (private, non-Docker)
4. **Public IPs** → Score: 50
5. **Link-local** → Score: 10

**Rejected IPs:**
- 127.0.0.1 (loopback)
- 172.17-31.x.x (Docker bridges)

### Frontend Auto-Detection

The Next.js frontend automatically detects which IP the user accessed it from:

```javascript
// User accesses: http://192.168.1.181:3001
// Frontend detects: window.location.hostname = "192.168.1.181"
// Calls gateway at: http://192.168.1.181:8084
```

**Result**: Works seamlessly from any device!

---

## 🎓 Common Administrative Tasks

### Adding a New User

```bash
# Option 1: Via Admin UI
# Login → Users → Create User

# Option 2: Via API
curl -X POST http://192.168.1.181:8084/admin/users \
  -b cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"username":"john","password":"secret","role":"User"}'
```

### Creating API Keys for Users

```bash
# Via Admin UI
# Login → API Keys → Create Key → Assign to User

# Save the token immediately (shown only once!)
```

### Deploying a Model

```bash
# Via Admin UI
# Login → Models → Create Model
# - Choose engine (vLLM or llama.cpp)
# - Configure parameters
# - Click "Start"

# Monitor startup
make logs | grep model
```

### Backing Up Data

```bash
# Manual backup
make db-backup

# Automated backups (daily at 2 AM)
crontab -e
# Add:
0 2 * * * cd /path/to/Cortex-vLLM && make db-backup
```

### Restoring from Backup

```bash
# List available backups
ls -lh backups/

# Restore
make db-restore BACKUP_FILE=backups/cortex_backup_20251004_143000.sql

# Restart services
make restart
```

---

## 📱 Multi-Device Access

### Scenario 1: Access from Host Machine

```
Browser on host: http://192.168.1.181:3001 ✅
Browser on host: http://localhost:3001 ✅ (also works)
```

### Scenario 2: Access from Other Devices

```
Laptop on network: http://192.168.1.181:3001 ✅
Tablet on network: http://192.168.1.181:3001 ✅
Phone on network:  http://192.168.1.181:3001 ✅

Using localhost:  ❌ Won't work (localhost is device-local)
```

### Scenario 3: API Calls from Applications

```python
# Python application on the network
import requests

# Use the host IP
response = requests.post(
    "http://192.168.1.181:8084/v1/chat/completions",
    headers={"Authorization": "Bearer YOUR_TOKEN"},
    json={
        "model": "your-model",
        "messages": [{"role": "user", "content": "Hello"}]
    }
)
```

---

## 🎯 Configuration Validation Commands

### Complete Health Check

```bash
# 1. Check IP detection
make ip
# Expected: Shows your LAN IP (192.168.x.x or 10.x.x.x)

# 2. Check services
make status
# Expected: All containers "Up"

# 3. Check health endpoints
make health
# Expected: Gateway returns {"status":"ok"}

# 4. Verify CORS
docker exec cortex-gateway-1 printenv CORS_ALLOW_ORIGINS
# Expected: Includes your detected IP

# 5. Test from browser
# Open: http://YOUR_IP:3001
# Expected: Login page loads

# 6. Test API
curl http://YOUR_IP:8084/health
# Expected: {"status":"ok"}
```

---

## 📝 Important Notes for Administrators

### ✅ DO This

1. **Always use the detected IP** shown by `make ip`
2. **Run `make db-backup` before making changes**
3. **Check `make health` regularly**
4. **Review logs** with `make logs` if issues occur
5. **Use `make help`** to see all available commands

### ❌ DON'T Do This

1. **Don't edit CORS_ALLOW_ORIGINS manually** - it's auto-configured
2. **Don't use "localhost" for network access** - use the detected IP
3. **Don't skip backups** before database changes
4. **Don't run `make db-reset`** without backing up first
5. **Don't expose to internet** without TLS and proper security

---

## 🚨 If Something Goes Wrong

### Quick Recovery

```bash
# Stop everything
make down

# Clean everything
make clean-all

# Start fresh
make quick-start

# Should work now!
```

### Get Help

```bash
# Check what IP was detected
make ip

# Check logs for errors  
make logs-gateway | tail -100

# Check CORS configuration
docker exec cortex-gateway-1 printenv CORS_ALLOW_ORIGINS

# Test connectivity
curl -v http://192.168.1.181:8084/health
```

### Contact Support

If issues persist:
1. Run diagnostic: `make health > diagnostic.txt`
2. Save logs: `make logs > logs.txt 2>&1`
3. Note your IP: `make ip`
4. Share diagnostic.txt and logs.txt with support

---

## 📖 Additional Documentation

**In This Repository:**
- `README.md` - Quick start guide
- `MAKEFILE_GUIDE.md` - Complete command reference
- `IP_DETECTION.md` - Technical details on IP detection
- `CHANGES_SUMMARY.md` - What was implemented

**Online Docs:**
- Full documentation: https://aulendurforge.github.io/Cortex-vLLM/

**Quick Help:**
```bash
make help  # See all commands
make info  # See current configuration
```

---

## ✨ Summary

**For 99% of deployments:**

```bash
# This is all you need:
make quick-start
```

**The system automatically:**
- ✅ Detects your IP
- ✅ Configures CORS
- ✅ Sets up networking
- ✅ Creates admin user
- ✅ Starts all services

**Access at the IP shown in the output. That's it!** 🎉

---

## 🔐 Security Best Practices

1. **Change default password** immediately after quick-start
2. **Use strong API keys** for production
3. **Enable firewall** rules
4. **Set up TLS** for production (nginx/traefik)
5. **Regular backups** (automated via cron)
6. **Monitor logs** for suspicious activity
7. **Review** `make prod-check` output before production deployment

---

**Questions?** Run `make help` or check `MAKEFILE_GUIDE.md`

