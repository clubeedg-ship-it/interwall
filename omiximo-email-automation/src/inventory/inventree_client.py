"""
InvenTree API Client for inventory operations.
"""

import logging
from typing import Optional
import requests

from src.config import Config

logger = logging.getLogger(__name__)


class InvenTreeClient:
    """Client for InvenTree REST API."""

    def __init__(self):
        self.base_url = Config.INVENTREE_API_URL.rstrip("/")
        self.token: Optional[str] = Config.INVENTREE_API_TOKEN or None
        self.session = requests.Session()
        self.session.headers.update({
            "Accept": "application/json",
            "Content-Type": "application/json",
        })

    def authenticate(self) -> bool:
        """
        Authenticate with InvenTree API and get token.

        Returns:
            True if authentication successful.
        """
        if self.token:
            self.session.headers["Authorization"] = f"Token {self.token}"
            logger.info("Using configured API token")
            return True

        try:
            response = self.session.get(
                f"{self.base_url}/user/token/",
                auth=(Config.INVENTREE_USERNAME, Config.INVENTREE_PASSWORD),
            )
            response.raise_for_status()

            data = response.json()
            self.token = data.get("token")

            if self.token:
                self.session.headers["Authorization"] = f"Token {self.token}"
                logger.info("Authentication successful")
                return True

            logger.error("No token in response")
            return False

        except requests.RequestException as e:
            logger.error(f"Authentication failed: {e}")
            return False

    def _request(
        self,
        method: str,
        endpoint: str,
        params: Optional[dict] = None,
        json_data: Optional[dict] = None,
    ) -> Optional[dict]:
        """
        Make an API request.

        Args:
            method: HTTP method (GET, POST, PATCH, DELETE).
            endpoint: API endpoint (without base URL).
            params: Query parameters.
            json_data: JSON body data.

        Returns:
            Response JSON or None if request fails.
        """
        url = f"{self.base_url}{endpoint}"

        try:
            response = self.session.request(
                method=method,
                url=url,
                params=params,
                json=json_data,
            )
            response.raise_for_status()

            if response.status_code == 204:
                return {}

            return response.json()

        except requests.RequestException as e:
            logger.error(f"API request failed: {method} {endpoint} - {e}")
            return None

    def get_part_by_sku(self, sku: str) -> Optional[dict]:
        """
        Find a part by its name or IPN.
        
        Searches by name first (exact match), then falls back to search.

        Args:
            sku: The part name or IPN to search for.

        Returns:
            Part data or None if not found.
        """
        # First try exact name match
        data = self._request("GET", "/part/", params={"name": sku, "limit": 10})
        
        if data:
            # Handle both array and {results: []} response formats
            results = data.get("results", data) if isinstance(data, dict) else data
            if isinstance(results, list) and results:
                for part in results:
                    if part.get("name") == sku:
                        logger.debug(f"Found part by name: {sku} -> ID {part.get('pk')}")
                        return part

        # Fallback to search
        data = self._request("GET", "/part/", params={"search": sku, "limit": 10})

        if not data:
            return None

        results = data.get("results", data) if isinstance(data, dict) else data
        if not isinstance(results, list):
            results = []

        # Find exact name match first
        for part in results:
            if part.get("name") == sku:
                logger.debug(f"Found part by search (exact name): {sku} -> ID {part.get('pk')}")
                return part

        # Then try IPN match
        for part in results:
            if part.get("IPN") == sku:
                logger.debug(f"Found part by IPN: {sku} -> ID {part.get('pk')}")
                return part

        # Fallback to first result
        if results:
            logger.warning(f"Using first search result for '{sku}': {results[0].get('name')}")
            return results[0]

        logger.warning(f"Part not found: {sku}")
        return None

    def get_stock_for_part(self, part_id: int) -> list:
        """
        Get all stock items for a part, sorted by FIFO (oldest first).

        Args:
            part_id: The part ID.

        Returns:
            List of stock items sorted by date (oldest first).
        """
        data = self._request(
            "GET",
            "/stock/",
            params={
                "part": part_id,
                "in_stock": "true",
                "ordering": "updated",  # Oldest first for FIFO
                "limit": 100,
            },
        )

        if not data:
            return []

        # Handle both array and {results: []} response formats
        if isinstance(data, list):
            return data
        return data.get("results", [])

    def get_stock_item(self, stock_id: int) -> Optional[dict]:
        """
        Get a single stock item by ID.

        Args:
            stock_id: The stock item ID.

        Returns:
            Stock item data or None.
        """
        return self._request("GET", f"/stock/{stock_id}/")

    def update_stock_quantity(self, stock_id: int, new_quantity: int) -> bool:
        """
        Update the quantity of a stock item.

        Args:
            stock_id: The stock item ID.
            new_quantity: New quantity value.

        Returns:
            True if update successful.
        """
        result = self._request(
            "PATCH",
            f"/stock/{stock_id}/",
            json_data={"quantity": new_quantity},
        )
        return result is not None

    def remove_stock(
        self, stock_id: int, quantity: int, notes: str = ""
    ) -> bool:
        """
        Remove stock using the stock removal endpoint.

        Args:
            stock_id: The stock item ID.
            quantity: Quantity to remove.
            notes: Optional notes for the removal.

        Returns:
            True if removal successful.
        """
        result = self._request(
            "POST",
            "/stock/remove/",
            json_data={
                "items": [{"pk": stock_id, "quantity": quantity}],
                "notes": notes or "Marketplace sale",
            },
        )
        return result is not None

    def create_stock(
        self,
        part_id: int,
        location_id: int,
        quantity: int,
        purchase_price: float = 0.0,
        notes: str = "",
    ) -> Optional[dict]:
        """
        Create a new stock item.

        Args:
            part_id: Part ID.
            location_id: Location ID.
            quantity: Quantity.
            purchase_price: Unit cost.
            notes: Additional notes.

        Returns:
            Created stock item data or None.
        """
        return self._request(
            "POST",
            "/stock/",
            json_data={
                "part": part_id,
                "location": location_id,
                "quantity": quantity,
                "purchase_price": purchase_price,
                "notes": notes,
            },
        )

    def test_connection(self) -> bool:
        """
        Test API connection.

        Returns:
            True if connection works.
        """
        try:
            result = self._request("GET", "/", params={"limit": 1})
            return result is not None
        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return False
