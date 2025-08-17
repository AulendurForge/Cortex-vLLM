# Coding Standards

## Python (backend)
- Python 3.11; prefer explicit types in public functions
- Early returns, shallow nesting, meaningful variable names
- Handle errors meaningfully; avoid bare excepts
- Keep modules small and cohesive; avoid side effects at import time

## TypeScript/React (frontend)
- Functional components, hooks, and composition
- Descriptive names; avoid classes; keep components focused
- Use React Query for data; isolate API calls in lib functions
- Styling via Tailwind utility classes and small CSS helpers

## Commits & PRs
- Conventional Commits; small, reviewable changes
- Include tests/docs updates; no TODOs left behind
