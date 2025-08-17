Early development: Alembic migrations are disabled. The backend creates tables on startup via SQLAlchemy (`Base.metadata.create_all`). When schema changes are introduced, rebuild containers/volumes.

To re‑enable migrations later:
  alembic -c backend/alembic.ini revision --autogenerate -m "msg"
  alembic -c backend/alembic.ini upgrade head