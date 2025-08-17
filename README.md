<p align="center">
  <img src="frontend/src/assets/cortex%20logo%20and%20text%20black.png" alt="CORTEX" width="260" />
</p>

## CORTEX

**CORTEX is a secure, OpenAI-compatible AI gateway** developed by Aulendur LLC. The mission is to make advanced AI capabilities usable, reliable, and governable inside classified and restricted networks, and to enable rapid integration of AI into mission workflows.

### Core value proposition
- A single, secure entry point for LLM inference with an OpenAI-compatible API (chat, completions, embeddings)
- High‑performance vLLM serving with health checks, metrics, routing, and circuit breaking
- Enterprise controls: API keys, orgs, users, and usage metering for attribution and governance
- Observability: Prometheus metrics, optional tracing, admin dashboards

### Design goals (from the product pages)
- Deliver high‑performance LLM inference on local/private infrastructure
- Provide a consistent API layer so applications and tools “just work”
- Support multi‑model orchestration and scaling (generation + embeddings)
- Enable attribution, auditing, and administrative controls

---

## Developer quickstart

1) Prepare OS‑specific host env (one‑time)

Create one of these at the repo root and pass it with `--env-file` when running Compose.

- `.env.linux`
  - `CORTEX_MODELS_DIR=/var/cortex/models`
  - `HF_CACHE_DIR=/var/cortex/hf-cache`
  - `GATEWAY_PORT=8080` (override if 8080 is busy)
  - `# PROM_PORT=9090` (optional override)

- `.env.windows`
  - `CORTEX_MODELS_DIR=C:/cortex/models`
  - `HF_CACHE_DIR=C:/cortex/hf-cache`
  - `GATEWAY_PORT=8080`
  - `# PROM_PORT=9090`

Also ensure `backend/.env.dev` exists (see Environment configuration) — gateway feature flags and service URLs live there.

2) Start the dev stack

```bash
# Linux
docker compose --env-file .env.linux -f docker.compose.dev.yaml up --build -d

# Windows (PowerShell)
docker compose --env-file .env.windows -f docker.compose.dev.yaml up --build -d
```

Notes:
- If ports conflict, you can override at runtime, e.g. `GATEWAY_PORT=8084 PROM_PORT=9094 docker compose --env-file .env.linux -f docker.compose.dev.yaml up -d`.
- Postgres (5432) and Redis (6379) are not published on the host in dev to avoid collisions; access Postgres via pgAdmin (`http://localhost:5050`) or `docker exec`.
 - CLI examples below show `http://localhost:${GATEWAY_PORT:-8080}` as a placeholder. Your shell does not read `.env.linux/.env.windows`, so either replace it with the numeric port you chose (e.g., `8084`) or export it in your shell before running examples:
   - Linux/macOS (bash): `export GATEWAY_PORT=$(grep -m1 ^GATEWAY_PORT .env.linux | cut -d= -f2 || echo 8080)`
   - Windows PowerShell: `$env:GATEWAY_PORT = (Select-String -Path .env.windows -Pattern '^GATEWAY_PORT=').Line.Split('=')[1]`

3) Verify the gateway

```bash
curl -H "Authorization: Bearer dev-key" \
  -H "Content-Type: application/json" \
  http://localhost:${GATEWAY_PORT:-8080}/v1/chat/completions \
  -d '{"model":"meta-llama/Llama-3-8B-Instruct","messages":[{"role":"user","content":"Hello!"}]}'
```

3) Admin UI (Next.js) runs separately; see `frontend/README.md` in that app for `npm run dev` or `next dev` instructions if not already integrated.

5) Frontend (Admin UI)

The Admin UI is a separate Next.js app located in `frontend/`. It is not containerized in the dev compose by default so you get fast HMR.

```bash
cd frontend
npm install
npm run dev   # serves at http://localhost:3001
```

By default, the backend enables CORS for `http://localhost:3001` in dev (set in `backend/.env.dev` via `CORS_ALLOW_ORIGINS`).

Open your browser to `http://localhost:3001` and log in. In dev, the app uses a simple cookie session; admin‑only routes will work when authenticated.

---

## Line endings (Windows/macOS/Linux)

To avoid CRLF↔LF warnings and build issues, the repo enforces LF in Git using `.gitattributes` and recommends IDEs honor `.editorconfig`.

- `.gitattributes` keeps all text files as LF in the repo; Windows `*.bat`/`*.cmd` are checked out as CRLF automatically.
- `.editorconfig` sets `end_of_line = lf` for general files and `crlf` only for Windows batch files.

One‑time normalization after pulling these changes:

```bash
# from the repo root
git rm --cached -r .
git reset --hard
git add -A
git commit -m "Normalize line endings per .gitattributes"
```

Developers may also set global Git defaults:

```bash
# Windows
git config --global core.autocrlf true

# macOS/Linux
git config --global core.autocrlf input
```

These settings ensure the working copy is convenient on each OS while commits stay LF‑normalized.

---

## Services and URLs (dev compose)

- **Gateway (FastAPI)**: `http://localhost:${GATEWAY_PORT:-8080}`
  - Health: `GET /health`
  - Metrics: `GET /metrics` (Prometheus format)
  - OpenAI API: `POST /v1/chat/completions`, `POST /v1/completions`, `POST /v1/embeddings`

- **Prometheus**: `http://localhost:${PROM_PORT:-9090}`
  - Scrapes: gateway, node-exporter, dcgm-exporter, vLLM engines
  - Default retention is Prometheus default; adjust via service args if needed

- **Node Exporter** (host metrics): exposed to Prom via `node-exporter:9100` (runs host‑network)

- **DCGM Exporter** (NVIDIA GPU metrics): exposed to Prom via `dcgm-exporter:9400`
  - Requires NVIDIA drivers on the host and `nvidia-container-toolkit`
  - In non‑GPU dev environments, exporter may start with warnings; the rest of the stack still functions

- **vLLM model servers** (optional):
  - Static engines: set `VLLM_GEN_URLS` / `VLLM_EMB_URLS` in `backend/.env.dev` to point to your engines.
  - Managed containers: use the Models page/API to start vLLM containers via Docker; the gateway auto-registers served names to URLs.

- **Postgres**: internal (user `cortex`, db `cortex`) — manage via **pgAdmin** at `http://localhost:5050`
- **Redis**: internal only
- **pgAdmin**: `http://localhost:5050` (dev UI)

---

## Auth (dev)

- API calls can use `Authorization: Bearer dev-key` when `GATEWAY_DEV_ALLOW_ALL_KEYS=true`.
- The Admin UI’s dev login sets a simple cookie (`/auth/login`), which drives Admin‑only pages. Admin‑only backend endpoints (e.g., `/admin/system/*`) are protected and require an Admin session in dev.

### 1) Bootstrap the initial Admin account (first run only)
- After bringing the stack up, create the first admin user in the fresh database:

  ```bash
  curl -X POST http://localhost:${GATEWAY_PORT:-8084}/admin/bootstrap-owner \
    -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"admin","org_name":"Default"}'
  # Response examples: {"status":"ok","owner_id":1} or {"status":"skipped"}
  ```

Notes:
- This endpoint is idempotent. If an Admin already exists, it returns `{"status":"skipped"}`.
- If you wipe the DB (e.g., `docker compose -f docker.compose.dev.yaml down -v`), you must run the bootstrap again.

### 2) Verify login works (API)

```bash
curl -i -X POST http://localhost:${GATEWAY_PORT:-8080}/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}'
# Expect HTTP/1.1 200 and a Set-Cookie: cortex_session=...
```

### 3) Login in the Frontend (Admin UI)
- Ensure the frontend points to the gateway:
  - In `frontend/.env.local`: `NEXT_PUBLIC_GATEWAY_URL=http://localhost:${GATEWAY_PORT:-8080}`
  - Restart `npm run dev` after editing envs.
- Open `http://localhost:3001`, log in with `admin / admin`.

### 4) Cookie jar usage for admin-only endpoints (optional, for CLI testing)

```bash
mkdir -p .dev/cookies
# Login and save cookie
curl -c .dev/cookies/session.txt \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"admin"}' \
     http://localhost:${GATEWAY_PORT:-8080}/auth/login

# Use the cookie on admin endpoints
curl -b .dev/cookies/session.txt http://localhost:${GATEWAY_PORT:-8080}/admin/system/summary

# Update the jar while sending it
curl -b .dev/cookies/session.txt -c .dev/cookies/session.txt \
     http://localhost:${GATEWAY_PORT:-8080}/admin/users
```

### Troubleshooting
- 401 invalid_credentials: make sure you ran the bootstrap step after a fresh DB start.
- Frontend login loops: verify `NEXT_PUBLIC_GATEWAY_URL` and restart `npm run dev`.
- Changed DB creds or wiped volumes: re-bootstrap Admin.

---

## System monitoring (dev)

Exporters are included in dev compose:

- `node-exporter` (host metrics) — mounted `/proc`, `/sys`, rootfs; host network
- `dcgm-exporter` (GPU metrics) — requires NVIDIA runtime; environment variables are set in compose
- Prometheus scrape jobs are defined in `infra/prometheus/prometheus.yml`

Once running, you can query Prometheus at `http://localhost:${PROM_PORT:-9090}`:

- Example PromQL for GPU util (DCGM): `DCGM_FI_DEV_GPU_UTIL`
- Example PromQL for CPU load (node): `node_load1`

The gateway also exposes internal metrics at `GET /metrics` (e.g., request latency histograms, TTFT, upstream latency).

### Windows (Docker Desktop + WSL2) GPU setup

If the GPU section of System Monitor is empty after a rebuild, it usually means the containers do not yet have GPU access.

- One‑time Docker Desktop settings:
  - Enable "Use WSL 2 based engine"
  - Settings → Resources → WSL Integration: enable for your Linux distro
  - Settings → Resources → GPU: enable GPU support
  - Install the latest NVIDIA Windows driver

- Start the stack with GPU profile so the DCGM exporter runs:

```bash
docker compose -f docker.compose.dev.yaml --profile gpu up -d
```

- Quick preflight (verifies Docker sees the GPU):

```bash
docker run --rm --gpus all nvidia/cuda:12.3.2-base-ubuntu22.04 nvidia-smi
```

- Verify Prometheus scrapes DCGM (optional): open `http://localhost:9090` → Status → Targets and check `dcgm-exporter` is UP.

- Notes:
  - If DCGM is unavailable, the backend falls back to NVML inside the gateway container when the host GPU is visible; GPU tiles will still populate best‑effort.
  - Host CPU/memory/disk/network charts have Windows fallbacks via `psutil`, so they render even without node‑exporter.

### Linux GPU setup

- Install the NVIDIA Container Toolkit on the host and restart Docker:

```bash
# Ubuntu example
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

- Then start the dev stack with GPUs enabled:

```bash
docker compose -f docker.compose.dev.yaml --profile gpu up -d
```

---

## Environment configuration

We keep environment simple in dev. Create two files locally (never commit real secrets):

- Backend: copy the snippet below into `backend/.env`

  ```env
  # Upstream engines (Docker service names)
  VLLM_GEN_URLS=http://vllm-gen:8000
  VLLM_EMB_URLS=http://vllm-emb:8000
  INTERNAL_VLLM_API_KEY=dev-internal-token

  # Dev flags
  GATEWAY_DEV_ALLOW_ALL_KEYS=true
  CORS_ENABLED=true
  CORS_ALLOW_ORIGINS=http://localhost:3001
  SECURITY_HEADERS_ENABLED=true

  # Observability
  PROMETHEUS_URL=http://prometheus:9090

  # Data stores
  DATABASE_URL=postgresql+asyncpg://cortex:cortex@postgres:5432/cortex
  REDIS_URL=redis://redis:6379/0

  # Optional admin bootstrap (dev only)
  ADMIN_BOOTSTRAP_USERNAME=admin
  ADMIN_BOOTSTRAP_PASSWORD=admin
  ADMIN_BOOTSTRAP_ORG=default
  ```

- Frontend: create `frontend/.env`

  ```env
  # Default to 8084 to avoid conflicts with other local apps
  NEXT_PUBLIC_GATEWAY_URL=http://localhost:8084
  ```

Notes:
- Do not place cookies, JWTs, or tokens in `.env.example` or the repo. Generate sessions locally (see Auth section) and store them in `.dev/` which is git‑ignored.
- `docker.compose.dev.yaml` already points gateway env to `backend/.env.dev` via `env_file`.

### Production

Use the prod compose file and pass a production env file (kept outside git):

```bash
docker compose -f docker.compose.prod.yaml --env-file backend/prod.env up -d
```

Your `backend/prod.env` should disable dev flags and set real URLs and secrets, for example:

```env
GATEWAY_DEV_ALLOW_ALL_KEYS=false
CORS_ALLOW_ORIGINS=https://your-admin-ui.example.com
DATABASE_URL=postgresql+asyncpg://user:pass@db:5432/app
REDIS_URL=redis://redis:6379/0
REQUEST_MAX_BODY_BYTES=8388608
```

---

## Project layout

- `backend/` (FastAPI gateway)
- `frontend/` (Next.js Admin UI)
- `infra/prometheus/` (Prom config)
- `docker.compose.dev.yaml` / `docker.compose.prod.yaml`
- `docs/` and `plans/`

---

## Production notes (preview)

- For GPU metrics in prod, ensure host NVIDIA drivers and `nvidia-container-toolkit` are installed.
- Consider Prometheus retention and remote write (Mimir/Thanos) for longer history.
- Replace the dev cookie auth and `GATEWAY_DEV_ALLOW_ALL_KEYS` with your production auth/session strategy.

---

## Acknowledgments

Developed by Aulendur LLC to enable high‑performance, governable AI in secure environments.