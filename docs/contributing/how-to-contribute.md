# How to Contribute

## Local development
- Backend
  - `cd backend && python -m venv .venv && source .venv/bin/activate`
  - `pip install -r requirements.txt`
  - `uvicorn src.main:app --reload --port 8084`
- Frontend
  - `cd frontend && npm install`
  - `export NEXT_PUBLIC_GATEWAY_URL=http://localhost:8084 && npm run dev`
- Databases
  - Use Docker for Postgres and Redis, or local services

## Tests and checks
- Python: `pytest` under `backend/src/tests`
- Lint: (add linters later); run type checks where applicable

## PR guidelines
- Use Conventional Commits (`feat:`, `fix:`, `docs:`)
- Include tests or screenshots when relevant
- Update docs in `docs/` when behavior changes

## Issue triage
- Label issues (`bug`, `enhancement`, `docs`) and link to milestones
