"""
Pytest configuration file.
Ensures correct import paths for all tests.
"""

import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Also add src directory for direct imports
src_path = project_root / "src"
sys.path.insert(0, str(src_path))
