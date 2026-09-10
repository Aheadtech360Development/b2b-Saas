"""ZipTax integration for real-time sales tax calculation."""
import logging
import os
import httpx

logger = logging.getLogger(__name__)

ZIPTAX_BASE_URL = "https://api.zip-tax.com/request/v60"


def get_ziptax_client() -> str | None:
    """Return the ZipTax API key if configured, else None."""
    return os.getenv("ZIPTAX_API_KEY") or None


async def calculate_tax(
    to_state: str,
    to_zip: str,
    to_city: str,
    subtotal: float,
    shipping: float,
) -> dict:
    """Return { rate (%), tax_amount ($), region, source } from ZipTax.

    rate is expressed as a percentage (e.g. 8.25 for 8.25%).
    Falls back to { rate: 0, tax_amount: 0, source: "fallback" } on any error.
    """
    api_key = get_ziptax_client()
    if not api_key:
        logger.warning("ZIPTAX_API_KEY is not set — skipping ZipTax, returning 0 tax")
        return {"rate": 0.0, "tax_amount": 0.0, "region": to_state.upper(), "source": "manual"}

    clean_zip = str(to_zip).strip().zfill(5) if to_zip else ""
    logger.info("ZipTax request: state=%s zip=%r clean_zip=%r subtotal=%.2f api_key_prefix=%s",
                to_state, to_zip, clean_zip, subtotal, api_key[:8])

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                ZIPTAX_BASE_URL,
                params={"postalcode": clean_zip},
                headers={"X-API-KEY": api_key},
            )
            logger.info("ZipTax HTTP status: %s", response.status_code)
            response.raise_for_status()
            data = response.json()
            logger.info("ZipTax raw response: %s", data)

        results = data.get("results", [])
        if not results:
            logger.warning("ZipTax returned empty results for zip=%s state=%s — data=%s", to_zip, to_state, data)
            return {"rate": 0.0, "tax_amount": 0.0, "region": to_state.upper(), "source": "fallback"}

        result = results[0]
        tax_rate_decimal = float(result.get("taxSales", 0.0))
        rate = round(tax_rate_decimal * 100, 4)
        tax_amount = round(subtotal * tax_rate_decimal, 2)

        logger.info("ZipTax result: taxSales=%s rate=%.4f%% tax_amount=$%.2f", tax_rate_decimal, rate, tax_amount)

        return {
            "rate": rate,
            "tax_amount": tax_amount,
            "region": to_state.upper(),
            "source": "ziptax",
        }
    except Exception as exc:
        logger.warning("ZipTax calculation failed for %s %s: %s", to_state, to_zip, exc)
        return {"rate": 0.0, "tax_amount": 0.0, "region": to_state.upper(), "source": "fallback", "error": str(exc)}


async def resolve_tax(db, to_state: str, to_zip: str, to_city: str, taxable_subtotal: float) -> dict:
    """Brand-aware tax resolution — the single source of truth for tax.

    Honours THIS brand's `tax_mode` (a per-tenant setting), so every brand keeps
    control without needing its own tax provider:
      • auto   (default) → ZipTax lookup, then the brand's own rate table.
      • manual           → the brand's own rate table only (no ZipTax call).
      • none             → charge no tax at all.

    Both the checkout quote and the amount actually charged call this, so what the
    buyer is shown and what they pay can never drift apart.
    """
    state = (to_state or "").upper()
    zero = {"rate": 0.0, "tax_amount": 0.0, "region": state}

    mode = "auto"
    try:
        from app.core.tenant_settings import get_setting
        raw = await get_setting(db, "tax_mode")
        if raw and raw.strip().lower() in ("auto", "manual", "none"):
            mode = raw.strip().lower()
    except Exception as exc:  # never block checkout on a settings read
        logger.warning("tax_mode lookup failed, defaulting to auto: %s", exc)

    if mode == "none":
        return {**zero, "source": "disabled"}

    if mode == "auto" and to_zip and taxable_subtotal > 0 and get_ziptax_client() is not None:
        result = await calculate_tax(
            to_state=state, to_zip=to_zip, to_city=to_city or "",
            subtotal=taxable_subtotal, shipping=0,
        )
        if result.get("source") == "ziptax":
            return result

    # manual mode, or auto falling back: the brand's own regional rate table.
    try:
        from sqlalchemy import select as _select
        from app.api.v1.admin.taxes import TaxRate
        row = (await db.execute(
            _select(TaxRate).where(
                TaxRate.region == state,
                TaxRate.is_enabled == True,  # noqa: E712
            )
        )).scalar_one_or_none()
        if row:
            rate = float(row.rate)
            return {
                "rate": rate,
                "tax_amount": round(max(0.0, taxable_subtotal) * rate / 100, 2),
                "region": row.region,
                "source": "manual",
            }
    except Exception as exc:
        logger.warning("manual tax-rate lookup failed for %s: %s", state, exc)

    return {**zero, "source": "none"}
