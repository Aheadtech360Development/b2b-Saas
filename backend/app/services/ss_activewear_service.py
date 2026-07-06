"""S&S Activewear API v2 client with rate limiting.

S&S API base: https://api.ssactivewear.com/v2/
Auth: HTTP Basic (account_number : api_key)
Free dev tier: 10 calls/day — production tier required for live usage.

All public methods catch exceptions and return empty lists/None so callers
don't need to handle network errors individually.
"""
import asyncio
import logging
import time
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_SS_BASE = "https://api.ssactivewear.com/v2"
_MIN_INTERVAL = 1.5  # seconds between requests (~40 req/min)


class SSActivewearService:
    """Async REST client for S&S Activewear API v2."""

    def __init__(self) -> None:
        self._last_call: float = 0.0
        self._client: httpx.AsyncClient | None = None

    def _client_instance(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=_SS_BASE,
                auth=(settings.SS_ACCOUNT_NUMBER, settings.SS_API_KEY),
                timeout=30.0,
                headers={"Accept": "application/json"},
                follow_redirects=True,
            )
        return self._client

    async def _throttle(self) -> None:
        """Enforce minimum inter-request delay."""
        elapsed = time.monotonic() - self._last_call
        if elapsed < _MIN_INTERVAL:
            await asyncio.sleep(_MIN_INTERVAL - elapsed)
        self._last_call = time.monotonic()

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        await self._throttle()
        client = self._client_instance()
        response = await client.get(path, params=params or {})
        response.raise_for_status()
        return response.json()

    # ── Public API ────────────────────────────────────────────────────────────

    async def fetch_categories(self) -> list[dict]:
        """Fetch all product categories."""
        try:
            data = await self._get("/categories/")
            return data if isinstance(data, list) else []
        except Exception as exc:
            logger.error("SS categories fetch error: %s", exc)
            return []

    async def fetch_products_page(self, page: int = 1, page_size: int = 100) -> list[dict]:
        """Fetch a page of products from the full catalog."""
        try:
            data = await self._get("/products/", {
                "mediaType": "json",
                "page": page,
                "pageSize": page_size,
            })
            return data if isinstance(data, list) else []
        except Exception as exc:
            logger.error("SS products page %d fetch error: %s", page, exc)
            return []

    async def fetch_products_by_category(self, category: str) -> list[dict]:
        """Fetch all products within a given category name."""
        try:
            data = await self._get("/products/", {
                "mediaType": "json",
                "category": category,
            })
            return data if isinstance(data, list) else []
        except Exception as exc:
            logger.error("SS products fetch error (category=%s): %s", category, exc)
            return []

    async def fetch_product_detail(self, style_id: str) -> dict | None:
        """Fetch full product detail including all colors and sizes."""
        try:
            data = await self._get(f"/products/{style_id}/", {"mediaType": "json"})
            if isinstance(data, list) and data:
                return data[0]
            if isinstance(data, dict):
                return data
            return None
        except Exception as exc:
            logger.error("SS product detail fetch error (style=%s): %s", style_id, exc)
            return None

    async def fetch_inventory(
        self,
        style_id: str | None = None,
        sku: str | None = None,
    ) -> list[dict]:
        """Fetch inventory records, optionally filtered by style or SKU."""
        params: dict[str, Any] = {}
        if style_id:
            params["style"] = style_id
        if sku:
            params["sku"] = sku
        try:
            data = await self._get("/inventory/", params)
            return data if isinstance(data, list) else []
        except Exception as exc:
            logger.error("SS inventory fetch error (style=%s): %s", style_id, exc)
            return []

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def extract_style_id(raw: dict) -> str:
        """Normalise styleID across different response shapes."""
        return str(
            raw.get("styleID")
            or raw.get("style_id")
            or raw.get("styleId")
            or raw.get("id")
            or ""
        )

    @staticmethod
    def extract_front_image(raw: dict) -> str | None:
        return (
            raw.get("colorFrontImage")
            or raw.get("frontModel")
            or raw.get("imageFrontUri")
            or None
        )

    @staticmethod
    def extract_piece_price(raw: dict) -> float | None:
        v = raw.get("piecePrice") or raw.get("partPrice") or raw.get("price")
        if v is None:
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None
