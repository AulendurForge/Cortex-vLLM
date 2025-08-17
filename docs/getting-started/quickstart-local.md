# Quickstart (Local Development)

For contributors who prefer running services directly.

## Prerequisites
- Python 3.11+
- Node.js 18+
- Postgres 14+ and Redis 5+ (or containers)

## Start Postgres and Redis (containers)
```bash
# Postgres
docker run -d --name cortex-pg -e POSTGRES_USER=cortex -e POSTGRES_PASSWORD=cortex -e POSTGRES_DB=cortex -p 5432:5432 postgres:14
# Redis
docker run -d --name cortex-redis -p 6379:6379 redis:7
```

## Backend (FastAPI)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
# Optional: create .env (override DATABASE_URL, CORS origins, etc.)
uvicorn src.main:app --reload --host 0.0.0.0 --port 8084
```
Gateway should be at `http://localhost:8084`.

## Frontend (Next.js)
```bash
cd frontend
npm install
# Point UI to the gateway
export NEXT_PUBLIC_GATEWAY_URL=http://localhost:8084
npm run dev
```
Open `http://localhost:3001`.

## Prometheus (optional)
If you want metrics locally, start Prometheus using `docker.compose.dev.yaml` or `infra/prometheus/prometheus.yml`.

## Troubleshooting
- Port conflicts: change ports in compose or app config.
- CORS: set `CORS_ALLOW_ORIGINS` (comma-separated) in the backend `.env`.
- GPU: to run vLLM with CUDA, use the Docker compose GPU profile and ensure NVIDIA runtime is available.
