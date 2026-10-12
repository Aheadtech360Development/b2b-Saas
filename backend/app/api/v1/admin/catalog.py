"""Admin API — the product list (services/product_catalog).

One answer for the list, its counts by status, the kinds and what needs a look,
so a tab's count can never disagree with the rows under it. The products
themselves are still read and changed through /admin/products.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services import product_catalog as pc

router = APIRouter(prefix="/admin/catalog", tags=["admin", "products"])


@router.get("/products")
async def catalog_products(
    q: str | None = None,
    status: str | None = None,
    kind: str | None = None,
    attention: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> dict:
    rows = await pc.load_catalog(db, q=q, kind=kind)
    return pc.page(rows, status=status, attention_only=attention, page_no=page, page_size=page_size)
