"""Model registry persistence utilities."""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def persist_model_registry() -> bool:
    """Persist current model registry to ConfigKV table.
    
    Returns:
        bool: True if persisted successfully, False otherwise
    """
    try:
        # Lazy imports to avoid circular dependencies
        from ..main import SessionLocal  # type: ignore
        from ..models import ConfigKV
        from ..state import get_model_registry
        from sqlalchemy import select
        
        if SessionLocal is None:
            logger.warning("SessionLocal not available, cannot persist registry")
            return False
        
        async with SessionLocal() as session:
            registry_data = get_model_registry()
            val = json.dumps(registry_data)
            
            row = (await session.execute(
                select(ConfigKV).where(ConfigKV.key == "model_registry")
            )).scalar_one_or_none()
            
            if row:
                row.value = val
            else:
                session.add(ConfigKV(key="model_registry", value=val))
            
            await session.commit()
            logger.debug(f"Registry persisted: {len(registry_data)} entries")
            return True
            
    except Exception as e:
        logger.error(f"Failed to persist model registry: {e}")
        return False
