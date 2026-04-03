"""
Universal SKU Generator for Omiximo sales.

Generates consistent SKUs across all marketplaces using the pattern:
  OMX-{MARKETPLACE}-{CPU}-{RAM}-{STORAGE}-{SEQUENCE}

Examples:
  OMX-BOL-R7-16-512-001  (bol.com, Ryzen 7, 16GB RAM, 512GB SSD, first sale)
  OMX-MMS-R7-32-1T-001   (MediaMarktSaturn, Ryzen 7, 32GB, 1TB)
  OMX-BOU-R5-8-256-001   (Boulanger, Ryzen 5, 8GB, 256GB)
"""

import re
import json
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Marketplace codes
MARKETPLACE_CODES = {
    "MediaMarktSaturn": "MMS",
    "BolCom": "BOL",
    "Boulanger": "BOU",
    # Add more as needed
}


@dataclass
class PCSpecs:
    """Extracted PC specifications."""
    cpu_brand: str = ""      # R (Ryzen), I (Intel)
    cpu_tier: str = ""       # 3, 5, 7, 9
    cpu_model: str = ""      # 5700X, 13700K, etc.
    ram_gb: int = 0          # 8, 16, 32, etc.
    storage_gb: int = 0      # 256, 512, 1000 (1TB), 2000 (2TB)
    gpu: str = ""            # RTX5060, RTX5050, etc. (optional for SKU)


class SKUGenerator:
    """
    Generates and tracks universal SKUs for all sales.

    SKU Format: OMX-{MARKETPLACE}-{CPU}-{RAM}-{STORAGE}-{SEQ}

    Where:
    - OMX: Omiximo prefix
    - MARKETPLACE: 3-letter code (BOL, MMS, BOU)
    - CPU: R7, R5, I7, I5, etc.
    - RAM: 8, 16, 32 (GB)
    - STORAGE: 256, 512, 1T, 2T
    - SEQ: 001, 002, etc. (sequence for same config)
    """

    def __init__(self, data_dir: Optional[Path] = None):
        """
        Initialize SKU generator.

        Args:
            data_dir: Directory to store SKU tracking data.
        """
        if data_dir is None:
            data_dir = Path(__file__).parent.parent.parent.parent / "data"
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

        self.sku_file = self.data_dir / "sku_registry.json"
        self._registry = self._load_registry()

    def _load_registry(self) -> dict:
        """Load SKU registry from file."""
        if self.sku_file.exists():
            try:
                with open(self.sku_file, "r") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                logger.warning(f"Could not load SKU registry: {e}")
        return {"skus": {}, "sequences": {}}

    def _save_registry(self):
        """Save SKU registry to file."""
        try:
            with open(self.sku_file, "w") as f:
                json.dump(self._registry, f, indent=2)
        except IOError as e:
            logger.error(f"Could not save SKU registry: {e}")

    def extract_specs(self, description: str) -> PCSpecs:
        """
        Extract PC specifications from product description.

        Args:
            description: Product description text.

        Returns:
            PCSpecs with extracted values.
        """
        specs = PCSpecs()
        desc_upper = description.upper()

        # CPU: Ryzen or Intel
        # Patterns: "Ryzen 7 5700X", "Ryzen 7-5700X", "R7-5700X", "i7-13700K"

        # AMD Ryzen
        ryzen_match = re.search(
            r"(?:RYZEN|R)\s*([3579])[- ]?(\d{4}[A-Z]*)",
            desc_upper
        )
        if ryzen_match:
            specs.cpu_brand = "R"
            specs.cpu_tier = ryzen_match.group(1)
            specs.cpu_model = ryzen_match.group(2)

        # Intel
        if not specs.cpu_brand:
            intel_match = re.search(
                r"(?:INTEL\s*CORE\s*)?I([3579])[- ]?(\d{4,5}[A-Z]*)",
                desc_upper
            )
            if intel_match:
                specs.cpu_brand = "I"
                specs.cpu_tier = intel_match.group(1)
                specs.cpu_model = intel_match.group(2)

        # RAM: "16GB", "32 GB", "16G"
        ram_match = re.search(r"(\d+)\s*G(?:B)?(?:\s|$|[^HT])", desc_upper)
        if ram_match:
            specs.ram_gb = int(ram_match.group(1))

        # Storage: "512GB", "1TB", "2TB", "1T", "2T"
        # Check TB first
        tb_match = re.search(r"(\d+)\s*T(?:B)?(?:\s|$|[^A-Z])", desc_upper)
        if tb_match:
            specs.storage_gb = int(tb_match.group(1)) * 1000
        else:
            # Check for /XTB or /XXXGB patterns (e.g., "16GB/1TB", "16GB/512GB")
            slash_match = re.search(r"/(\d+)\s*(?:TB|T)\b", desc_upper)
            if slash_match:
                specs.storage_gb = int(slash_match.group(1)) * 1000
            else:
                slash_gb_match = re.search(r"/(\d+)\s*(?:GB|G)\b", desc_upper)
                if slash_gb_match:
                    specs.storage_gb = int(slash_gb_match.group(1))
                else:
                    # Look for XXXGB SSD pattern (storage size followed by SSD)
                    storage_match = re.search(
                        r"(\d{3,4})\s*(?:GB|G)\s*(?:SSD|NVME|STORAGE|HDD)",
                        desc_upper
                    )
                    if storage_match:
                        specs.storage_gb = int(storage_match.group(1))
                    else:
                        # Look for SSD XXXGB pattern
                        storage_match = re.search(
                            r"(?:SSD|NVME|STORAGE|HDD)\s*(\d{3,4})\s*(?:GB|G)?",
                            desc_upper
                        )
                        if storage_match:
                            specs.storage_gb = int(storage_match.group(1))
                        else:
                            # Look for common storage sizes (256, 512, 1000, 2000)
                            # that appear after RAM value
                            all_sizes = re.findall(r"(\d+)\s*(?:GB|G)", desc_upper)
                            for size in all_sizes:
                                s = int(size)
                                # Storage is typically 256, 512, 1024, 2048 or larger
                                if s >= 256 and s != specs.ram_gb:
                                    specs.storage_gb = s
                                    break

        # GPU (optional, for reference)
        gpu_match = re.search(r"(RTX|GTX|RX)\s*(\d{4})", desc_upper)
        if gpu_match:
            specs.gpu = f"{gpu_match.group(1)}{gpu_match.group(2)}"

        return specs

    def format_storage(self, storage_gb: int) -> str:
        """Format storage size for SKU."""
        if storage_gb >= 1000:
            tb = storage_gb // 1000
            return f"{tb}T"
        return str(storage_gb)

    def generate_base_sku(self, marketplace: str, specs: PCSpecs) -> str:
        """
        Generate the base SKU (without sequence number).

        Args:
            marketplace: Marketplace name.
            specs: Extracted PC specifications.

        Returns:
            Base SKU string like "OMX-BOL-R7-16-1T"
        """
        # Get marketplace code
        mp_code = MARKETPLACE_CODES.get(marketplace, marketplace[:3].upper())

        # CPU part
        if specs.cpu_brand and specs.cpu_tier:
            cpu_part = f"{specs.cpu_brand}{specs.cpu_tier}"
        else:
            cpu_part = "UNK"

        # RAM part
        ram_part = str(specs.ram_gb) if specs.ram_gb > 0 else "0"

        # Storage part
        storage_part = self.format_storage(specs.storage_gb) if specs.storage_gb > 0 else "0"

        return f"OMX-{mp_code}-{cpu_part}-{ram_part}-{storage_part}"

    def get_next_sequence(self, base_sku: str) -> int:
        """Get next sequence number for a base SKU."""
        sequences = self._registry.get("sequences", {})
        current = sequences.get(base_sku, 0)
        return current + 1

    def generate_sku(
        self,
        marketplace: str,
        description: str,
        order_number: str = ""
    ) -> str:
        """
        Generate a unique SKU for a sale.

        Args:
            marketplace: Marketplace name (e.g., "BolCom", "MediaMarktSaturn")
            description: Product description to extract specs from.
            order_number: Original order number (for tracking).

        Returns:
            Generated SKU like "OMX-BOL-R7-16-1T-001"
        """
        # Extract specs
        specs = self.extract_specs(description)

        # Generate base SKU
        base_sku = self.generate_base_sku(marketplace, specs)

        # Get sequence number
        seq = self.get_next_sequence(base_sku)

        # Full SKU
        full_sku = f"{base_sku}-{seq:03d}"

        # Register it
        self._registry.setdefault("sequences", {})[base_sku] = seq
        self._registry.setdefault("skus", {})[full_sku] = {
            "order_number": order_number,
            "marketplace": marketplace,
            "specs": {
                "cpu": f"{specs.cpu_brand}{specs.cpu_tier}-{specs.cpu_model}",
                "ram_gb": specs.ram_gb,
                "storage_gb": specs.storage_gb,
                "gpu": specs.gpu,
            }
        }
        self._save_registry()

        logger.info(f"Generated SKU: {full_sku} for order {order_number}")
        return full_sku

    def lookup_sku(self, sku: str) -> Optional[dict]:
        """Look up a SKU in the registry."""
        return self._registry.get("skus", {}).get(sku)

    def get_sku_for_order(self, order_number: str) -> Optional[str]:
        """Find SKU by original order number."""
        for sku, data in self._registry.get("skus", {}).items():
            if data.get("order_number") == order_number:
                return sku
        return None


# Singleton instance
_generator: Optional[SKUGenerator] = None


def get_sku_generator() -> SKUGenerator:
    """Get the global SKU generator instance."""
    global _generator
    if _generator is None:
        _generator = SKUGenerator()
    return _generator
