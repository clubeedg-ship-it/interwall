"""
Stock Manager for handling inventory operations.
Includes special RAM deduction logic and component-based deduction.
Creates Sales Orders for profitability tracking.
"""

import logging
from dataclasses import dataclass
from typing import Optional

from src.config import Config
from src.config_loader import get_fixed_elements_config
from src.marketplace_parsers.base import OrderData
from src.utils.component_extractor import ComponentExtractor, ExtractedComponents
from .inventree_client import InvenTreeClient
from .sales_order_manager import SalesOrderManager

logger = logging.getLogger(__name__)


@dataclass
class DeductionResult:
    """Result of a stock deduction operation."""

    success: bool
    part_id: int = 0
    sku: str = ""
    quantity_deducted: int = 0
    batches_used: list = None
    error: str = ""

    def __post_init__(self):
        if self.batches_used is None:
            self.batches_used = []


class StockManager:
    """
    Manages stock operations with special handling for RAM.

    RAM Deduction Logic:
    - PC with "RAM 8 GB"  = 1x 8GB stick
    - PC with "RAM 16 GB" = 2x 8GB sticks
    - PC with "RAM 32 GB" = 2x 16GB sticks
    """

    # RAM size to stick configuration mapping
    RAM_CONFIG = {
        8: (8, 1),     # 8GB total -> 1x 8GB stick
        16: (8, 2),    # 16GB total -> 2x 8GB sticks
        32: (16, 2),   # 32GB total -> 2x 16GB sticks
    }

    def __init__(self, client: Optional[InvenTreeClient] = None):
        self.client = client or InvenTreeClient()
        self.ram_8gb_sku = Config.RAM_8GB_SKU
        self.ram_16gb_sku = Config.RAM_16GB_SKU
        self.component_extractor = ComponentExtractor()
        self.sales_order_manager = SalesOrderManager(self.client)
        self.fixed_elements = get_fixed_elements_config()

    def process_order(self, order: OrderData, create_sales_order: bool = True) -> list[DeductionResult]:
        """
        Process an order and deduct all required stock.
        Uses component-based deduction to handle individual parts.
        Creates a Sales Order for profitability tracking.

        Args:
            order: Parsed order data.
            create_sales_order: Whether to create a sales order (default True).

        Returns:
            List of deduction results.
        """
        results = []

        # Extract components from SKU and description
        components = self.component_extractor.extract(
            sku=order.sku,
            description=order.product_description,
        )

        logger.info(
            f"Processing order {order.order_number}: "
            f"CPU={components.cpu}, GPU={components.gpu}, "
            f"RAM={components.ram_gb}GB, SSD={components.ssd_size}"
        )

        # Deduct each component (from email)
        component_results = self.deduct_components(
            components=components,
            quantity=order.quantity,
            order_ref=order.order_number,
        )
        results.extend(component_results)

        # Deduct fixed components (case, PSU, etc.)
        fixed_results = self.deduct_fixed_components(
            quantity=order.quantity,
            order_ref=order.order_number,
        )
        results.extend(fixed_results)

        # Create Sales Order for profitability tracking
        if create_sales_order:
            components_sold = self._build_components_sold(
                components=components,
                order=order,
            )
            so_result = self.sales_order_manager.create_sales_order(
                order=order,
                components_sold=components_sold,
            )
            if so_result.success:
                logger.info(f"Created Sales Order {so_result.order_reference}")
            else:
                logger.warning(f"Failed to create Sales Order: {so_result.error}")

        return results

    def deduct_fixed_components(
        self,
        quantity: int = 1,
        order_ref: str = "",
    ) -> list[DeductionResult]:
        """
        Deduct fixed components (case, PSU, etc.) from inventory.
        These are configured in config/fixed_elements.json.

        Args:
            quantity: Number of PCs (multiplies fixed components).
            order_ref: Order reference for notes.

        Returns:
            List of DeductionResults.
        """
        results = []
        
        # Reload config to get latest values
        self.fixed_elements.load()
        
        for fixed_comp in self.fixed_elements.components:
            result = self.deduct_stock_by_sku(
                sku=fixed_comp.sku,
                quantity=fixed_comp.quantity * quantity,
                order_ref=order_ref,
            )
            result.sku = f"Fixed: {fixed_comp.part_name}"
            results.append(result)
        
        return results

    def _build_components_sold(
        self,
        components: ExtractedComponents,
        order: OrderData,
    ) -> list[dict]:
        """Build list of components with estimated prices for sales order."""
        sold = []
        
        # RAM
        if components.ram_gb > 0:
            config = self.RAM_CONFIG.get(components.ram_gb, (8, components.ram_gb // 8))
            stick_size, num_sticks = config
            ram_sku = self.ram_8gb_sku if stick_size == 8 else self.ram_16gb_sku
            sold.append({
                "sku": ram_sku,
                "quantity": num_sticks * order.quantity,
                "unit_price": 0,  # Price tracked at order level
                "notes": f"{components.ram_gb}GB total -> {num_sticks}x {stick_size}GB",
            })
        
        # SSD
        if components.ssd_size:
            sold.append({
                "sku": components.ssd_size,
                "quantity": order.quantity,
                "unit_price": 0,
                "notes": f"SSD: {components.ssd_size}",
            })
        
        # CPU
        if components.cpu:
            sold.append({
                "sku": components.cpu,
                "quantity": order.quantity,
                "unit_price": 0,
                "notes": f"CPU: {components.cpu}",
            })
        
        # GPU
        if components.gpu:
            sold.append({
                "sku": components.gpu,
                "quantity": order.quantity,
                "unit_price": 0,
                "notes": f"GPU: {components.gpu}",
            })
        
        # Fixed components (case, PSU, etc.)
        for fixed_comp in self.fixed_elements.components:
            sold.append({
                "sku": fixed_comp.sku,
                "quantity": fixed_comp.quantity * order.quantity,
                "unit_price": 0,
                "notes": f"Fixed: {fixed_comp.part_name}",
            })
        
        return sold

    def deduct_components(
        self,
        components: ExtractedComponents,
        quantity: int = 1,
        order_ref: str = "",
    ) -> list[DeductionResult]:
        """
        Deduct all identified components from inventory.

        Args:
            components: Extracted component information.
            quantity: Number of units (PCs) to deduct for.
            order_ref: Order reference for notes.

        Returns:
            List of DeductionResults for each component.
        """
        results = []

        # 1. Deduct CPU
        if components.cpu:
            cpu_result = self.deduct_stock_by_sku(
                sku=components.cpu,
                quantity=quantity,
                order_ref=order_ref,
            )
            cpu_result.sku = f"CPU: {components.cpu}"
            results.append(cpu_result)

        # 2. Deduct GPU
        if components.gpu:
            gpu_result = self.deduct_stock_by_sku(
                sku=components.gpu,
                quantity=quantity,
                order_ref=order_ref,
            )
            gpu_result.sku = f"GPU: {components.gpu}"
            results.append(gpu_result)

        # 3. Deduct RAM (using special RAM deduction logic)
        if components.ram_gb > 0:
            ram_results = self.deduct_ram(
                total_ram_gb=components.ram_gb,
                quantity=quantity,
                order_ref=order_ref,
            )
            results.extend(ram_results)

        # 4. Deduct SSD
        if components.ssd_size:
            ssd_result = self.deduct_stock_by_sku(
                sku=components.ssd_size,
                quantity=quantity,
                order_ref=order_ref,
            )
            ssd_result.sku = f"SSD: {components.ssd_size}"
            results.append(ssd_result)

        # 5. Deduct Motherboard (if identified)
        if components.motherboard:
            mb_result = self.deduct_stock_by_sku(
                sku=components.motherboard,
                quantity=quantity,
                order_ref=order_ref,
            )
            mb_result.sku = f"Motherboard: {components.motherboard}"
            results.append(mb_result)

        return results

    def deduct_stock_by_sku(
        self,
        sku: str,
        quantity: int,
        order_ref: str = "",
    ) -> DeductionResult:
        """
        Deduct stock for a part by SKU using FIFO.

        Args:
            sku: Product SKU/IPN.
            quantity: Quantity to deduct.
            order_ref: Order reference for notes.

        Returns:
            DeductionResult indicating success/failure.
        """
        # Find part
        part = self.client.get_part_by_sku(sku)
        if not part:
            return DeductionResult(
                success=False,
                sku=sku,
                error=f"Part not found for SKU: {sku}",
            )

        part_id = part["pk"]
        part_name = part.get("name", sku)

        # Get stock items (FIFO ordered)
        stock_items = self.client.get_stock_for_part(part_id)
        if not stock_items:
            return DeductionResult(
                success=False,
                part_id=part_id,
                sku=sku,
                error=f"No stock available for {part_name}",
            )

        # Deduct using FIFO
        remaining = quantity
        batches_used = []

        for stock in stock_items:
            if remaining <= 0:
                break

            stock_id = stock["pk"]
            available = stock.get("quantity", 0)
            location = stock.get("location_detail", {}).get("name", "Unknown")

            if available <= 0:
                continue

            # Take what we need from this batch
            take_qty = min(remaining, available)

            # Use stock removal API (creates proper tracking/history)
            notes = f"Marketplace sale: {order_ref}" if order_ref else "Marketplace sale"
            success = self.client.remove_stock(stock_id, take_qty, notes)

            if success:
                batches_used.append({
                    "stock_id": stock_id,
                    "quantity_taken": take_qty,
                    "location": location,
                    "remaining": available - take_qty,
                })
                remaining -= take_qty
                logger.info(
                    f"Removed {take_qty} of {part_name} from {location} "
                    f"(remaining: {available - take_qty})"
                )
            else:
                logger.error(f"Failed to remove stock {stock_id}")

        # Check if we got everything we needed
        if remaining > 0:
            logger.warning(
                f"Insufficient stock for {part_name}: needed {quantity}, "
                f"only deducted {quantity - remaining}"
            )
            return DeductionResult(
                success=False,
                part_id=part_id,
                sku=sku,
                quantity_deducted=quantity - remaining,
                batches_used=batches_used,
                error=f"Insufficient stock: needed {quantity}, had {quantity - remaining}",
            )

        logger.info(
            f"Successfully deducted {quantity}x {part_name} for order {order_ref}"
        )
        return DeductionResult(
            success=True,
            part_id=part_id,
            sku=sku,
            quantity_deducted=quantity,
            batches_used=batches_used,
        )

    def deduct_ram(
        self,
        total_ram_gb: int,
        quantity: int = 1,
        order_ref: str = "",
    ) -> list[DeductionResult]:
        """
        Deduct RAM sticks based on total RAM size.

        RAM is stored as individual sticks:
        - 16GB total -> 2x 8GB sticks
        - 32GB total -> 2x 16GB sticks

        Args:
            total_ram_gb: Total RAM in GB from order (e.g., 16, 32).
            quantity: Number of PCs (multiplies RAM sticks needed).
            order_ref: Order reference for notes.

        Returns:
            List of DeductionResults for RAM deductions.
        """
        results = []

        # Determine stick configuration
        config = self.RAM_CONFIG.get(total_ram_gb)

        if not config:
            logger.warning(f"Unknown RAM configuration: {total_ram_gb}GB")
            # Try to figure it out - assume dual channel with largest sticks
            if total_ram_gb >= 64:
                config = (16, total_ram_gb // 16)
            elif total_ram_gb >= 16:
                config = (8, total_ram_gb // 8)
            else:
                config = (8, 1)

        stick_size_gb, num_sticks = config
        total_sticks_needed = num_sticks * quantity

        # Determine which SKU to use
        if stick_size_gb == 8:
            ram_sku = self.ram_8gb_sku
        elif stick_size_gb == 16:
            ram_sku = self.ram_16gb_sku
        else:
            # For other sizes, construct SKU
            ram_sku = f"RAM-{stick_size_gb}GB-DDR4"

        logger.info(
            f"RAM deduction: {total_ram_gb}GB total -> "
            f"{total_sticks_needed}x {stick_size_gb}GB sticks (SKU: {ram_sku})"
        )

        # Deduct the RAM sticks
        result = self.deduct_stock_by_sku(
            sku=ram_sku,
            quantity=total_sticks_needed,
            order_ref=order_ref,
        )

        # Update result with RAM-specific info
        result.sku = f"{ram_sku} ({total_ram_gb}GB total -> {total_sticks_needed}x {stick_size_gb}GB)"
        results.append(result)

        return results

    def get_stock_level(self, sku: str) -> int:
        """
        Get current stock level for a SKU.

        Args:
            sku: Product SKU/IPN.

        Returns:
            Total quantity in stock.
        """
        part = self.client.get_part_by_sku(sku)
        if not part:
            return 0

        stock_items = self.client.get_stock_for_part(part["pk"])
        return sum(s.get("quantity", 0) for s in stock_items)

    def check_stock_availability(
        self, order: OrderData
    ) -> tuple[bool, list[str]]:
        """
        Check if sufficient stock is available for an order.
        Uses component-based checking.

        Args:
            order: Order data to check.

        Returns:
            Tuple of (is_available, list of issues).
        """
        issues = []

        # Extract components
        components = self.component_extractor.extract(
            sku=order.sku,
            description=order.product_description,
        )

        # Check CPU
        if components.cpu:
            cpu_stock = self.get_stock_level(components.cpu)
            if cpu_stock < order.quantity:
                issues.append(
                    f"Insufficient CPU stock for {components.cpu}: "
                    f"need {order.quantity}, have {cpu_stock}"
                )

        # Check GPU
        if components.gpu:
            gpu_stock = self.get_stock_level(components.gpu)
            if gpu_stock < order.quantity:
                issues.append(
                    f"Insufficient GPU stock for {components.gpu}: "
                    f"need {order.quantity}, have {gpu_stock}"
                )

        # Check SSD
        if components.ssd_size:
            ssd_stock = self.get_stock_level(components.ssd_size)
            if ssd_stock < order.quantity:
                issues.append(
                    f"Insufficient SSD stock for {components.ssd_size}: "
                    f"need {order.quantity}, have {ssd_stock}"
                )

        # Check RAM
        ram_gb = components.ram_gb or order.ram_size_gb
        if ram_gb > 0:
            config = self.RAM_CONFIG.get(ram_gb, (8, ram_gb // 8))
            stick_size_gb, num_sticks = config
            total_sticks = num_sticks * order.quantity

            if stick_size_gb == 8:
                ram_sku = self.ram_8gb_sku
            else:
                ram_sku = self.ram_16gb_sku

            ram_stock = self.get_stock_level(ram_sku)
            if ram_stock < total_sticks:
                issues.append(
                    f"Insufficient RAM stock for {ram_sku}: "
                    f"need {total_sticks}, have {ram_stock}"
                )

        return len(issues) == 0, issues
