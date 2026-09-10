"""Public — calculate sales tax via ZipTax (fallback: manual tax_rates table)."""
import logging
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tax-rate")


@router.get("")
async def get_tax_rate(
    request: Request,
    region: str = Query(..., description="Two-letter US state code"),
    zip_code: str = Query("", description="Shipping ZIP code for zip-level accuracy"),
    city: str = Query("", description="Shipping city"),
    subtotal: float = Query(0.0, description="Cart subtotal for TaxJar calculation"),
    shipping: float = Query(0.0, description="Shipping cost for TaxJar calculation"),
    discount: float = Query(0.0, description="Coupon/discount amount already applied"),
    db: AsyncSession = Depends(get_db),
):
    state = region.upper()

    # ── Tax-exempt companies pay no tax ──────────────────────────────────────
    company_id = getattr(request.state, "company_id", None)
    if company_id:
        from app.models.company import Company
        company = (await db.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
        if company and company.tax_exempt:
            return {"rate": 0.0, "tax_amount": 0.0, "region": state, "source": "exempt"}

    # Taxable amount = merchandise only (subtotal − discount); shipping is not taxed
    taxable_subtotal = max(0.0, subtotal - discount)

    # ── Brand-aware resolution: honours this brand's tax mode (auto/manual/none),
    # falling back to its own rate table. Same helper the charge path uses, so the
    # quote and the charged amount always agree.
    from app.services.tax_service import resolve_tax
    result = await resolve_tax(db, state, zip_code, city, taxable_subtotal)
    logger.info(
        "Tax (%s): %s %s → rate=%.4f%% amount=$%.2f (discount=$%.2f applied)",
        result.get("source"), state, zip_code, result.get("rate", 0.0),
        result.get("tax_amount", 0.0), discount,
    )
    return result
