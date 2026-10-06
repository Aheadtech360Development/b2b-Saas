"""What an order's total is made of, line by line, for the people reading it.

An order stores its subtotal, shipping, tax and total, but not the discount
that brought the total down: that lives with the discount code's usage. Read
on its own, a $7.35 order with a $1.17 total said nothing about where the
difference went, and a manager looking at it could not tell a discount from a
mistake.

The lines come from the codes recorded against the order. Whatever the total
is still short of after those — an order from before codes were recorded with
it — is shown as a discount too, so the figures on screen always add up.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

CENTS = Decimal("0.01")


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENTS)


def _label(code: str, kind: str, value: Decimal) -> str:
    if kind == "percentage":
        return f"{code} · {value.normalize():f}% off"
    if kind == "free_shipping":
        return f"{code} · free shipping"
    return f"{code} · ${value:.2f} off"


async def discount_lines(db: AsyncSession, order: Any) -> list[dict]:
    """The discounts on one order: the code, what kind it was, how much it took
    off. A free-shipping code is listed with nothing off — its saving is the
    shipping line itself."""
    rows = (await db.execute(text("""
        SELECT u.discount_amount_applied AS amount, c.code, c.discount_type AS kind,
               c.discount_value AS value
        FROM discount_usage u JOIN discount_codes c ON c.id = u.discount_code_id
        WHERE u.order_id = CAST(:oid AS uuid)
        ORDER BY u.used_at, c.code
    """), {"oid": str(order.id)})).all()

    lines: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for r in rows:
        kind = str(r.kind or "")
        # A free-shipping code is recorded twice (once with the amount, which
        # is nothing): one line says it.
        if (r.code, kind) in seen and kind == "free_shipping":
            continue
        seen.add((r.code, kind))
        lines.append({
            "code": r.code,
            "type": kind,
            "value": float(_money(r.value)) if kind != "percentage" else float(Decimal(str(r.value or 0))),
            "amount": float(_money(r.amount)),
            "label": _label(r.code, kind, Decimal(str(r.value or 0))),
        })

    # Whatever the parts still exceed the total by. Never negative: a total
    # higher than its parts is somebody's adjustment, not a discount.
    gap = discount_total(order) - sum((_money(line["amount"]) for line in lines), Decimal("0"))
    if gap >= CENTS:
        lines.append({
            "code": None, "type": "other", "value": 0.0, "amount": float(gap),
            "label": "Discount" if not lines else "Other adjustment",
        })
    return lines


def discount_total(order: Any) -> Decimal:
    """Everything the discounts took off, in one figure: what the order's parts
    come to, less its total. What a document with one discount line shows
    (services/pdf_service.py), and needs no lookup to know."""
    parts = (_money(order.subtotal) + _money(order.shipping_cost) + _money(order.tax_amount)
             + _money(getattr(order, "convenience_fee", 0)))
    return max(Decimal("0"), parts - _money(order.total))


def tax_label(order: Any) -> str:
    """"Tax", or "Tax (WY · 6%)" when the order kept where and at what rate."""
    region = (getattr(order, "tax_region", None) or "").strip()
    rate = getattr(order, "tax_rate", None)
    bits = []
    if region:
        bits.append(region)
    if rate:
        bits.append(f"{Decimal(str(rate)).normalize():f}%")
    return f"Tax ({' · '.join(bits)})" if bits else "Tax"
