"""GPU-related utility functions."""
from __future__ import annotations

import json
import logging
from typing import List

logger = logging.getLogger(__name__)


def parse_gpu_selection(selected_gpus: str | List[int] | None) -> List[int]:
    """Parse GPU selection from various formats to a clean list of integers.
    
    Handles legacy data with double-encoding and various input formats.
    (Gap #15 fix - consolidated from docker_manager.py and routes/models.py)
    
    Args:
        selected_gpus: GPU selection in various formats:
            - None: returns empty list
            - "[0, 1]" (JSON string): returns [0, 1]
            - "\"[0, 1]\"" (double-encoded): returns [0, 1]
            - [0, 1] (list): returns [0, 1]
            
    Returns:
        List of GPU indices as integers
    """
    if selected_gpus is None:
        return []
    
    # Already a list - validate and return
    if isinstance(selected_gpus, list):
        return [int(g) for g in selected_gpus]
    
    # String - parse JSON
    if isinstance(selected_gpus, str):
        try:
            parsed = json.loads(selected_gpus)
            # Handle double-encoded JSON (legacy data bug)
            if isinstance(parsed, str):
                parsed = json.loads(parsed)
            if isinstance(parsed, list):
                return [int(g) for g in parsed]
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            logger.warning(f"Failed to parse GPU selection '{selected_gpus}': {e}")
            return []
    
    return []


def normalize_gpu_selection(selected_gpus: str | list | None) -> list | None:
    """Normalize GPU selection for API responses.
    
    Similar to parse_gpu_selection but returns None for empty selections,
    which is appropriate for API serialization.
    
    Args:
        selected_gpus: GPU selection in various formats
            
    Returns:
        List of GPU indices as integers, or None if empty/invalid
    """
    result = parse_gpu_selection(selected_gpus)
    return result if result else None

