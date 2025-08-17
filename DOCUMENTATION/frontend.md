# Frontend (Admin UI)

## Goals
- Progressive, outside-in development that validates back-end flows early.
- Clear role separation (Admin vs User) with route guards and context-aware UI.
- Modern, fast, accessible UI with great status/feedback.

## Stack
- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query (React Query) for fetching/caching/retries
- Zod for client-side validation
- Playwright for E2E

## Information Architecture
- Shell: Top bar (brand, environment badge, user menu) + left nav (role-aware)
- Sections:
  - Dashboard: Engine health overview (via `/admin/upstreams`), quick stats
  - API Keys: List/create/revoke; copy-once token flow; toolbar with search, user/org filters, sorting; display uses backend `include_names` for convenience
  - Usage: Per-key and aggregate (after usage APIs)
  - Models/Pools: Configured gen/emb URLs + health; manual refresh
  - Organizations & Users (Admins): CRUD wired; role assignment and org linkage; reset password
  - Settings (read-only initially): Gateway/env toggles; docs links

## Auth strategy (progressive)
- Phase A: Dev-only login (mock) to unblock UI; feature-flagged
- Phase B: Real session and RBAC once backend session/RBAC endpoints exist
- Phase C: OIDC/SSO integration (NextAuth provider)

## Data fetching & feedback
- React Query with optimistic updates and toasts
- Long actions (jobs later): polling or SSE channel; cancel/cleanup
- Immediate actions (key CRUD, health refresh): optimistic UI + toasts

## Progressive milestones
1) Scaffold app + shell + routing; Health page wired to `/admin/upstreams` and `/admin/upstreams/refresh-health`
   - Status: Implemented basic admin layout with left nav; `Health` and `API Keys` pages live under `/health` and `/keys` (named group `(admin)` is route-ignored by Next).
   - TypeScript configured (jsx runtime, Next types) and Tailwind content globs added.
   - `apiFetch` helper injects `x-request-id` and normalizes backend errors.
2) API Keys page wired to `/admin/keys` (create/revoke; copy-once reveal)
   - Status: Create + copy-once token implemented. Listing/revoke UI awaits a list endpoint.
3) Usage pages (read-only) once backend exposes usage list/aggregate API
4) Orgs/Users CRUD + Role-based route guards (after RBAC)
5) Quotas/Costs views (after APIs); CSV export

## Visual design
- Clean, neutral palette; clear state colors; responsive; accessible components
- KPI cards; robust tables (sticky header, filters, pagination)
- Consistent empty/loading/error states; accessible forms

## Testing
- Playwright smoke flows; component tests for forms/tables
- Contract checks (zod) for critical API responses

## E2E Integration Notes
- Request IDs: always send `x-request-id` (UI generates if missing), and surface the response header in error UI for support.
- Error taxonomy: map gateway error shape `{ error: { code, message }, request_id }` to friendly toasts and inline errors; link to details.
- Health cadence: cache health queries for 5–15s; allow manual refresh; reflect degraded/partial states (outlier ejection) in UI badges/tooltips.
- Rate-limit UX: detect 429, show retry-after guidance, and back off queries in React Query.
- Streaming: for future chat UI, use Fetch/SSE with cancel button and clear canceled vs failed states.

## Security & Privacy
- Copy-once token reveals; never store secrets in localStorage/sessionStorage.
- Respect CSP and security headers from backend; avoid inline scripts; sanitize any rich text.
- Role-aware routes and server-side protection (middleware) + client guards.

## State & Structure
- Data layer in feature hooks (React Query) + zod parsing; presentation components remain stateless.
- URL structure: `/admin/health`, `/admin/keys`, `/admin/usage`, `/admin/orgs`, `/admin/users`, `/admin/models`.
- Feature flags support (simple env + context) for experimental pages.

## Performance & Accessibility
- Prefer RSC for read-most pages; client components only for interactivity.
- Code-split per route; suspense + skeletons; avoid layout shift.
- A11y: keyboard navigation, focus management, proper roles/aria, color contrast.

## Internationalization (optional later)
- Keep copy centralized; plan for i18n keys without blocking MVP.

## Dev Quickstart
- Ensure Node 18+ and pnpm/npm installed.
- Copy `.env.local` in `frontend/` and set `NEXT_PUBLIC_GATEWAY_URL` (e.g., `http://localhost:8084`).
- From `frontend/`:
  - `npm install`
  - `npm run dev`
  - Visit `http://localhost:3001/health` and `http://localhost:3001/keys`.