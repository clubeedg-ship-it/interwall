"""
Bol.com Retailer API v10 — OAuth2 HTTP client (T-B01).

BOL-CONTRACT.md §5: token endpoint, orders endpoint, field mapping.
D-097: API polling (not webhooks) for new orders.

Token lifecycle:
  - POST https://login.bol.com/token (client credentials, basic auth)
  - TTL: 299 seconds. Cache locally. Never request per-call (rate limits).
  - On 401 from protected endpoint: invalidate cache, refresh once, retry.
"""

import os
import time
import logging

import httpx

logger = logging.getLogger("poller.bol_client")

TOKEN_URL = "https://login.bol.com/token"
API_BASE = "https://api.bol.com"
ACCEPT = "application/vnd.retailer.v10+json"


class BolClient:
    """Bol.com Retailer API v10 client with OAuth2 token management."""

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        http_client: httpx.Client | None = None,
    ):
        self._client_id = client_id or os.environ.get("BOL_CLIENT_ID", "")
        self._client_secret = client_secret or os.environ.get("BOL_CLIENT_SECRET", "")
        self._http = http_client or httpx.Client(timeout=30.0)
        self._token: str | None = None
        self._token_expires_at: float = 0.0

    def get_token(self) -> str:
        """Return a cached token, or fetch a new one if expired."""
        if self._token and time.monotonic() < self._token_expires_at:
            return self._token
        return self._refresh_token()

    def _refresh_token(self) -> str:
        """POST to /token with basic auth (BOL-CONTRACT.md §5)."""
        resp = self._http.post(
            TOKEN_URL,
            auth=(self._client_id, self._client_secret),
            data={"grant_type": "client_credentials"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        data = resp.json()
        self._token = data["access_token"]
        # 30s safety margin against clock drift
        self._token_expires_at = time.monotonic() + data.get("expires_in", 299) - 30
        logger.info("Bol.com token refreshed, TTL %ds", data.get("expires_in", 299))
        return self._token

    def _auth_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.get_token()}",
            "Accept": ACCEPT,
        }

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        """Authenticated request with 401 -> refresh -> retry (once)."""
        url = f"{API_BASE}{path}"
        headers = self._auth_headers()
        resp = self._http.request(method, url, headers=headers, **kwargs)
        if resp.status_code == 401:
            logger.warning("401 from %s, refreshing token", path)
            self._token = None
            self._token_expires_at = 0.0
            headers = self._auth_headers()
            resp = self._http.request(method, url, headers=headers, **kwargs)
        resp.raise_for_status()
        return resp

    def get_orders(self, change_interval_minute: int = 15) -> list[dict]:
        """GET /retailer/orders?fulfilment-method=FBR (BOL-CONTRACT.md §5)."""
        resp = self._request(
            "GET",
            "/retailer/orders",
            params={
                "fulfilment-method": "FBR",
                "change-interval-minute": change_interval_minute,
            },
        )
        return resp.json().get("orders", [])

    def get_order_detail(self, order_id: str) -> dict:
        """GET /retailer/orders/{orderId} (BOL-CONTRACT.md §5)."""
        resp = self._request("GET", f"/retailer/orders/{order_id}")
        return resp.json()
