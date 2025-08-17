# Upgrade Notes

## Database migrations
- Dev uses `create_all` on startup. For production, enable Alembic:
  - Create revisions: `alembic -c backend/alembic.ini revision --autogenerate -m "msg"`
  - Upgrade: `alembic -c backend/alembic.ini upgrade head`

## Compatibility
- Keep frontend `NEXT_PUBLIC_GATEWAY_URL` in sync with gateway port.
- Review breaking changes in API routes and envs; update examples accordingly.

## Release process
- Adopt SemVer and Conventional Commits; generate `CHANGELOG.md` per release.
