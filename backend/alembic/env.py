import os
import sys
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from alembic import context

# Add backend/src to path to import models
CURRENT_DIR = os.path.dirname(__file__)
SRC_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "src"))
if SRC_DIR not in sys.path:
  sys.path.append(SRC_DIR)

from models import Base  # noqa

config = context.config

# Prefer DATABASE_URL env for migrations; fallback to dev compose default
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://cortex:cortex@postgres:5432/cortex")
if config.get_main_option("sqlalchemy.url", None) is None:
  config.set_main_option("sqlalchemy.url", DATABASE_URL)

if config.config_file_name is not None:
  fileConfig(config.config_file_name)

target_metadata = Base.metadata

def run_migrations_offline() -> None:
  url = config.get_main_option("sqlalchemy.url")
  context.configure(
      url=url,
      target_metadata=target_metadata,
      literal_binds=True,
      dialect_opts={"paramstyle": "named"},
  )
  with context.begin_transaction():
    context.run_migrations()

def do_run_migrations(connection: Connection) -> None:
  context.configure(connection=connection, target_metadata=target_metadata)
  with context.begin_transaction():
    context.run_migrations()

async def run_migrations_online() -> None:
  connectable = create_async_engine(
      config.get_main_option("sqlalchemy.url"),
      poolclass=pool.NullPool,
  )
  async with connectable.connect() as connection:
    await connection.run_sync(do_run_migrations)
  await connectable.dispose()

if context.is_offline_mode():
  run_migrations_offline()
else:
  import asyncio
  asyncio.run(run_migrations_online())