"""GGUF file analysis and inspection utilities."""

import os
import re
import struct
from typing import List, Tuple, Optional, Any
from pydantic import BaseModel


# GGUF format constants
GGUF_MAGIC = b'GGUF'
GGUF_SUPPORTED_VERSIONS = {2, 3}
GGUF_MIN_FILE_SIZE = 256  # Minimum realistic GGUF file size in bytes

# GGUF metadata type constants
GGUF_TYPE_UINT8 = 0
GGUF_TYPE_INT8 = 1
GGUF_TYPE_UINT16 = 2
GGUF_TYPE_INT16 = 3
GGUF_TYPE_UINT32 = 4
GGUF_TYPE_INT32 = 5
GGUF_TYPE_FLOAT32 = 6
GGUF_TYPE_BOOL = 7
GGUF_TYPE_STRING = 8
GGUF_TYPE_ARRAY = 9
GGUF_TYPE_UINT64 = 10
GGUF_TYPE_INT64 = 11
GGUF_TYPE_FLOAT64 = 12

# Metadata keys we want to extract (Gap #3)
GGUF_KEYS_OF_INTEREST = {
    'general.architecture',
    'general.name',
    'general.file_type',
    'general.quantization_version',
    # Architecture-specific keys (will search with detected arch prefix)
    '.context_length',
    '.embedding_length',
    '.block_count',
    '.attention.head_count',
    '.attention.head_count_kv',
    '.vocab_size',
}


class GGUFMetadata(BaseModel):
    """Extracted metadata from GGUF file (Gap #3)."""
    architecture: str | None = None
    model_name: str | None = None
    context_length: int | None = None
    embedding_length: int | None = None  # hidden_size
    block_count: int | None = None  # num_layers
    attention_head_count: int | None = None
    attention_head_count_kv: int | None = None  # for GQA
    vocab_size: int | None = None
    file_type: int | None = None  # Quantization type code
    quantization_version: int | None = None
    # Human-readable summary
    file_type_name: str | None = None  # e.g., "Q8_0", "Q5_K_M"


class GGUFValidationResult(BaseModel):
    """Result of GGUF file validation (Gap #5)."""
    is_valid: bool
    version: int | None = None
    n_tensors: int | None = None
    n_kv: int | None = None
    file_size_mb: float | None = None
    error: str | None = None
    warning: str | None = None


def validate_gguf_file(filepath: str) -> GGUFValidationResult:
    """Validate a GGUF file by checking its header structure (Gap #5).
    
    Checks:
    - Magic bytes ('GGUF')
    - Version number (2 or 3)
    - Basic header structure (tensor count, KV count)
    - File size sanity
    
    Args:
        filepath: Path to GGUF file to validate
        
    Returns:
        GGUFValidationResult with validation status and metadata
    """
    try:
        if not os.path.exists(filepath):
            return GGUFValidationResult(
                is_valid=False,
                error=f"File not found: {filepath}"
            )
        
        file_size = os.path.getsize(filepath)
        file_size_mb = file_size / (1024 * 1024)
        
        # Check minimum file size
        if file_size < GGUF_MIN_FILE_SIZE:
            return GGUFValidationResult(
                is_valid=False,
                file_size_mb=file_size_mb,
                error=f"File too small ({file_size} bytes) - appears truncated or corrupted"
            )
        
        with open(filepath, 'rb') as f:
            # Read magic bytes (4 bytes)
            magic = f.read(4)
            if magic != GGUF_MAGIC:
                # Check if it might be an old GGML file
                if magic[:4] == b'lmgg' or magic[:4] == b'ggml':
                    return GGUFValidationResult(
                        is_valid=False,
                        file_size_mb=file_size_mb,
                        error="This is a legacy GGML file, not GGUF. Please convert to GGUF format."
                    )
                return GGUFValidationResult(
                    is_valid=False,
                    file_size_mb=file_size_mb,
                    error=f"Invalid magic bytes: expected 'GGUF', got {magic!r}"
                )
            
            # Read version (uint32, little-endian)
            version_bytes = f.read(4)
            if len(version_bytes) < 4:
                return GGUFValidationResult(
                    is_valid=False,
                    file_size_mb=file_size_mb,
                    error="File truncated: could not read version"
                )
            version = struct.unpack('<I', version_bytes)[0]
            
            if version not in GGUF_SUPPORTED_VERSIONS:
                return GGUFValidationResult(
                    is_valid=False,
                    version=version,
                    file_size_mb=file_size_mb,
                    error=f"Unsupported GGUF version: {version}. Supported versions: {GGUF_SUPPORTED_VERSIONS}"
                )
            
            # Read tensor count (uint64, little-endian)
            n_tensors_bytes = f.read(8)
            if len(n_tensors_bytes) < 8:
                return GGUFValidationResult(
                    is_valid=False,
                    version=version,
                    file_size_mb=file_size_mb,
                    error="File truncated: could not read tensor count"
                )
            n_tensors = struct.unpack('<Q', n_tensors_bytes)[0]
            
            # Read KV count (uint64, little-endian)
            n_kv_bytes = f.read(8)
            if len(n_kv_bytes) < 8:
                return GGUFValidationResult(
                    is_valid=False,
                    version=version,
                    n_tensors=n_tensors,
                    file_size_mb=file_size_mb,
                    error="File truncated: could not read KV count"
                )
            n_kv = struct.unpack('<Q', n_kv_bytes)[0]
            
            # Sanity checks
            warning = None
            if n_tensors == 0:
                warning = "GGUF file has 0 tensors - may be metadata-only or corrupted"
            elif n_tensors > 100000:
                warning = f"Unusually high tensor count ({n_tensors}) - verify file integrity"
            
            if n_kv > 10000:
                warning = f"Unusually high metadata count ({n_kv}) - verify file integrity"
            
            return GGUFValidationResult(
                is_valid=True,
                version=version,
                n_tensors=n_tensors,
                n_kv=n_kv,
                file_size_mb=round(file_size_mb, 2),
                warning=warning
            )
            
    except PermissionError:
        return GGUFValidationResult(
            is_valid=False,
            error=f"Permission denied: cannot read {filepath}"
        )
    except Exception as e:
        return GGUFValidationResult(
            is_valid=False,
            error=f"Validation error: {str(e)}"
        )


def validate_gguf_files_in_directory(directory: str) -> dict[str, GGUFValidationResult]:
    """Validate all GGUF files in a directory.
    
    Args:
        directory: Directory to scan for GGUF files
        
    Returns:
        Dict mapping filename to validation result
    """
    results: dict[str, GGUFValidationResult] = {}
    
    try:
        for filename in os.listdir(directory):
            if filename.lower().endswith('.gguf'):
                filepath = os.path.join(directory, filename)
                results[filename] = validate_gguf_file(filepath)
    except Exception:
        pass
    
    return results


# GGUF file type codes to human-readable names
GGUF_FILE_TYPE_NAMES = {
    0: "F32",
    1: "F16",
    2: "Q4_0",
    3: "Q4_1",
    6: "Q5_0",
    7: "Q5_1",
    8: "Q8_0",
    9: "Q8_1",
    10: "Q2_K",
    11: "Q3_K_S",
    12: "Q3_K_M",
    13: "Q3_K_L",
    14: "Q4_K_S",
    15: "Q4_K_M",
    16: "Q5_K_S",
    17: "Q5_K_M",
    18: "Q6_K",
    19: "IQ2_XXS",
    20: "IQ2_XS",
    21: "IQ3_XXS",
    22: "IQ1_S",
    23: "IQ4_NL",
    24: "IQ3_S",
    25: "IQ2_S",
    26: "IQ4_XS",
}


def _read_gguf_string(f) -> str:
    """Read a GGUF string (length-prefixed, no null terminator)."""
    length = struct.unpack('<Q', f.read(8))[0]
    if length > 1024 * 1024:  # Sanity check: 1MB max string
        raise ValueError(f"String length too large: {length}")
    return f.read(length).decode('utf-8', errors='replace')


def _read_gguf_value(f, value_type: int) -> Any:
    """Read a GGUF value based on its type."""
    if value_type == GGUF_TYPE_UINT8:
        return struct.unpack('<B', f.read(1))[0]
    elif value_type == GGUF_TYPE_INT8:
        return struct.unpack('<b', f.read(1))[0]
    elif value_type == GGUF_TYPE_UINT16:
        return struct.unpack('<H', f.read(2))[0]
    elif value_type == GGUF_TYPE_INT16:
        return struct.unpack('<h', f.read(2))[0]
    elif value_type == GGUF_TYPE_UINT32:
        return struct.unpack('<I', f.read(4))[0]
    elif value_type == GGUF_TYPE_INT32:
        return struct.unpack('<i', f.read(4))[0]
    elif value_type == GGUF_TYPE_FLOAT32:
        return struct.unpack('<f', f.read(4))[0]
    elif value_type == GGUF_TYPE_BOOL:
        return struct.unpack('<?', f.read(1))[0]
    elif value_type == GGUF_TYPE_STRING:
        return _read_gguf_string(f)
    elif value_type == GGUF_TYPE_UINT64:
        return struct.unpack('<Q', f.read(8))[0]
    elif value_type == GGUF_TYPE_INT64:
        return struct.unpack('<q', f.read(8))[0]
    elif value_type == GGUF_TYPE_FLOAT64:
        return struct.unpack('<d', f.read(8))[0]
    elif value_type == GGUF_TYPE_ARRAY:
        # Array: type (uint32), count (uint64), then values
        arr_type = struct.unpack('<I', f.read(4))[0]
        arr_count = struct.unpack('<Q', f.read(8))[0]
        if arr_count > 1000000:  # Sanity check
            raise ValueError(f"Array too large: {arr_count}")
        return [_read_gguf_value(f, arr_type) for _ in range(arr_count)]
    else:
        raise ValueError(f"Unknown GGUF type: {value_type}")


def extract_gguf_metadata(filepath: str) -> GGUFMetadata | None:
    """Extract metadata from a GGUF file (Gap #3).
    
    Reads the GGUF header and metadata key-value pairs to extract
    model architecture, context length, hidden size, etc.
    
    Args:
        filepath: Path to GGUF file
        
    Returns:
        GGUFMetadata with extracted values, or None on error
    """
    try:
        with open(filepath, 'rb') as f:
            # Read and validate header
            magic = f.read(4)
            if magic != GGUF_MAGIC:
                return None
            
            version = struct.unpack('<I', f.read(4))[0]
            if version not in GGUF_SUPPORTED_VERSIONS:
                return None
            
            n_tensors = struct.unpack('<Q', f.read(8))[0]
            n_kv = struct.unpack('<Q', f.read(8))[0]
            
            # Limit to prevent excessive parsing
            if n_kv > 10000:
                return None
            
            # Parse metadata key-value pairs
            metadata: dict[str, Any] = {}
            architecture: str | None = None
            
            for _ in range(n_kv):
                try:
                    key = _read_gguf_string(f)
                    value_type = struct.unpack('<I', f.read(4))[0]
                    value = _read_gguf_value(f, value_type)
                    
                    # Store keys we care about
                    if key == 'general.architecture':
                        architecture = value
                        metadata['architecture'] = value
                    elif key == 'general.name':
                        metadata['model_name'] = value
                    elif key == 'general.file_type':
                        metadata['file_type'] = value
                    elif key == 'general.quantization_version':
                        metadata['quantization_version'] = value
                    elif key.endswith('.context_length'):
                        metadata['context_length'] = value
                    elif key.endswith('.embedding_length'):
                        metadata['embedding_length'] = value
                    elif key.endswith('.block_count'):
                        metadata['block_count'] = value
                    elif key.endswith('.attention.head_count') and not key.endswith('_kv'):
                        metadata['attention_head_count'] = value
                    elif key.endswith('.attention.head_count_kv'):
                        metadata['attention_head_count_kv'] = value
                    elif key.endswith('.vocab_size'):
                        # Can come from tokenizer.ggml.tokens array length or dedicated key
                        metadata['vocab_size'] = value
                    elif key == 'tokenizer.ggml.tokens' and isinstance(value, list):
                        # Fallback: get vocab size from tokenizer tokens array
                        if 'vocab_size' not in metadata:
                            metadata['vocab_size'] = len(value)
                except Exception:
                    # Skip malformed entries but continue parsing
                    break
            
            # Map file_type to human-readable name
            file_type_name = None
            if 'file_type' in metadata:
                file_type_name = GGUF_FILE_TYPE_NAMES.get(metadata['file_type'])
            
            return GGUFMetadata(
                architecture=metadata.get('architecture'),
                model_name=metadata.get('model_name'),
                context_length=metadata.get('context_length'),
                embedding_length=metadata.get('embedding_length'),
                block_count=metadata.get('block_count'),
                attention_head_count=metadata.get('attention_head_count'),
                attention_head_count_kv=metadata.get('attention_head_count_kv'),
                vocab_size=metadata.get('vocab_size'),
                file_type=metadata.get('file_type'),
                quantization_version=metadata.get('quantization_version'),
                file_type_name=file_type_name
            )
            
    except Exception:
        return None


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
    # Gap #3: GGUF metadata extraction
    metadata: GGUFMetadata | None = None


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
        
        # Gap #3: Extract metadata from the first file in the group
        metadata = None
        if group_data['full_paths']:
            first_file = sorted(group_data['full_paths'])[0]
            try:
                metadata = extract_gguf_metadata(first_file)
            except Exception:
                pass  # Metadata extraction is best-effort
        
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
            warning=warning,
            metadata=metadata
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
