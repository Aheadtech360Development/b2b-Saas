"""POST /api/v1/tax/calculate — ZipTax-backed tax calculation."""
import logging
import os
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth_middleware import require_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tax")


class TaxCalculateRequest(BaseModel):
    subtotal: float
    zip_code: str
    state: str
    discount: float = 0.0


@router.post("/calculate")
async def calculate_tax(
    body: TaxCalculateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    state = body.state.upper()
    taxable_subtotal = max(0.0, body.subtotal - body.discount)

    logger.info(
        "Tax calculate: raw_state=%r state=%s zip=%r subtotal=%.2f discount=%.2f taxable=%.2f",
        body.state, state, body.zip_code, body.subtotal, body.discount, taxable_subtotal,
    )
    logger.info(
        "Tax endpoint received: zip_code=%r type=%s state=%r",
        body.zip_code, type(body.zip_code).__name__, body.state,
    )

    # Strip and clean zip before calling ZipTax (rCode 108 = invalid format)
    clean_zip = str(body.zip_code).strip().zfill(5) if body.zip_code else ""
    logger.info("Clean zip: %r length=%d", clean_zip, len(clean_zip))

    # Tax-exempt companies pay no tax
    company_id = getattr(request.state, "company_id", None)
    if company_id:
        from app.models.company import Company
        company = (await db.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
        if company and company.tax_exempt:
            logger.info("Tax: company %s is tax-exempt → returning 0", company_id)
            return {"tax_rate": 0.0, "tax_amount": 0.0, "region": state, "taxable": False, "source": "exempt"}

    # The brand's own tax setting (auto ZipTax / its manual rates / no tax) —
    # the same resolver the charge uses. This endpoint used to call ZipTax
    # directly, so a brand set to "no tax" or to its own rates showed buyers
    # one tax at checkout and charged another.
    if taxable_subtotal <= 0:
        return {"tax_rate": 0.0, "tax_amount": 0.0, "region": state, "taxable": False, "source": "none"}
    from app.services.tax_service import resolve_tax

    try:
        result = await resolve_tax(db, state, clean_zip, "", taxable_subtotal)
    except Exception as exc:  # tax must never break checkout
        logger.warning("Tax: resolve failed for %s %s (%s) — returning 0", state, clean_zip, exc)
        return {"tax_rate": 0.0, "tax_amount": 0.0, "region": state, "taxable": False, "source": "none"}
    amount = float(result.get("tax_amount", 0) or 0)
    return {
        "tax_rate": float(result.get("rate", 0) or 0),
        "tax_amount": amount,
        "region": result.get("region") or state,
        "taxable": amount > 0,
        "source": result.get("source", "none"),
    }


@router.get("/diagnose")
async def diagnose_tax(
    request: Request,
    zip_code: str = "10001",
    state: str = "NY",
    subtotal: float = 100.0,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Why this shop is or is not charging tax, in one answer.

    "No tax is coming through" has five different causes that all look the
    same from the checkout — no key, a key the provider rejects, the shop set
    to its own rates, the shop set to none, or a postcode the provider does
    not know. This says which one it is.
    """
    from app.core.tenant_settings import get_setting
    from app.services.tax_service import get_ziptax_client, resolve_tax

    key = get_ziptax_client()
    mode = "auto"
    try:
        raw = await get_setting(db, "tax_mode")
        if raw and raw.strip().lower() in ("auto", "manual", "none"):
            mode = raw.strip().lower()
    except Exception:
        pass

    tenant_id = getattr(request.state, "tenant_id", None)
    own_rates = 0
    if tenant_id:
        try:
            own_rates = (await db.execute(text(
                "SELECT count(*) FROM tax_rates WHERE tenant_id = CAST(:t AS uuid)"
            ), {"t": str(tenant_id)})).scalar() or 0
        except Exception:
            own_rates = -1  # unreadable — say so rather than imply zero

    result = await resolve_tax(db, state.upper(), zip_code, "", subtotal)
    amount = float(result.get("tax_amount", 0) or 0)

    if mode == "none":
        verdict = "This shop is set to charge no tax. Settings → Taxes."
    elif amount > 0:
        verdict = (f"Working: {result.get('rate')}% on ${subtotal:.2f} is "
                   f"${amount:.2f}, from {result.get('source')}.")
    elif not key and mode == "auto":
        verdict = ("No ZIPTAX_API_KEY is set on the server, so automatic lookups "
                   "cannot run. Either set one, or switch this shop to its own "
                   "rates in Settings → Taxes.")
    elif result.get("error"):
        verdict = str(result["error"])
    elif mode == "manual" and own_rates == 0:
        verdict = ("This shop is set to use its own rates and has none saved yet, "
                   "so nothing is charged. Settings → Taxes.")
    else:
        verdict = (f"No rate was found for {state.upper()} {zip_code}, and this shop "
                   f"has {own_rates} rate(s) of its own to fall back on.")

    return {
        "verdict": verdict,
        "tax_mode": mode,
        "ziptax_key_present": bool(key),
        "own_rate_rows": own_rates,
        "tried": {"state": state.upper(), "zip": zip_code, "subtotal": subtotal},
        "result": result,
    }
