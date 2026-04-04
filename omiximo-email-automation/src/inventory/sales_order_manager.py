"""
Sales Order Manager for creating InvenTree sales orders.
Creates proper sales records for profitability tracking.
"""

import logging
from typing import Optional
from dataclasses import dataclass

from src.config import Config
from src.marketplace_parsers.base import OrderData
from src.vat_rates import calculate_net_price
from .inventree_client import InvenTreeClient

logger = logging.getLogger(__name__)


@dataclass
class SalesOrderResult:
    """Result of sales order creation."""
    success: bool
    order_id: int = 0
    order_reference: str = ""
    error: str = ""


class SalesOrderManager:
    """
    Creates Sales Orders in InvenTree for marketplace orders.
    """

    # Default marketplace customer (created if needed)
    MARKETPLACE_CUSTOMERS = {
        "MediaMarktSaturn": "MediaMarktSaturn Marketplace",
        "BolCom": "Bol.com Marketplace",
        "Boulanger": "Boulanger Marketplace",
    }

    def __init__(self, client: Optional[InvenTreeClient] = None):
        self.client = client or InvenTreeClient()
        self._customer_cache = {}

    def create_sales_order(
        self,
        order: OrderData,
        components_sold: list[dict],
    ) -> SalesOrderResult:
        """
        Create a complete sales order for a marketplace order.

        Args:
            order: Parsed order data.
            components_sold: List of components with their prices.
                Each dict should have: sku, quantity, unit_price

        Returns:
            SalesOrderResult with order details.
        """
        try:
            # 1. Get or create customer
            customer_id = self._get_or_create_customer(
                marketplace=order.marketplace,
                customer_name=order.customer_name,
            )
            if not customer_id:
                return SalesOrderResult(
                    success=False,
                    error="Failed to get/create customer"
                )

            # 2. Calculate VAT for profit tracking
            country = order.shipping_address.country or "NL"
            net_price, vat_amount, vat_rate = calculate_net_price(order.price, country)
            
            # 3. Create the Sales Order with VAT info in description
            so_data = self.client._request(
                "POST",
                "/order/so/",
                json_data={
                    "customer": customer_id,
                    "customer_reference": f"OMX-{order.order_number}",  # OMX prefix for our orders
                    "description": f"{order.marketplace}: {order.product_description[:80]} | Gross: €{order.price:.2f} | VAT {vat_rate*100:.0f}%: €{vat_amount:.2f} | Net: €{net_price:.2f} | {country}",
                }
            )

            if not so_data or "pk" not in so_data:
                return SalesOrderResult(
                    success=False,
                    error="Failed to create sales order"
                )

            order_id = so_data["pk"]
            order_ref = so_data.get("reference", f"SO-{order_id}")
            logger.info(f"Created Sales Order {order_ref} for {order.order_number}")

            # 4. Add line items for each component
            # First component gets the sale price (divided by its qty for unit price)
            sale_price_remaining = order.price
            
            for i, component in enumerate(components_sold):
                qty = component["quantity"]
                unit_price = 0
                
                # First component carries the sale price
                if i == 0 and sale_price_remaining > 0:
                    unit_price = sale_price_remaining / qty
                    sale_price_remaining = 0
                
                self._add_line_item(
                    order_id=order_id,
                    sku=component["sku"],
                    quantity=qty,
                    unit_price=unit_price,
                    notes=component.get("notes", ""),
                )

            # 5. Issue the order (pending -> in progress)
            self.client._request("POST", f"/order/so/{order_id}/issue/", json_data={})

            # 6. Complete/ship the order (accept incomplete since stock is handled separately)
            self.client._request(
                "POST",
                f"/order/so/{order_id}/complete/",
                json_data={"accept_incomplete": True}
            )

            logger.info(f"Sales Order {order_ref} completed for {order.order_number}")

            return SalesOrderResult(
                success=True,
                order_id=order_id,
                order_reference=order_ref,
            )

        except Exception as e:
            logger.error(f"Error creating sales order: {e}")
            return SalesOrderResult(success=False, error=str(e))

    def _get_or_create_customer(
        self,
        marketplace: str,
        customer_name: str = None,
    ) -> Optional[int]:
        """
        Get or create a customer for the marketplace.

        Uses marketplace name as customer by default.
        """
        # Use marketplace as customer name
        company_name = self.MARKETPLACE_CUSTOMERS.get(marketplace, marketplace)

        # Check cache first
        if company_name in self._customer_cache:
            return self._customer_cache[company_name]

        # Search for existing customer
        data = self.client._request(
            "GET",
            "/company/",
            params={"name": company_name, "is_customer": "true"}
        )

        results = data.get("results", data) if isinstance(data, dict) else data
        if isinstance(results, list):
            for company in results:
                if company.get("name") == company_name:
                    self._customer_cache[company_name] = company["pk"]
                    return company["pk"]

        # Create new customer
        new_customer = self.client._request(
            "POST",
            "/company/",
            json_data={
                "name": company_name,
                "is_customer": True,
                "description": f"Marketplace customer: {marketplace}",
            }
        )

        if new_customer and "pk" in new_customer:
            self._customer_cache[company_name] = new_customer["pk"]
            logger.info(f"Created new customer: {company_name}")
            return new_customer["pk"]

        return None

    def _get_fifo_cost(self, part_id: int, quantity: int) -> float:
        """
        Get the FIFO cost for a quantity of a part.
        Returns the weighted average cost based on oldest stock items.
        """
        # Get stock items for this part, ordered by oldest first (FIFO)
        stock_data = self.client._request(
            "GET",
            "/stock/",
            params={
                "part": part_id,
                "in_stock": "true",
                "ordering": "pk",  # Oldest first
            }
        )
        
        if not stock_data:
            return 0.0
        
        items = stock_data if isinstance(stock_data, list) else stock_data.get("results", [])
        
        total_cost = 0.0
        remaining_qty = quantity
        
        for item in items:
            if remaining_qty <= 0:
                break
            
            available = float(item.get("quantity", 0))
            price = float(item.get("purchase_price") or 0)
            
            if available <= 0:
                continue
            
            take_qty = min(available, remaining_qty)
            total_cost += take_qty * price
            remaining_qty -= take_qty
        
        return total_cost

    def _add_line_item(
        self,
        order_id: int,
        sku: str,
        quantity: int,
        unit_price: float = 0,
        notes: str = "",
    ) -> bool:
        """
        Add a line item to a sales order.
        Captures the actual FIFO cost in the notes for profitability tracking.
        """
        # Find the part by SKU
        part = self.client.get_part_by_sku(sku)
        if not part:
            logger.warning(f"Part not found for SKU: {sku}, skipping line item")
            return False

        part_id = part["pk"]

        # Ensure part is salable
        if not part.get("salable"):
            self.client._request(
                "PATCH",
                f"/part/{part_id}/",
                json_data={"salable": True}
            )

        # Get actual FIFO cost for this component
        fifo_cost = self._get_fifo_cost(part_id, quantity)
        
        # Store FIFO cost in notes for profitability tracking
        # Format: "original_notes | FIFO_COST:123.45"
        cost_tag = f"FIFO_COST:{fifo_cost:.2f}"
        full_notes = f"{notes} | {cost_tag}" if notes else cost_tag

        # Add line item
        result = self.client._request(
            "POST",
            "/order/so-line/",
            json_data={
                "order": order_id,
                "part": part_id,
                "quantity": quantity,
                "sale_price": unit_price,
                "notes": full_notes,
            }
        )

        if result and "pk" in result:
            logger.info(f"Added line item: {quantity}x {sku} | FIFO cost: €{fifo_cost:.2f}")
            return True

        return False
