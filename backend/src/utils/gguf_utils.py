"""GGUF file analysis and inspection utilities."""

import os
import re
from typing import List, Tuple
from pydantic import BaseModel


class GGUFGroup(BaseModel):
    """Represents a group of GGUF files (single or multi-part)."""
    quant_type: str
    display_name: str
    files: list[str]  # Relative paths from target directory
    full_paths: list[str]  # Absolute paths for backend use
    is_multipart: bool
    expected_parts: int | None = None
    actual_parts: int
    total_size_mb: float
    status: str  # 'ready', 'complete_but_needs_merge', 'incomplete', 'unknown'
    can_use: bool
    warning: str | None = None
    is_recommended: bool = False


def detect_quantization_from_filename(filename: str) -> str:
    """Extract quantization type from GGUF filename.
    
    Args:
        filename: GGUF filename to analyze
        
    Returns:
        str: Quantization type (e.g., 'Q8_0', 'Q5_K_M', 'F16') or 'Unknown'
    """
    # Common patterns: Q8_0, Q5_K_M, Q4_K_S, F16, etc.
    # Patterns match at word boundaries or start of string
    # Delimiters: underscore, dash, or dot (_, -, .)
    quant_patterns = [
        r'(?:^|[_\-\.])(Q\d+_[KML](?:_[SML])?)',  # Q5_K_M, Q4_K_S, etc.
        r'(?:^|[_\-\.])(Q\d+_\d+)',                # Q8_0, Q4_1, etc.
        r'(?:^|[_\-\.])([Ff]\d+)',                 # F16, f16, F32
        r'(?:^|[_\-\.])(IQ\d+_[A-Z]+)',            # IQ3_XXS, etc.
    ]
    for pattern in quant_patterns:
        match = re.search(pattern, filename, re.IGNORECASE)
        if match:
            return match.group(1).upper()
    return "Unknown"


def find_gguf_files_recursive(directory: str) -> List[Tuple[str, str]]:
    """Recursively find all GGUF files.
    
    Args:
        directory: Root directory to search
        
    Returns:
        List of (relative_path, absolute_path) tuples
    """
    gguf_files = []
    try:
        for root, dirs, files in os.walk(directory):
            for filename in files:
                if filename.lower().endswith('.gguf'):
                    abs_path = os.path.join(root, filename)
                    rel_path = os.path.relpath(abs_path, directory)
                    gguf_files.append((rel_path, abs_path))
    except Exception:
        pass
    return gguf_files


def analyze_gguf_files(directory: str) -> List[GGUFGroup]:
    """Smart analysis of GGUF files with grouping and multi-part detection.
    
    Args:
        directory: Directory containing GGUF files
        
    Returns:
        List of GGUFGroup objects with metadata and status
    """
    gguf_files = find_gguf_files_recursive(directory)
    
    if not gguf_files:
        return []
    
    # Group files by base name and quantization
    groups_dict: dict[str, dict] = {}
    
    for rel_path, abs_path in gguf_files:
        filename = os.path.basename(rel_path)
        
        # Check for multi-part pattern: model-Q8_0-00001-of-00006.gguf
        multipart_match = re.match(
            r'(.+)-(\d{5})-of-(\d{5})\.gguf$',
            filename,
            re.IGNORECASE
        )
        
        if multipart_match:
            # Multi-part file
            base_name = multipart_match.group(1)
            part_num = int(multipart_match.group(2))
            total_parts = int(multipart_match.group(3))
            quant_type = detect_quantization_from_filename(base_name)
            
            group_key = f"multipart_{base_name}_{quant_type}"
            
            if group_key not in groups_dict:
                groups_dict[group_key] = {
                    'quant_type': quant_type,
                    'base_name': base_name,
                    'files': [],
                    'full_paths': [],
                    'is_multipart': True,
                    'expected_parts': total_parts,
                    'parts_seen': set()
                }
            
            groups_dict[group_key]['files'].append(rel_path)
            groups_dict[group_key]['full_paths'].append(abs_path)
            groups_dict[group_key]['parts_seen'].add(part_num)
        else:
            # Single file
            quant_type = detect_quantization_from_filename(filename)
            group_key = f"single_{filename}_{quant_type}"
            
            groups_dict[group_key] = {
                'quant_type': quant_type,
                'base_name': filename.replace('.gguf', ''),
                'files': [rel_path],
                'full_paths': [abs_path],
                'is_multipart': False,
                'expected_parts': None,
                'parts_seen': set()
            }
    
    # Convert to GGUFGroup objects
    groups = []
    for group_key, group_data in groups_dict.items():
        actual_parts = len(group_data['files'])
        
        # Calculate total size
        total_size_mb = 0.0
        try:
            for fpath in group_data['full_paths']:
                if os.path.isfile(fpath):
                    total_size_mb += os.path.getsize(fpath) / (1024 * 1024)
        except Exception:
            pass
        
        # Determine status and usability
        if group_data['is_multipart']:
            expected = group_data['expected_parts']
            if actual_parts == expected:
                # Check if merged file already exists
                parts_dir = os.path.dirname(group_data['full_paths'][0])
                merged_filename = f"merged-{group_data['quant_type']}.gguf"
                merged_path = os.path.join(parts_dir, merged_filename)
                
                if os.path.exists(merged_path):
                    status = 'merged_available'
                    can_use = False  # Use the merged file instead
                    warning = f"ℹ️ Merged version available: {merged_filename}"
                else:
                    status = 'complete_but_needs_merge'
                    can_use = False  # Multi-part files need merging
                    warning = f"⚠️ Multi-part GGUF detected ({actual_parts} files). Will be auto-merged when selected."
            else:
                status = 'incomplete'
                can_use = False
                warning = f"❌ Incomplete multi-part set: Only {actual_parts} of {expected} parts found."
        else:
            status = 'ready'
            can_use = True
            warning = None
        
        # Create display name
        quant = group_data['quant_type']
        if group_data['is_multipart']:
            display_name = f"{quant} ({actual_parts} parts)"
        else:
            display_name = quant
        
        groups.append(GGUFGroup(
            quant_type=group_data['quant_type'],
            display_name=display_name,
            files=sorted(group_data['files']),
            full_paths=sorted(group_data['full_paths']),
            is_multipart=group_data['is_multipart'],
            expected_parts=group_data['expected_parts'],
            actual_parts=actual_parts,
            total_size_mb=round(total_size_mb, 2),
            status=status,
            can_use=can_use,
            warning=warning
        ))
    
    # Sort: ready files first, then by quant quality (Q8 > Q5 > Q4)
    def sort_key(g: GGUFGroup):
        priority = 0 if g.can_use else 1
        # Extract number from quant type for quality sorting
        quant_num = 8  # default
        match = re.search(r'Q(\d+)', g.quant_type)
        if match:
            quant_num = int(match.group(1))
        return (priority, -quant_num, g.quant_type)
    
    groups.sort(key=sort_key)
    
    # Mark the first ready group as recommended
    for g in groups:
        if g.can_use:
            g.is_recommended = True
            break
    
    return groups
