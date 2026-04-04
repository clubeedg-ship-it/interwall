"""
Component Extractor for parsing product SKUs and descriptions.
Maps product specifications to inventory component parts.
"""

import re
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ExtractedComponents:
    """Components extracted from a product SKU/description."""

    cpu: Optional[str] = None
    gpu: Optional[str] = None
    ram_gb: int = 0
    ssd_size: Optional[str] = None
    motherboard: Optional[str] = None
    case: Optional[str] = None
    psu: Optional[str] = None

    # Raw values for debugging
    raw_cpu: Optional[str] = None
    raw_gpu: Optional[str] = None
    raw_ssd: Optional[str] = None

    def __str__(self) -> str:
        parts = []
        if self.cpu:
            parts.append(f"CPU: {self.cpu}")
        if self.gpu:
            parts.append(f"GPU: {self.gpu}")
        if self.ram_gb:
            parts.append(f"RAM: {self.ram_gb}GB")
        if self.ssd_size:
            parts.append(f"SSD: {self.ssd_size}")
        return ", ".join(parts) if parts else "No components"


class ComponentExtractor:
    """
    Extracts component information from product SKUs and descriptions.

    SKU Format: OMX-{MODEL}-{YEAR}-{CPU}-{GPU}-{RAM}G-{SSD}T
    Example: OMX-GHANA-2026-R7-5700X-RTX5050-16G-1T
    """

    # CPU mapping: SKU pattern -> Inventory name (MUST match InvenTree exactly)
    CPU_MAP = {
        # AMD Ryzen - SKU patterns
        "R3-3200": "RYZEN 3-3200",
        "R5-3400G": "RYZEN 5-3400G", 
        "R5-4500": "RYZEN 5-4500",
        "R7-5700G": "RYZEN 7-5700G",
        "R7-5700X": "RYZEN 7-5700X",
        # Intel
        "I5-15": "INTEL-15",
    }

    # GPU mapping: SKU pattern -> Inventory name (MUST match InvenTree exactly)
    GPU_MAP = {
        "RTX3050": "RTX3050-6GB",
        "RTX3050-6GB": "RTX3050-6GB",
        "RTX-3060": "RTX-3060",
        "RTX3060": "RTX-3060",
        "RTX5050": "RTX-5050",
        "RTX-5050": "RTX-5050",
        "RTX5060": "RTX-5060",
        "RTX-5060": "RTX-5060",
        "RTX5060TI": "RTX-5060TI",
        "RTX-5060TI": "RTX-5060TI",
    }

    # SSD mapping: SKU pattern -> Inventory name (MUST match InvenTree exactly)
    SSD_MAP = {
        "256G": "256GB SSD",
        "512G": "512GB SSD",
        "1T": "1TB SSD",
        "2T": "2TB SSD",
    }
    
    # Description patterns for fuzzy matching (regex -> inventory name)
    CPU_PATTERNS = [
        (r'ryzen\s*3[-\s]*3200', 'RYZEN 3-3200'),
        (r'ryzen\s*5[-\s]*3400\s*g?', 'RYZEN 5-3400G'),
        (r'ryzen\s*5[-\s]*4500', 'RYZEN 5-4500'),
        (r'ryzen\s*7[-\s]*5700\s*g', 'RYZEN 7-5700G'),
        (r'ryzen\s*7[-\s]*5700(?:\s*x)?', 'RYZEN 7-5700X'),
    ]
    
    GPU_PATTERNS = [
        (r'rtx[-\s]*3050[-\s]*6\s*gb', 'RTX3050-6GB'),
        (r'rtx[-\s]*3050(?!-)', 'RTX3050-6GB'),
        (r'rtx[-\s]*3060', 'RTX-3060'),
        (r'(?:geforce\s*)?rtx[-\s]*5050', 'RTX-5050'),
        (r'(?:geforce\s*)?rtx[-\s]*5060\s*ti', 'RTX-5060TI'),
        (r'(?:geforce\s*)?rtx[-\s]*5060(?!\s*ti)', 'RTX-5060'),
    ]
    
    SSD_PATTERNS = [
        (r'256\s*gb\s*ssd|ssd\s*256', '256GB SSD'),
        (r'512\s*gb\s*ssd|ssd\s*512', '512GB SSD'),
        (r'1\s*tb\s*ssd|ssd\s*1\s*tb', '1TB SSD'),
        (r'2\s*tb\s*ssd|ssd\s*2\s*tb', '2TB SSD'),
    ]

    # Motherboard mapping (for description parsing)
    MOTHERBOARD_MAP = {
        "A520": "A520",
        "H510": "H510",
        "B450": "B450",
        "B550": "B550",
    }

    def extract_from_sku(self, sku: str) -> ExtractedComponents:
        """
        Extract components from a product SKU.

        Args:
            sku: Product SKU like "OMX-GHANA-2026-R7-5700X-RTX5050-16G-1T"

        Returns:
            ExtractedComponents with identified parts.
        """
        components = ExtractedComponents()

        if not sku:
            return components

        # Normalize SKU
        sku_upper = sku.upper()
        parts = sku_upper.split("-")

        # Look for CPU pattern (R3, R5, R7 followed by model)
        for i, part in enumerate(parts):
            # Check for Ryzen pattern like "R7" followed by "5700X"
            if part in ("R3", "R5", "R7") and i + 1 < len(parts):
                cpu_key = f"{part}-{parts[i+1]}"
                components.raw_cpu = cpu_key
                if cpu_key in self.CPU_MAP:
                    components.cpu = self.CPU_MAP[cpu_key]
                    break

        # Look for GPU pattern
        for part in parts:
            # Try exact match first
            if part in self.GPU_MAP:
                components.raw_gpu = part
                components.gpu = self.GPU_MAP[part]
                break
            # Try with RTX prefix
            if part.startswith("RTX"):
                components.raw_gpu = part
                if part in self.GPU_MAP:
                    components.gpu = self.GPU_MAP[part]
                break

        # Look for RAM pattern (digits followed by G)
        ram_match = re.search(r"(\d+)G(?!B)", sku_upper)
        if ram_match:
            components.ram_gb = int(ram_match.group(1))

        # Look for SSD pattern (digits followed by T or G)
        for part in parts:
            if part in self.SSD_MAP:
                components.raw_ssd = part
                components.ssd_size = self.SSD_MAP[part]
                break

        logger.debug(f"Extracted from SKU '{sku}': {components}")
        return components

    def extract_from_description(self, description: str) -> ExtractedComponents:
        """
        Extract components from a product description using fuzzy regex patterns.

        Args:
            description: Product description with specs.

        Returns:
            ExtractedComponents with identified parts.
        """
        components = ExtractedComponents()

        if not description:
            return components

        # Extract RAM - handles "RAM 16 GB", "16GB RAM", "16 GB DDR4", etc.
        ram_match = re.search(r"(?:RAM\s+)?(\d+)\s*GB(?:\s*(?:RAM|DDR\d))?", description, re.IGNORECASE)
        if ram_match:
            components.ram_gb = int(ram_match.group(1))

        # Extract CPU using fuzzy patterns
        for pattern, name in self.CPU_PATTERNS:
            if re.search(pattern, description, re.IGNORECASE):
                components.cpu = name
                break

        # Extract GPU using fuzzy patterns
        for pattern, name in self.GPU_PATTERNS:
            if re.search(pattern, description, re.IGNORECASE):
                components.gpu = name
                break

        # Extract SSD using fuzzy patterns
        for pattern, name in self.SSD_PATTERNS:
            if re.search(pattern, description, re.IGNORECASE):
                components.ssd_size = name
                break

        # Extract motherboard
        for pattern, name in self.MOTHERBOARD_MAP.items():
            if pattern.upper() in description.upper():
                components.motherboard = name
                break

        logger.debug(f"Extracted from description: {components}")
        return components

    def extract(self, sku: str = "", description: str = "") -> ExtractedComponents:
        """
        Extract components from both SKU and description, merging results.
        SKU takes precedence for overlapping fields.

        Args:
            sku: Product SKU.
            description: Product description.

        Returns:
            Merged ExtractedComponents.
        """
        sku_components = self.extract_from_sku(sku)
        desc_components = self.extract_from_description(description)

        # Merge: SKU takes precedence
        merged = ExtractedComponents(
            cpu=sku_components.cpu or desc_components.cpu,
            gpu=sku_components.gpu or desc_components.gpu,
            ram_gb=sku_components.ram_gb or desc_components.ram_gb,
            ssd_size=sku_components.ssd_size or desc_components.ssd_size,
            motherboard=desc_components.motherboard,  # Usually from description
            case=desc_components.case,
            psu=desc_components.psu,
            raw_cpu=sku_components.raw_cpu,
            raw_gpu=sku_components.raw_gpu,
            raw_ssd=sku_components.raw_ssd,
        )

        logger.info(f"Extracted components: {merged}")
        return merged
