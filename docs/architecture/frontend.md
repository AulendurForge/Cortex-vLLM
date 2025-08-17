# Frontend Architecture

Next.js App Router + TypeScript admin UI (`frontend/`).

## Structure
- `app/(admin)/*`: Pages for Health, Keys, Usage, Models, Orgs, Users, Guide
- `src/components/*`: UI primitives, charts, monitoring widgets, models tools
- `src/lib/api-clients.ts`: fetch helper adds `x-request-id` and normalizes error envelope
- `providers/*`: App/Toast/User providers
- Styling: Tailwind CSS with custom utility classes in `styles/globals.css`

## Data fetching
- TanStack Query for caching and retries; error toasts map backend error structure.
- Env `NEXT_PUBLIC_GATEWAY_URL` controls gateway base URL.

## Accessibility & UX
- Keyboard-friendly components, focus management, skeletons and loading states.

## Authentication
- Dev cookie session (`cortex_session`) expected by admin pages; replace with production auth later.
