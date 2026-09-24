"""ZipTax integration for real-time sales tax calculation."""
import logging
import os
import httpx

from app.core.redis import redis_get, redis_set

logger = logging.getLogger(__name__)

ZIPTAX_BASE_URL = "https://api.zip-tax.com/request/v60"


# A sales-tax rate changes a handful of times a year, so a day's caching is
# generous on freshness and cuts repeat lookups of the same postcode to one.
RATE_CACHE_TTL = 24 * 3600


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

    # A postcode's rate is the same for everyone and changes a few times a year,
    # while the same postcode is looked up on every keystroke of a ZIP field, on
    # the review page, and again for the next customer in that town. The plan is
    # billed per call, so the rate is cached and only the amount is recomputed.
    cache_key = f"ziptax:rate:{clean_zip}"
    try:
        cached = await redis_get(cache_key)
    except Exception:
        cached = None
    if cached is not None:
        rate = float(cached)
        return {
            "rate": rate,
            "tax_amount": round(subtotal * rate / 100, 2),
            "region": to_state.upper(),
            "source": "ziptax",
        }

    logger.info("ZipTax request: state=%s zip=%r clean_zip=%r subtotal=%.2f api_key_prefix=%s",
                to_state, to_zip, clean_zip, subtotal, api_key[:8])

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                ZIPTAX_BASE_URL,
                # Both ways of presenting the key. v40 took it in the query and
                # v60 takes a header; the URL moved to v60 and the header went
                # with it, but the debug endpoint beside this one kept the
                # query form — and that was the one that worked. Sending both
                # costs nothing and stops a shop quietly charging no tax
                # because of which scheme a version expects.
                params={"key": api_key, "postalcode": clean_zip},
                headers={"X-API-KEY": api_key},
            )
            logger.info("ZipTax HTTP status: %s", response.status_code)
            response.raise_for_status()
            data = response.json()
            logger.info("ZipTax raw response: %s", data)

        # ZipTax answers 200 even when it refuses: rCode 100 is success, 101 is
        # a bad key, 108 a bad postcode. Reading only `results` turned every one
        # of those into "no tax", which is indistinguishable from a state that
        # charges none — and is how a shop can be undercharging for months.
        r_code = data.get("rCode")
        if r_code is not None and int(r_code) != 100:
            reason = {101: "ZipTax rejected the API key",
                      102: "ZipTax says the key is not authorised",
                      108: "ZipTax could not read that postcode"}.get(int(r_code),
                      f"ZipTax returned rCode {r_code}")
            logger.error("ZipTax refused: %s (zip=%s) — %s", reason, clean_zip, data)
            return {"rate": 0.0, "tax_amount": 0.0, "region": to_state.upper(),
                    "source": "fallback", "error": reason, "r_code": int(r_code)}

        results = data.get("results", [])
        if not results:
            logger.warning("ZipTax returned empty results for zip=%s state=%s — data=%s", to_zip, to_state, data)
            return {"rate": 0.0, "tax_amount": 0.0, "region": to_state.upper(),
                    "source": "fallback",
                    "error": f"ZipTax knows no rate for postcode {clean_zip}"}

        result = results[0]
        tax_rate_decimal = float(result.get("taxSales", 0.0))
        rate = round(tax_rate_decimal * 100, 4)
        tax_amount = round(subtotal * tax_rate_decimal, 2)

        logger.info("ZipTax result: taxSales=%s rate=%.4f%% tax_amount=$%.2f", tax_rate_decimal, rate, tax_amount)
        try:
            await redis_set(cache_key, str(rate), expire=RATE_CACHE_TTL)
        except Exception:
            pass                      # Redis down only costs an extra lookup.

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
    # Inside a savepoint: this runs in the middle of checkout's transaction,
    # and a failed statement poisons a Postgres transaction for everything
    # that follows it. Without the savepoint, a store with no rate table —
    # or any error here — took the whole order down instead of quietly
    # charging no tax.
    try:
        from sqlalchemy import select as _select
        from app.api.v1.admin.taxes import TaxRate
        async with db.begin_nested():
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
