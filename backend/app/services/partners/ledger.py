"""What a paid invoice earns, and what a partner's lines add up to.

Pure functions: no database and no Stripe calls, so every case the money
depends on is tested straight from a payload (tests/test_partner_ledger.py).

Stripe changed the invoice's shape in its 2025 API versions: the price moved
from `line.price` to `line.pricing.price_details.price`, the subscription
under `parent`, the taxes from `tax_amounts` to `taxes`. A webhook
destination stays on the version it was made with, so both shapes are read.
Reading only one is silent: the invoice finds no plan price and the partner
is never paid.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction


def _round(value: Fraction | int) -> int:
    """To the cent. Half a cent goes away from zero, so a clawback is the
    exact mirror of the line it takes back."""
    if isinstance(value, Fraction):
        exact = Decimal(value.numerator) / Decimal(value.denominator)
    else:
        exact = Decimal(value)
    return int(exact.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def subscription_id_of(invoice: dict) -> str | None:
    """Which subscription an invoice is for, in either payload shape."""
    direct = invoice.get("subscription")
    if direct:
        return direct if isinstance(direct, str) else direct.get("id")
    details = (invoice.get("parent") or {}).get("subscription_details") or {}
    sub = details.get("subscription")
    if sub:
        return sub if isinstance(sub, str) else sub.get("id")
    for line in (invoice.get("lines") or {}).get("data") or []:
        item = (line.get("parent") or {}).get("subscription_item_details") or {}
        if item.get("subscription"):
            return item["subscription"]
    return None


def subscription_metadata_of(invoice: dict) -> dict:
    """The subscription's metadata as the invoice carries it, in either shape."""
    old = invoice.get("subscription_details") or {}
    new = (invoice.get("parent") or {}).get("subscription_details") or {}
    return new.get("metadata") or old.get("metadata") or {}


def payment_ref_of(invoice: dict) -> str | None:
    """The payment the invoice was paid with, when the payload says.

    Older shapes carry it on the invoice; the 2025 shape only lists payments
    when they were expanded. A refund finds its line by this, or failing
    that by asking Stripe which invoice a payment paid.
    """
    for key in ("payment_intent", "charge"):
        v = invoice.get(key)
        if v:
            return v if isinstance(v, str) else v.get("id")
    for p in ((invoice.get("payments") or {}).get("data") or []):
        payment = (p or {}).get("payment") or {}
        v = payment.get("payment_intent") or payment.get("charge")
        if v:
            return v if isinstance(v, str) else v.get("id")
    return None


def line_price(line: dict) -> tuple[str | None, dict | None]:
    """The price a line is for: (its id, the price object when the payload has one)."""
    price = line.get("price")
    if isinstance(price, dict):
        return price.get("id"), price
    if isinstance(price, str):
        return price, None
    details = (line.get("pricing") or {}).get("price_details") or {}
    p = details.get("price")
    if isinstance(p, dict):
        return p.get("id"), p
    if isinstance(p, str):
        return p, None
    plan = line.get("plan")
    if isinstance(plan, dict):
        return plan.get("id"), plan
    return None, None


def line_discounts(line: dict) -> int:
    """What discounts took off this line, promotion codes included."""
    amounts = line.get("discount_amounts")
    if isinstance(amounts, list) and amounts:
        return sum(int((d or {}).get("amount") or 0) for d in amounts)
    credits = line.get("pretax_credit_amounts")
    if isinstance(credits, list):
        return sum(int((c or {}).get("amount") or 0) for c in credits
                   if (c or {}).get("type") == "discount")
    return 0


def line_inclusive_tax(line: dict) -> int:
    """Tax already inside the line's amount. Tax added on top is not in it."""
    total = 0
    for t in line.get("tax_amounts") or []:
        if (t or {}).get("inclusive"):
            total += int(t.get("amount") or 0)
    for t in line.get("taxes") or []:
        if (t or {}).get("tax_behavior") == "inclusive":
            total += int(t.get("amount") or 0)
    return total


def line_paid_base(line: dict) -> int:
    """The line's plan fee after discounts and without tax. Negative for a
    proration credit (the unused part of a plan the shop moved off)."""
    return int(line.get("amount") or 0) - line_discounts(line) - line_inclusive_tax(line)


def invoice_exclusive_tax(invoice: dict) -> int:
    total = 0
    for t in invoice.get("total_tax_amounts") or []:
        if not (t or {}).get("inclusive"):
            total += int(t.get("amount") or 0)
    for t in invoice.get("total_taxes") or []:
        if (t or {}).get("tax_behavior") != "inclusive":
            total += int((t or {}).get("amount") or 0)
    return total


@dataclass(frozen=True)
class Earning:
    base_cents: int          # what the commission is a share of; 0 when nothing earns
    plan_key: str | None     # the plan the invoice is mostly for
    reason: str              # why it is 0, or what it is for


def invoice_earning(
    invoice: dict,
    lines: Iterable[dict],
    plan_for: Callable[[str | None, dict | None], str | None],
    commissionable: set[str],
) -> Earning:
    """What a paid invoice earns a partner a share of.

    Only lines for a commissionable plan's price count: an add-on, the Gang
    Sheet Builder commission (an application fee, never on this invoice) and
    tax never do. A plan switch puts a credit for the old plan and a charge
    for the new one on the same invoice, so they are added together. And the
    base never exceeds what was actually paid, less tax added on top, so a
    $0 invoice, or one paid from a credit balance, earns nothing it did not
    bring in.
    """
    total = 0
    counted = 0
    excluded = 0
    # The plan the invoice is for is the one with the biggest line: after a
    # switch that is the new plan's charge, not the old plan's credit.
    best_base: int | None = None
    best_key: str | None = None
    for line in lines:
        pid, pobj = line_price(line)
        key = plan_for(pid, pobj)
        if key is None:
            continue
        if key not in commissionable:
            excluded += 1
            continue
        base = line_paid_base(line)
        total += base
        counted += 1
        if best_base is None or base > best_base:
            best_base, best_key = base, key

    paid = invoice.get("amount_paid")
    if paid is not None and int(paid) <= 0:
        return Earning(0, best_key, "$0 invoice, nothing was paid")
    if counted == 0:
        if excluded:
            return Earning(0, None, "This plan does not earn commission")
        return Earning(0, None, "Add-on only, not a plan price")
    if total <= 0:
        return Earning(0, best_key, "Plan credit only, nothing earned")
    base = total
    if paid is not None:
        base = min(base, max(0, int(paid) - invoice_exclusive_tax(invoice)))
        if base <= 0:
            return Earning(0, best_key, "Paid from a credit, nothing earned")
    return Earning(base, best_key, "Base fee")


def commission_cents(base_cents: int, rate_bps: int) -> int:
    """base x rate, to the cent. 9700 at 20% is 1940."""
    return _round(Fraction(base_cents * rate_bps, 10000))


def clawback_due(*, line_amount: int, line_base: int, refunded: int, paid: int,
                 taken_amount: int, taken_base: int) -> tuple[int, int]:
    """How much more of a line to take back now, as (amount, base), both >= 0.

    `refunded` is everything refunded or disputed on the payment so far, so a
    second partial refund takes only its own share and a replay takes
    nothing. `taken_*` is what earlier clawbacks of this line already took.
    """
    if paid <= 0 or refunded <= 0:
        return 0, 0
    share = min(Fraction(refunded, paid), Fraction(1))
    due_amount = _round(Fraction(line_amount) * share)
    due_base = _round(Fraction(line_base) * share)
    return max(0, due_amount - taken_amount), max(0, due_base - taken_base)


# ── Reading a ledger ──────────────────────────────────────────────────────────

def utc_today() -> date:
    """The day, as the ledger counts days. A line's hold is counted from the
    moment Stripe says it was paid, in UTC, so "today" is UTC's too: on a
    machine in another time zone the screens and the lines still agree."""
    return datetime.now(timezone.utc).date()


def line_state(kind: str, status: str, payable_on: date, today: date) -> str:
    """What a line is, in the words the screens use."""
    if status == "paid":
        return "paid"
    if status == "void":
        return "void"
    if status == "held":
        return "on_hold"
    if kind == "clawback":
        return "clawback"
    return "pending" if payable_on > today else "payable"


def balances(lines: Iterable[dict], today: date) -> dict[str, int]:
    """A partner's money, from their lines.

    Payable is everything open, past its hold and not already in a batch,
    clawbacks and minus adjustments included, so a refund nets against the
    next payout. Pending is still inside the hold. On hold waits for a
    decision and is in neither.
    """
    out = {"pending": 0, "payable": 0, "payable_gross": 0, "clawbacks": 0,
           "on_hold": 0, "in_batch": 0, "paid": 0}
    for ln in lines:
        amount = int(ln["amount_cents"])
        status = ln["status"]
        if status == "paid":
            out["paid"] += amount
        elif status == "held":
            out["on_hold"] += amount
        elif status == "open":
            if ln.get("batch_id"):
                out["in_batch"] += amount
            elif ln["payable_on"] > today:
                out["pending"] += amount
            else:
                out["payable"] += amount
                if amount < 0:
                    out["clawbacks"] += amount
                else:
                    out["payable_gross"] += amount
    return out


def payout_readiness(*, partner_status: str, payable: int, minimum: int,
                     has_w9: bool) -> tuple[str, str]:
    """Whether a partner can be paid in the next batch, and why not."""
    if partner_status in ("suspended", "terminated"):
        return "held", "Held, suspended" if partner_status == "suspended" else "Held, terminated"
    if payable < max(minimum, 1):
        return "under_min", f"Under {money_short(minimum)}, rolls over"
    if not has_w9:
        return "blocked", "Blocked, no W-9"
    if partner_status == "paused":
        return "ready", "Paused, still paid"
    return "ready", "Ready"


def money(cents: int) -> str:
    """1940 -> "$19.40", -1940 -> "-$19.40"."""
    sign = "-" if cents < 0 else ""
    cents = abs(int(cents))
    return f"{sign}${cents // 100:,}.{cents % 100:02d}"


def money_short(cents: int) -> str:
    """Whole dollars without the cents: 5000 -> "$50", 5050 -> "$50.50"."""
    return money(cents)[:-3] if int(cents) % 100 == 0 else money(cents)
