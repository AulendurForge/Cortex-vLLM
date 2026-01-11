#!/usr/bin/env python3
"""
Update copyright year in LICENSE.txt and README.md files.

This script automatically detects the current year and updates copyright notices.
Usage: python scripts/update-copyright-year.py
"""

import re
import sys
from datetime import datetime
from pathlib import Path

# Get the current year
CURRENT_YEAR = datetime.now().year

# Files to update with their patterns
FILES_TO_UPDATE = [
    {
        "path": Path(__file__).parent.parent / "LICENSE.txt",
        "pattern": r"Copyright \d{4} Aulendur Labs",
        "replacement": f"Copyright {CURRENT_YEAR} Aulendur Labs",
    },
    {
        "path": Path(__file__).parent.parent / "README.md",
        "pattern": r"Copyright © \d{4} Aulendur Labs",
        "replacement": f"Copyright © {CURRENT_YEAR} Aulendur Labs",
    },
]


def update_copyright_year(file_path: Path, pattern: str, replacement: str) -> bool:
    """Update copyright year in a file."""
    try:
        content = file_path.read_text(encoding="utf-8")
        new_content = re.sub(pattern, replacement, content)
        
        if content != new_content:
            file_path.write_text(new_content, encoding="utf-8")
            print(f"✓ Updated {file_path.name}")
            return True
        else:
            print(f"  No changes needed in {file_path.name}")
            return False
    except Exception as e:
        print(f"✗ Error updating {file_path.name}: {e}", file=sys.stderr)
        return False


def main():
    """Main function to update copyright years."""
    print(f"Updating copyright year to {CURRENT_YEAR}...")
    print()
    
    updated_count = 0
    for file_info in FILES_TO_UPDATE:
        if update_copyright_year(file_info["path"], file_info["pattern"], file_info["replacement"]):
            updated_count += 1
    
    print()
    if updated_count > 0:
        print(f"✓ Updated {updated_count} file(s)")
    else:
        print("  All files already up to date")
    
    return 0 if updated_count >= 0 else 1


if __name__ == "__main__":
    sys.exit(main())

