"""
Fixed Elements Configuration Loader.
Loads fixed costs and components from config file.
"""

import json
import logging
from pathlib import Path
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# Config file path - check shared_config first (Docker), then fall back to config/
SHARED_CONFIG = Path("/app/shared_config/fixed_elements.json")
LOCAL_CONFIG = Path(__file__).parent.parent / "shared_config" / "fixed_elements.json"
LEGACY_CONFIG = Path(__file__).parent.parent / "config" / "fixed_elements.json"

# Use shared config if in Docker, otherwise local, otherwise legacy
if SHARED_CONFIG.exists():
    FIXED_ELEMENTS_FILE = SHARED_CONFIG
elif LOCAL_CONFIG.exists():
    FIXED_ELEMENTS_FILE = LOCAL_CONFIG
else:
    FIXED_ELEMENTS_FILE = LEGACY_CONFIG


@dataclass
class FixedCost:
    """A fixed cost (commission, overhead, etc.)"""
    id: str
    name: str
    type: str  # 'fixed' or 'percentage'
    value: float
    enabled: bool
    basis: Optional[str] = None  # 'salePrice' for percentage costs


@dataclass
class FixedComponent:
    """A fixed component (case, PSU, etc.)"""
    id: str
    part_id: int
    part_name: str
    sku: str
    quantity: int
    enabled: bool


class FixedElementsConfig:
    """
    Loads and provides access to fixed elements configuration.
    
    Fixed elements include:
    - Fixed costs: commission, logistics overhead
    - Fixed components: case, PSU (included in every PC)
    """
    
    def __init__(self, config_path: Path = None):
        self.config_path = config_path or FIXED_ELEMENTS_FILE
        self._costs: list[FixedCost] = []
        self._components: list[FixedComponent] = []
        self._loaded = False
    
    def load(self) -> bool:
        """Load configuration from file."""
        try:
            if not self.config_path.exists():
                logger.warning(f"Config file not found: {self.config_path}")
                return False
            
            with open(self.config_path, 'r') as f:
                data = json.load(f)
            
            # Load fixed costs
            self._costs = []
            for cost_data in data.get('fixed_costs', []):
                self._costs.append(FixedCost(
                    id=cost_data['id'],
                    name=cost_data['name'],
                    type=cost_data['type'],
                    value=cost_data['value'],
                    enabled=cost_data.get('enabled', True),
                    basis=cost_data.get('basis'),
                ))
            
            # Load fixed components
            self._components = []
            for comp_data in data.get('fixed_components', []):
                self._components.append(FixedComponent(
                    id=comp_data['id'],
                    part_id=comp_data['partId'],
                    part_name=comp_data['partName'],
                    sku=comp_data.get('sku', comp_data['partName']),
                    quantity=comp_data.get('quantity', 1),
                    enabled=comp_data.get('enabled', True),
                ))
            
            self._loaded = True
            logger.info(f"Loaded {len(self._costs)} fixed costs, {len(self._components)} fixed components")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load fixed elements config: {e}")
            return False
    
    @property
    def costs(self) -> list[FixedCost]:
        """Get enabled fixed costs."""
        if not self._loaded:
            self.load()
        return [c for c in self._costs if c.enabled]
    
    @property
    def components(self) -> list[FixedComponent]:
        """Get enabled fixed components."""
        if not self._loaded:
            self.load()
        return [c for c in self._components if c.enabled]
    
    def get_commission_rate(self) -> float:
        """Get commission rate as decimal (e.g., 0.062 for 6.2%)."""
        for cost in self.costs:
            if cost.id == 'commission' and cost.type == 'percentage':
                return cost.value / 100
        return 0.0
    
    def get_fixed_overhead(self) -> float:
        """Get total fixed overhead cost."""
        total = 0.0
        for cost in self.costs:
            if cost.type == 'fixed':
                total += cost.value
        return total
    
    def calculate_total_costs(self, sale_price: float) -> dict:
        """
        Calculate all costs for a sale.
        
        Returns dict with:
        - commission: commission amount
        - overhead: fixed overhead amount
        - total_costs: sum of all costs
        - components: list of fixed component costs (to be added)
        """
        commission = sale_price * self.get_commission_rate()
        overhead = self.get_fixed_overhead()
        
        return {
            'commission': commission,
            'overhead': overhead,
            'total_costs': commission + overhead,
            'fixed_components': [
                {'sku': c.sku, 'part_id': c.part_id, 'quantity': c.quantity}
                for c in self.components
            ]
        }


# Singleton instance
_config_instance: Optional[FixedElementsConfig] = None


def get_fixed_elements_config() -> FixedElementsConfig:
    """Get the singleton config instance."""
    global _config_instance
    if _config_instance is None:
        _config_instance = FixedElementsConfig()
        _config_instance.load()
    return _config_instance
