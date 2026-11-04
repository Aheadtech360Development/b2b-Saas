"""Which supplier answers: S&S through its API, SanMar through its files.

Both hand back the same shapes (trimmed styles, S&S-style SKU rows), so
everything past this point is one pipeline (ss_products, jobs, the supplier
screens). These are the only places that ask which supplier it is.
"""
from __future__ import annotations

from typing import Any

from app.services.suppliers import config as cfgmod
from app.services.suppliers import ss_catalog

SANMAR = "sanmar"
SS = "ss_activewear"


def label(supplier: str) -> str:
    return cfgmod.CATALOG.get(supplier, {}).get("label", supplier)


def client(supplier: str, conn: dict, tenant_id: Any = None):
    """The brand's own client for this supplier — never a platform fallback."""
    if supplier == SANMAR:
        from app.services.sanmar_service import from_connection as sanmar_client

        return sanmar_client(conn, tenant_id=tenant_id)
    from app.services.ss_activewear_service import from_connection

    return from_connection(conn)


async def all_styles(supplier: str, svc) -> list[dict]:
    if supplier == SANMAR:
        return await svc.all_styles()
    return await ss_catalog.all_styles(svc)


async def style_stats(supplier: str, svc, styles: list[dict]) -> dict[str, dict]:
    if supplier == SANMAR:
        return await svc.style_stats(styles)
    return await ss_catalog.style_stats(svc, styles)


async def prefetch(svc, parts: list[str], *, stock_only: bool = False) -> None:
    """Read every style a job will work through at once, where reading is one
    pass over a whole file (SanMar). S&S answers per batch and needs nothing."""
    if stock_only and hasattr(svc, "prefetch_inventory"):
        await svc.prefetch_inventory(parts)
    elif not stock_only and hasattr(svc, "prefetch"):
        await svc.prefetch(parts)


def sends_orders(supplier: str) -> bool:
    """Store orders go to S&S as purchase orders. SanMar's order connection is
    not built yet (it needs SanMar's own test run first)."""
    return supplier == SS
