"""
Part Mapper - Maps email text to InvenTree part names.

Uses a combination of:
1. Static pattern matching for known formats
2. Fuzzy matching as fallback
3. Cached inventory catalog for performance
"""

import re
import logging
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class PartMatch:
    """Result of a part mapping."""
    inventory_name: str
    part_id: int
    confidence: float  # 0.0 to 1.0
    match_type: str  # "exact", "pattern", "fuzzy"


class PartMapper:
    """
    Maps component names from emails to InvenTree inventory parts.
    
    Designed to be deterministic and fast - no LLM calls.
    """
    
    # Static pattern mappings for known formats
    # Maps regex patterns to inventory name templates
    CPU_PATTERNS = {
        r'ryzen\s*3[-\s]*3200': 'RYZEN 3-3200',
        r'ryzen\s*5[-\s]*3400\s*g?': 'RYZEN 5-3400G',
        r'ryzen\s*5[-\s]*4500': 'RYZEN 5-4500',
        r'ryzen\s*7[-\s]*5700\s*g': 'RYZEN 7-5700G',
        r'ryzen\s*7[-\s]*5700\s*x?': 'RYZEN 7-5700X',
        r'intel[-\s]*i5|core\s*i5': 'INTEL-15',  # Assuming INTEL-15 means i5
    }
    
    GPU_PATTERNS = {
        r'rtx[-\s]*3050[-\s]*6\s*gb': 'RTX3050-6GB',
        r'rtx[-\s]*3050(?!-)': 'RTX3050-6GB',  # Default 3050 to 6GB
        r'rtx[-\s]*3060': 'RTX-3060',
        r'rtx[-\s]*5050': 'RTX-5050',
        r'rtx[-\s]*5060\s*ti': 'RTX-5060TI',
        r'rtx[-\s]*5060(?!\s*ti)': 'RTX-5060',
        r'geforce\s*rtx[-\s]*5050': 'RTX-5050',
        r'geforce\s*rtx[-\s]*5060\s*ti': 'RTX-5060TI',
        r'geforce\s*rtx[-\s]*5060(?!\s*ti)': 'RTX-5060',
    }
    
    RAM_PATTERNS = {
        r'(?:ram\s*)?8\s*gb(?:\s*ram)?': '8GB RAM',
        r'(?:ram\s*)?16\s*gb(?:\s*ram)?': '16GB RAM',
        r'(?:ram\s*)?32\s*gb(?:\s*ram)?': '32GB RAM',  # If added later
    }
    
    SSD_PATTERNS = {
        r'256\s*gb\s*ssd|ssd\s*256\s*gb': '256GB SSD',
        r'512\s*gb\s*ssd|ssd\s*512\s*gb': '512GB SSD',
        r'1\s*tb\s*ssd|ssd\s*1\s*tb|1000\s*gb\s*ssd': '1TB SSD',
        r'2\s*tb\s*ssd|ssd\s*2\s*tb|2000\s*gb\s*ssd': '2TB SSD',
    }
    
    MOTHERBOARD_PATTERNS = {
        r'a520|am4\s*a520': 'A520',
        r'h510|lga\s*1200\s*h510': 'H510',
    }
    
    def __init__(self, inventory_cache: dict = None):
        """
        Initialize the mapper.
        
        Args:
            inventory_cache: Optional dict of {part_name: part_id} from InvenTree.
                           If not provided, will work without part IDs.
        """
        self.inventory_cache = inventory_cache or {}
        self._compile_patterns()
    
    def _compile_patterns(self):
        """Compile all regex patterns for efficiency."""
        self._cpu_compiled = [(re.compile(p, re.IGNORECASE), n) 
                             for p, n in self.CPU_PATTERNS.items()]
        self._gpu_compiled = [(re.compile(p, re.IGNORECASE), n) 
                             for p, n in self.GPU_PATTERNS.items()]
        self._ram_compiled = [(re.compile(p, re.IGNORECASE), n) 
                             for p, n in self.RAM_PATTERNS.items()]
        self._ssd_compiled = [(re.compile(p, re.IGNORECASE), n) 
                             for p, n in self.SSD_PATTERNS.items()]
        self._mb_compiled = [(re.compile(p, re.IGNORECASE), n) 
                            for p, n in self.MOTHERBOARD_PATTERNS.items()]
    
    def update_cache(self, inventory: dict):
        """
        Update the inventory cache.
        
        Args:
            inventory: Dict of {part_name: part_id} from InvenTree.
        """
        self.inventory_cache = inventory
        logger.info(f"Updated inventory cache with {len(inventory)} parts")
    
    def _get_part_id(self, name: str) -> int:
        """Get part ID from cache, or 0 if not found."""
        return self.inventory_cache.get(name, 0)
    
    def _match_patterns(self, text: str, patterns: list) -> Optional[str]:
        """Try to match text against a list of compiled patterns."""
        for pattern, inventory_name in patterns:
            if pattern.search(text):
                return inventory_name
        return None
    
    def map_cpu(self, text: str) -> Optional[PartMatch]:
        """Map CPU text to inventory part."""
        inventory_name = self._match_patterns(text, self._cpu_compiled)
        if inventory_name:
            return PartMatch(
                inventory_name=inventory_name,
                part_id=self._get_part_id(inventory_name),
                confidence=1.0,
                match_type="pattern"
            )
        return None
    
    def map_gpu(self, text: str) -> Optional[PartMatch]:
        """Map GPU text to inventory part."""
        inventory_name = self._match_patterns(text, self._gpu_compiled)
        if inventory_name:
            return PartMatch(
                inventory_name=inventory_name,
                part_id=self._get_part_id(inventory_name),
                confidence=1.0,
                match_type="pattern"
            )
        return None
    
    def map_ram(self, text: str) -> Optional[PartMatch]:
        """Map RAM text to inventory part."""
        inventory_name = self._match_patterns(text, self._ram_compiled)
        if inventory_name:
            return PartMatch(
                inventory_name=inventory_name,
                part_id=self._get_part_id(inventory_name),
                confidence=1.0,
                match_type="pattern"
            )
        return None
    
    def map_ssd(self, text: str) -> Optional[PartMatch]:
        """Map SSD text to inventory part."""
        inventory_name = self._match_patterns(text, self._ssd_compiled)
        if inventory_name:
            return PartMatch(
                inventory_name=inventory_name,
                part_id=self._get_part_id(inventory_name),
                confidence=1.0,
                match_type="pattern"
            )
        return None
    
    def map_motherboard(self, text: str) -> Optional[PartMatch]:
        """Map motherboard text to inventory part."""
        inventory_name = self._match_patterns(text, self._mb_compiled)
        if inventory_name:
            return PartMatch(
                inventory_name=inventory_name,
                part_id=self._get_part_id(inventory_name),
                confidence=1.0,
                match_type="pattern"
            )
        return None
    
    def map_all(self, description: str) -> dict:
        """
        Extract and map all components from a product description.
        
        Args:
            description: Full product description from email.
            
        Returns:
            Dict with mapped components: {cpu, gpu, ram, ssd, motherboard}
        """
        results = {
            'cpu': self.map_cpu(description),
            'gpu': self.map_gpu(description),
            'ram': self.map_ram(description),
            'ssd': self.map_ssd(description),
            'motherboard': self.map_motherboard(description),
        }
        
        # Log what we found
        found = {k: v.inventory_name for k, v in results.items() if v}
        logger.info(f"Mapped components: {found}")
        
        return results


# Convenience function to build cache from InvenTree API response
def build_cache_from_api(parts_list: list) -> dict:
    """
    Build inventory cache from InvenTree API response.
    
    Args:
        parts_list: List of part dicts from /api/part/ endpoint.
        
    Returns:
        Dict of {part_name: part_id}
    """
    return {part['name']: part['pk'] for part in parts_list}


# Example usage / test
if __name__ == '__main__':
    # Test the mapper
    mapper = PartMapper()
    
    # Sample email description
    test_desc = """
    OMIXIMO DESKTOP OMIXIMO PC Gaming AMD Ryzen 7 5700X
    GeForce RTX 5050 16GB DDR4 SSD 1TB Windows 11 Pro
    """
    
    results = mapper.map_all(test_desc)
    
    print("Mapping results:")
    for component, match in results.items():
        if match:
            print(f"  {component}: {match.inventory_name} (confidence: {match.confidence})")
        else:
            print(f"  {component}: NOT FOUND")
