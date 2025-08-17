# Frontend (Admin UI)

## Quickstart

```bash
cd frontend
npm install
# Points to the gateway default port 8084 (override as needed)
echo "NEXT_PUBLIC_GATEWAY_URL=http://localhost:8084" > .env.local
npm run dev # http://localhost:3001
```

If your gateway runs on a different port, change `NEXT_PUBLIC_GATEWAY_URL` accordingly.

# Cortex Admin UI (Next.js)

This folder will contain the admin UI scaffold. Planned stack: Next.js 14 + TS, Tailwind, shadcn/ui, React Query, Zod.

See `plans/frontendPlan.md` for milestones and file structure.