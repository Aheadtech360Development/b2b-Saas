"""S&S Activewear API v2 client with rate limiting.

S&S API base: https://api.ssactivewear.com/v2/
Auth: HTTP Basic (account_number : api_key). No IP allowlisting is required for
standard REST access — access is keyed to the account, not the source IP.

Rate limit: public references cite ~60 requests/minute on the production tier;
the exact per-minute / per-day caps are account-specific — confirm yours with
S&S. (An earlier note here claimed "10 calls/day" for a dev tier; that figure
was never verified against S&S docs, so don't treat it as authoritative.)
_MIN_INTERVAL below (~40 req/min) stays deliberately under the 60/min ceiling.
Production access + "API customer pricing" are enabled by S&S on your account
(request via api@ssactivewear.com), not through a self-service toggle.

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

# S&S returns image paths relative to their CDN host (medium '_fm' by default).
# e.g. "Images/Color/17130_f_fm.jpg" → prefix + optional size swap.
# NOTE: the docs say www.ssactivewear.com, but that 301-redirects for images;
# the images actually live on cdn.ssactivewear.com (verified: www → 301, cdn → 200).
SS_IMAGE_BASE = "https://cdn.ssactivewear.com/"
_IMG_SIZE = {"large": "_fl", "medium": "_fm", "small": "_fs"}


def ss_image_url(path: str | None, size: str = "large") -> str | None:
    """Absolute S&S image URL at the requested size, or None for an empty path."""
    if not path:
        return None
    p = path.replace("_fm", _IMG_SIZE.get(size, "_fl"))
    return f"{SS_IMAGE_BASE}{p.lstrip('/')}"


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

    async def fetch_style(self, style_id: str) -> dict | None:
        """Style-level info (title, description, brand, baseCategory, images).

        Uses the Styles API — the SKU/Products payload does NOT carry title,
        description or category, so they must come from here.
        """
        try:
            data = await self._get("/styles/", {"styleid": style_id})
            if isinstance(data, list) and data:
                return data[0]
            if isinstance(data, dict):
                return data
            return None
        except Exception as exc:
            logger.error("SS style fetch error (style=%s): %s", style_id, exc)
            return None

    async def fetch_products_by_style(self, style_id: str) -> list[dict]:
        """Every SKU (colour+size variant) for a style — the real import source.

        S&S returns a FLAT list: one object per colour+size, each carrying
        colorName/sizeName/customerPrice/qty/warehouses/images. This is what the
        importer groups by colour to build variants (there is no nested
        colours→sizes structure in the API).
        """
        try:
            data = await self._get("/products/", {"styleid": style_id})
            return data if isinstance(data, list) else []
        except Exception as exc:
            logger.error("SS products-by-style fetch error (style=%s): %s", style_id, exc)
            return []

    async def search_styles(self, query: str) -> list[dict]:
        """Live style search (brand / style name / number) for the import picker."""
        try:
            data = await self._get("/styles/", {"search": query})
            return data if isinstance(data, list) else []
        except Exception as exc:
            logger.error("SS style search error (q=%s): %s", query, exc)
            return []

    async def fetch_inventory_by_style(self, style_id: str) -> list[dict]:
        """Light inventory payload for every SKU in a style (bulk, one call)."""
        try:
            data = await self._get("/inventory/", {"styleid": style_id})
            return data if isinstance(data, list) else []
        except Exception as exc:
            logger.error("SS inventory-by-style error (style=%s): %s", style_id, exc)
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
