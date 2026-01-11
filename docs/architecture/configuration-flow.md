# Cortex Configuration Flow

## 🎯 For Administrators: No Manual IP Configuration Needed!

**This document explains how Cortex automatically configures itself for network access.**

---

## 📋 TL;DR

```bash
make quick-start
# ✓ IP detected automatically
# ✓ CORS configured automatically  
# ✓ Network access works automatically
# ✓ No manual configuration required!
```

---

## 🔄 Complete Configuration Flow

### Startup Sequence

```
STEP 1: Administrator runs command
    ↓
    make quick-start
    ↓
STEP 2: IP Detection
    ↓
    scripts/detect-ip.sh executes
    ├─ Scans all network interfaces
    ├─ Filters out Docker bridges (172.17-31.x.x)
    ├─ Filters out loopback (127.0.0.1)
    ├─ Scores remaining IPs
    └─ Selects best: 192.168.1.181
    ↓
STEP 3: Makefile receives IP
    ↓
    HOST_IP=192.168.1.181
    ↓
STEP 4: Pass to Docker Compose
    ↓
    HOST_IP=192.168.1.181 docker compose -f docker.compose.dev.yaml up -d
    ↓
STEP 5: Docker Compose interpolation
    ↓
    CORS_ALLOW_ORIGINS: http://${HOST_IP}:3001,http://localhost:3001,...
    Becomes: http://192.168.1.181:3001,http://localhost:3001,...
    ↓
STEP 6: Gateway container starts
    ↓
    Environment variable set:
    CORS_ALLOW_ORIGINS=http://192.168.1.181:3001,http://localhost:3001,http://127.0.0.1:3001
    ↓
STEP 7: FastAPI reads environment
    ↓
    CORS middleware configured to allow:
    - http://192.168.1.181:3001 ✓
    - http://localhost:3001 ✓
    - http://127.0.0.1:3001 ✓
    ↓
STEP 8: Frontend container starts
    ↓
    Next.js dev server runs on port 3001
    Bound to 0.0.0.0:3001 (all interfaces)
    ↓
STEP 9: User accesses frontend
    ↓
    Browser → http://192.168.1.181:3001
    ↓
STEP 10: Frontend auto-detects gateway
    ↓
    Frontend code: window.location.hostname = "192.168.1.181"
    Gateway URL: http://192.168.1.181:8084
    ↓
STEP 11: API calls work!
    ↓
    Frontend → http://192.168.1.181:8084/v1/*
    CORS check: Origin http://192.168.1.181:3001 ✓ Allowed!
    Request succeeds ✓
```

---

## 📊 Configuration Sources (Priority Order)

### 1. **Runtime Detection** (Highest Priority)
```
Makefile → detect-ip.sh → HOST_IP variable
```
- Runs every time you use `make`
- Always uses current IP
- No caching, always fresh

### 2. **Docker Compose Environment**
```yaml
# docker.compose.dev.yaml
environment:
  CORS_ALLOW_ORIGINS: http://${HOST_IP}:3001,http://localhost:3001,http://127.0.0.1:3001
```
- Receives `HOST_IP` from Makefile
- Interpolates into environment variables
- Passes to containers

### 3. **Backend Config Defaults**
```python
# backend/src/config.py
CORS_ALLOW_ORIGINS: str = "http://localhost:3001,http://127.0.0.1:3001"
```
- Used ONLY if Docker Compose doesn't provide override
- Fallback for local development without Makefile
- **Not used when you run `make up`** (Docker Compose overrides)

### 4. **Frontend Auto-Detection**
```typescript
// frontend/src/lib/api-clients.ts
const host = window.location.hostname;  // Gets IP from browser
return `http://${host}:8084`;           // Calls gateway at same IP
```
- Client-side detection
- Matches whatever IP user accessed frontend from
- Works seamlessly with backend CORS

---

## ✅ What Admins DON'T Need to Configure

### ❌ You DON'T Need to Edit:

1. **IP addresses** - Auto-detected
2. **CORS settings** - Auto-configured
3. **Frontend gateway URL** - Auto-detected
4. **Network settings** - Pre-configured for network access

### ❌ You DON'T Need to Create:

1. **`.env` files** - Optional, defaults work
2. **CORS configuration files** - Handled automatically
3. **Network configuration** - Already set up

---

## ⚙️ What Admins MIGHT Configure (Optional)

### Only Configure These If You Have Specific Needs:

### 1. **Model Storage Paths** (if not using defaults)

Edit `docker.compose.dev.yaml`:
```yaml
environment:
  CORTEX_MODELS_DIR_HOST: /mnt/models  # Your custom path
  HF_CACHE_DIR_HOST: /mnt/hf-cache     # Your custom cache
```

### 2. **Port Mappings** (if ports conflict)

Edit `docker.compose.dev.yaml`:
```yaml
gateway:
  ports: ["8085:8084"]  # Change external port

frontend:
  ports: ["3002:3001"]  # Change external port
```

### 3. **Database Credentials** (for production)

Edit `docker.compose.prod.yaml`:
```yaml
postgres:
  environment:
    POSTGRES_PASSWORD: your-strong-password

gateway:
  environment:
    DATABASE_URL: postgresql+asyncpg://cortex:your-strong-password@postgres:5432/cortex
```

### 4. **Security Settings** (for production)

Edit `docker.compose.prod.yaml`:
```yaml
gateway:
  environment:
    GATEWAY_DEV_ALLOW_ALL_KEYS: "false"  # Enforce API keys
    INTERNAL_VLLM_API_KEY: "your-secret-key"  # Strong random key
```

---

## 🧪 Validation Commands

### Verify Everything is Configured Correctly

```bash
# Complete validation (recommended)
make validate

# Individual checks
make ip            # Check detected IP
make info          # Check full configuration
make status        # Check containers running
make health        # Check service health
```

### Manual Verification

```bash
# 1. Check IP detection
bash scripts/detect-ip.sh
# Expected: Your LAN IP (e.g., 192.168.1.181)

# 2. Check Makefile uses IP
make -n up | grep HOST_IP
# Expected: HOST_IP=192.168.1.181 docker compose ...

# 3. Check CORS in gateway
docker exec cortex-gateway-1 printenv CORS_ALLOW_ORIGINS
# Expected: http://192.168.1.181:3001,http://localhost:3001,http://127.0.0.1:3001

# 4. Test gateway health
curl http://192.168.1.181:8084/health
# Expected: {"status":"ok"}

# 5. Test frontend access
curl -I http://192.168.1.181:3001/login
# Expected: HTTP/1.1 200 OK
```

---

## 🔧 Configuration Override Scenarios

### Scenario 1: Static IP Override

If you want to force a specific IP:

```bash
# Temporary (one command)
HOST_IP=10.1.10.241 make up

# Persistent (for terminal session)
export HOST_IP=10.1.10.241
make up
make info  # Verify

# Permanent (add to your .bashrc or .zshrc)
echo 'export HOST_IP=10.1.10.241' >> ~/.bashrc
source ~/.bashrc
```

### Scenario 2: Multiple Network Interfaces

If your host has multiple IPs and detection picks the wrong one:

```bash
# Check all available IPs
ip addr show | grep 'inet ' | grep -v '127.0.0.1'

# Identify the correct one for your use case
# Override:
export HOST_IP=192.168.1.181  # The one you want
make restart
```

### Scenario 3: Behind NAT/Firewall

If Cortex is behind NAT with port forwarding:

```yaml
# docker.compose.dev.yaml
# No changes needed internally!
# Just configure your router to forward ports:
# External:12345 → Internal:192.168.1.181:3001 (frontend)
# External:12346 → Internal:192.168.1.181:8084 (gateway)
```

Users outside your network access:
- `http://YOUR_PUBLIC_IP:12345` (maps to frontend)
- `http://YOUR_PUBLIC_IP:12346` (maps to gateway)

---

## 📚 Configuration File Reference

### Files That Control Configuration

| File | Purpose | Edit? |
|------|---------|-------|
| `Makefile` | IP detection & commands | ❌ No (unless adding features) |
| `scripts/detect-ip.sh` | IP detection logic | ⚠️  Only if detection fails |
| `docker.compose.dev.yaml` | Dev environment | ✅ Yes (for paths, ports) |
| `docker.compose.prod.yaml` | Production env | ✅ Yes (for security) |
| `backend/src/config.py` | Default settings | ❌ No (Docker Compose overrides) |

### Configuration Variables Flow

```
┌─────────────────────┐
│   make quick-start  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ detect-ip.sh        │
│ Returns: 192.168... │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Makefile            │
│ HOST_IP=192.168...  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Docker Compose      │
│ ${HOST_IP} → value  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Gateway Container   │
│ CORS_ALLOW_ORIGINS  │
│ = http://192.168... │
└─────────────────────┘
```

---

## ✨ Best Practices for Administrators

### DO These Things:

1. ✅ **Run `make validate` after startup** to verify configuration
2. ✅ **Use `make ip`** to see your access URLs
3. ✅ **Run `make db-backup`** before making changes
4. ✅ **Check `make health`** regularly
5. ✅ **Review `make logs`** for errors

### DON'T Do These Things:

1. ❌ **Don't hardcode IPs** in configuration files
2. ❌ **Don't edit CORS manually** - it's auto-configured
3. ❌ **Don't use localhost** for network access
4. ❌ **Don't skip `make validate`** after changes
5. ❌ **Don't expose to internet** without security review

---

## 🎓 Understanding the Magic

### Why This Works So Well

**Traditional approach (manual):**
```bash
# Admin has to:
1. Find their IP: ifconfig
2. Edit docker.compose.yaml: CORS_ALLOW_ORIGINS=http://192.168.1.181:3001
3. Edit frontend config: NEXT_PUBLIC_GATEWAY_URL=http://192.168.1.181:8084
4. Restart containers
5. IP changes? Repeat all steps!
```

**Cortex approach (automatic):**
```bash
# Admin does:
make quick-start

# System does:
- Detects IP automatically
- Configures CORS automatically
- Frontend auto-detects gateway
- Works from any IP without reconfiguration!
```

### The Multi-Tier Auto-Detection System

1. **Makefile IP Detection** → Finds your LAN IP via `detect-ip.sh`
2. **Docker Compose Interpolation** → Sets CORS with detected IP  
3. **Gateway Entrypoint Fallback** → Detects IP if not provided by Makefile
4. **Frontend Browser Detection** → Calls gateway at correct IP

**Result**: Works whether you use `make` or `docker compose` directly! 🎉

---

## 🔍 Debugging Configuration Issues

### If CORS Errors Occur

```bash
# 1. Check what IP was detected
make ip
# Expected: Your LAN IP

# 2. Check what CORS is configured
docker exec cortex-gateway-1 printenv CORS_ALLOW_ORIGINS
# Expected: Should include your detected IP

# 3. If they don't match, restart
make restart
make validate

# 4. If still broken, check Docker Compose received IP
make -n up | grep HOST_IP
# Expected: HOST_IP=192.168.1.181 docker compose ...
```

### If IP Detection Fails

```bash
# 1. Test detection script
bash scripts/detect-ip.sh
# Expected: Your LAN IP, not "localhost"

# 2. If returns "localhost", check your network
ip addr show
# Look for your LAN interface (usually starts with 192.168 or 10.x)

# 3. Manual override
export HOST_IP=192.168.1.181
make restart
make validate
```

---

## 📖 Quick Reference

### Essential Commands

```bash
make quick-start   # Complete auto-configuration
make validate      # Verify everything is correct
make ip            # Show detected IP and URLs
make info          # Show full configuration
make health        # Check service health
```

### Verification Checklist

- [ ] `make ip` shows correct LAN IP (not localhost)
- [ ] `make status` shows all containers running
- [ ] `make health` returns 200 OK
- [ ] `docker exec cortex-gateway-1 printenv CORS_ALLOW_ORIGINS` includes your IP
- [ ] Can access `http://YOUR_IP:3001` in browser
- [ ] Can access `http://YOUR_IP:8084/health` via curl

---

## 🎉 Summary

**Cortex uses a three-tier automatic configuration system:**

1. **Tier 1**: IP Detection (finds your IP)
2. **Tier 2**: Docker Compose (configures CORS with your IP)
3. **Tier 3**: Frontend (auto-detects gateway URL)

**Admin responsibility**: Just run `make quick-start`

**System responsibility**: Everything else!

---

**For detailed technical information, see:**
- `docs/architecture/ip-detection.md` - How IP detection works
- `docs/operations/makefile-guide.md` - All Makefile commands
- `docs/getting-started/admin-setup.md` - Step-by-step setup

**Quick help:** `make help` or `make validate`

