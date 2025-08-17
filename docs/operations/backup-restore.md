# Backup & Restore

## Postgres
- Use regular dumps for logical backups:
```bash
pg_dump -U cortex -h <host> -d cortex > cortex.sql
psql -U cortex -h <host> -d cortex -f cortex.sql
```
- Consider PITR for production.

## ConfigKV
- Model registry is stored under `config_kv` with key `model_registry`; included in DB dumps.

## HF cache and models
- Offline models stored under `CORTEX_MODELS_DIR_HOST`; back up as files.
- HF cache is reproducible; optional to back up.
