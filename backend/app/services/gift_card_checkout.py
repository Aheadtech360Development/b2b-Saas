"""Gift cards at checkout, on orders and on refunds (Retail launch, package 3).

Paying with one (a tender, not a discount: tax and shipping are worked out on
the order as usual, then the cards pay what they can of the total):

1. The payment step (`/checkout/intent`, `/guest/payment-intent`) calls `take`
   with the codes the buyer entered and the page's attempt key. It gives back
   whatever that attempt had set aside before, locks the cards (in id order,
   so two checkouts never wait on each other), and holds what each pays. The
   card is charged the rest, never less than Stripe's $0.50: a card that would
   leave less pays a little less itself. The intent's metadata records which
   cards pay how much (`intent_meta`).
2. When the order is made (`/checkout/confirm`, `/guest/checkout`), `settle`
   captures those holds for it. A hold that ran out in between is taken again
   if the card still has the money; if not, the order is refused and the card
   charge is refunded by the caller. The buyer must still present the codes:
   a payment intent id alone spends nobody's card.
3. Cards that cover the whole order: no payment intent at all, the same
   holds, captured in the same transaction as the order.

Buying one: a cart line of kind `gift_card` (no shipping, no tax, no
discount code, paid by card only, never by another gift card). When the
order is paid, `issue_for_order` makes a card per line and `send_cards`
emails the code to the recipient and a receipt (no code) to the buyer.

Refunds (`split_refund`, `refund_to_cards`): the card part first, through
Stripe, up to what the card paid; the rest back onto the gift cards. A sold
card can be refunded only while unused, and refunding it voids it.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, text

from app.models.gift_card import GiftCard, GiftCardHold, GiftCardLedger
from app.services import gift_cards as gc

logger = logging.getLogger(__name__)

GIFT_SKU = "GIFT-CARD"
_EMAIL = re.compile(r"^[^@\s<>\"',;]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$")
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


# ── Buying one ─────────────────────────────────────────────────────────────

def _clean(value: Any, limit: int) -> str:
    return _CONTROL.sub("", str(value or "")).strip()[:limit]


def line_details(*, amount: Decimal, recipient_email: Any, recipient_name: Any = None,
                 message: Any = None, sender_name: Any = None) -> dict:
    """A gift card line's own details, checked. Kept on the cart line and the
    order line (configuration.gift_card)."""
    email = _clean(recipient_email, 254).lower()
    if not _EMAIL.match(email):
        raise gc.GiftCardError("Enter the email address the gift card should go to.")
    text_message = _CONTROL.sub("", str(message or "")).strip()
    if len(text_message) > gc.MESSAGE_MAX:
        raise gc.GiftCardError(f"The message can be up to {gc.MESSAGE_MAX} characters.")
    return {
        "amount": str(amount),
        "recipient_email": email,
        "recipient_name": _clean(recipient_name, 120) or None,
        "message": text_message or None,
        "sender_name": _clean(sender_name, 120) or None,
    }


def label_for(details: dict) -> str:
    who = details.get("recipient_name") or details.get("recipient_email")
    return f"Gift card {gc.money(details['amount']):,.2f} for {who}"[:255]


def is_gift_line(item: Any) -> bool:
    """An order or cart line that is a gift card being bought."""
    if getattr(item, "item_type", None) == "gift_card":
        return True
    cfg = getattr(item, "configuration", None) or {}
    return getattr(item, "sku", None) == GIFT_SKU and isinstance(cfg, dict) and bool(cfg.get("gift_card"))


def order_line(details: dict) -> dict:
    """The OrderItem fields for a gift card line."""
    amount = gc.money(details["amount"])
    return {
        "variant_id": None,
        "product_name": label_for(details),
        "sku": GIFT_SKU,
        "color": None,
        "size": None,
        "quantity": 1,
        "unit_price": amount,
        "line_total": amount,
        "configuration": {"gift_card": details},
    }


async def issue_for_order(db, order: Any, *, buyer_email: str | None = None) -> list[tuple[GiftCard, str | None]]:
    """A card for every gift card line of a paid order. Safe to run twice: the
    second run finds the cards it made (with no code)."""
    conf = await gc.settings_for(db, order.tenant_id)
    made: list[tuple[GiftCard, str | None]] = []
    for item in list(getattr(order, "items", None) or []):
        if not is_gift_line(item):
            continue
        details = (item.configuration or {}).get("gift_card") or {}
        for n in range(int(item.quantity or 1)):
            card, code = await gc.issue(
                db, tenant_id=order.tenant_id, amount=item.unit_price, source="purchase",
                key=f"purchase:{order.id}:{item.id}:{n}", expires_at=gc.expiry_from(conf),
                purchase_order_id=order.id, buyer_user_id=getattr(order, "placed_by_id", None),
                buyer_email=buyer_email or getattr(order, "guest_email", None),
                recipient_name=details.get("recipient_name"), recipient_email=details.get("recipient_email"),
                message=details.get("message"), sender_name=details.get("sender_name"),
            )
            made.append((card, code))
    return made


async def send_cards(db, order: Any, made: list[tuple[GiftCard, str | None]], *, buyer_email: str | None) -> None:
    """Email each new card's code to its recipient, and the buyer a receipt.
    In the shop's name (the request's brand identity), with links to the
    shop's own address. A card whose email failed gets a new code from the
    admin's "Send a new code": the code is not kept anywhere to send again."""
    from datetime import datetime, timezone

    from app.services import brand_urls, mails, order_view
    from app.services.email_service import EmailService

    shop_url = await brand_urls.for_tenant(db, order.tenant_id, "/")
    balance_url = await brand_urls.for_tenant(db, order.tenant_id, "/gift-cards/balance")
    order_url = (await brand_urls.for_tenant(db, order.tenant_id, f"/checkout/thank-you/{order.order_number}")
                 + f"#k={order_view.view_key(order.id, order.tenant_id)}")
    svc = EmailService(db)
    for card, code in made:
        if not code or not card.recipient_email:
            continue
        try:
            subject, html = mails.gift_card_received(
                amount=card.initial_amount, code=gc.display(code), recipient_name=card.recipient_name,
                sender_name=card.sender_name, message=card.message, shop_url=shop_url,
                balance_url=balance_url, expires_on=card.expires_at,
            )
            if svc.send_raw(to_email=card.recipient_email, subject=subject, body_html=html):
                card.delivered_at = datetime.now(timezone.utc)
        except Exception:  # noqa: BLE001
            logger.exception("Gift card %s: recipient email failed", card.id)
        to = (buyer_email or "").strip().lower()
        if to and to != (card.recipient_email or "").lower():
            try:
                subject, html = mails.gift_card_sent(
                    amount=card.initial_amount, recipient_email=card.recipient_email, last4=card.code_last4,
                    order_number=order.order_number, order_url=order_url,
                )
                svc.send_raw(to_email=to, subject=subject, body_html=html)
            except Exception:  # noqa: BLE001
                logger.exception("Gift card %s: buyer receipt failed", card.id)
    await db.flush()


async def send_one(db, card: GiftCard, code: str) -> bool:
    """A card's code to its recipient, outside an order (issued or re-sent by
    the admin)."""
    from datetime import datetime, timezone

    from app.services import brand_urls, mails
    from app.services.email_service import EmailService

    if not card.recipient_email:
        return False
    subject, html = mails.gift_card_received(
        amount=card.balance, code=gc.display(code),
        recipient_name=card.recipient_name, sender_name=card.sender_name, message=card.message,
        shop_url=await brand_urls.for_tenant(db, card.tenant_id, "/"),
        balance_url=await brand_urls.for_tenant(db, card.tenant_id, "/gift-cards/balance"),
        expires_on=card.expires_at,
    )
    try:
        sent = EmailService(db).send_raw(to_email=card.recipient_email, subject=subject, body_html=html)
    except Exception:  # noqa: BLE001
        logger.exception("Gift card %s: email failed", card.id)
        return False
    if sent:
        card.delivered_at = datetime.now(timezone.utc)
        await db.flush()
    return bool(sent)


# ── Paying with one ────────────────────────────────────────────────────────

@dataclass
class Taken:
    card_id: str
    last4: str
    amount: Decimal
    hold_id: str | None = None


@dataclass
class Tender:
    total: Decimal
    taken: list[Taken] = field(default_factory=list)
    checkout_ref: str = ""

    @property
    def gift_total(self) -> Decimal:
        return sum((t.amount for t in self.taken), Decimal("0")).quantize(gc.CENTS)

    @property
    def remainder(self) -> Decimal:
        return (self.total - self.gift_total).quantize(gc.CENTS)

    def view(self) -> dict:
        return {
            "gift_cards": [{"last4": t.last4, "masked": gc.masked(t.last4), "amount": float(t.amount)}
                           for t in self.taken],
            "gift_card_total": float(self.gift_total),
            "card_amount": float(self.remainder),
            "gift_only": bool(self.taken) and self.remainder == 0,
        }


def clean_codes(codes: Any) -> list[str]:
    """The codes a buyer entered, normalised, each once. Ones that cannot be a
    code are kept as typed so the buyer is told which."""
    if not codes:
        return []
    if not isinstance(codes, list):
        raise gc.GiftCardError(gc.NOT_VALID)
    out: list[str] = []
    for raw in codes:
        norm = gc.normalize(raw) or str(raw or "").strip()[:64]
        if norm and norm not in out:
            out.append(norm)
    if len(out) > gc.MAX_CARDS_PER_ORDER:
        raise gc.GiftCardError(f"Up to {gc.MAX_CARDS_PER_ORDER} gift cards on one order.")
    return out


def clean_ref(ref: Any) -> str:
    ref = str(ref or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{8,100}", ref):
        raise gc.GiftCardError("Your checkout needs refreshing. Reload the page and try again.")
    return ref


async def release_ref(db, tenant_id: Any, checkout_ref: str, *, reason: str) -> int:
    ids = (await db.execute(
        select(GiftCardHold.id).where(GiftCardHold.tenant_id == tenant_id,
                                      GiftCardHold.checkout_ref == checkout_ref,
                                      GiftCardHold.status == "held")
    )).scalars().all()
    n = 0
    for hold_id in ids:
        if await gc.release(db, hold_id, reason=reason):
            n += 1
    return n


def _split(total: Decimal, balances: list[tuple[str, str, Decimal]]) -> list[Taken]:
    """What each card pays of `total`, in the order the buyer entered them,
    leaving the card charge at $0 or at least Stripe's minimum."""
    remaining = total
    taken: list[Taken] = []
    for card_id, last4, balance in balances:
        amount = min(balance, remaining).quantize(gc.CENTS)
        if amount > 0:
            taken.append(Taken(card_id, last4, amount))
            remaining -= amount
    left = (total - sum((t.amount for t in taken), Decimal("0"))).quantize(gc.CENTS)
    if Decimal("0") < left < gc.CARD_MINIMUM:
        need = gc.CARD_MINIMUM - left
        for t in reversed(taken):
            cut = min(t.amount, need)
            t.amount -= cut
            need -= cut
            if need <= 0:
                break
        taken = [t for t in taken if t.amount > 0]
        left = (total - sum((t.amount for t in taken), Decimal("0"))).quantize(gc.CENTS)
        if Decimal("0") < left < gc.CARD_MINIMUM:
            raise gc.GiftCardError("This order is too small to split between a gift card and a card.")
    return taken


async def take(db, *, tenant_id: Any, codes: Any, total: Decimal, checkout_ref: Any, visitor: str,
               buying_gift_cards: bool = False) -> Tender:
    """Hold what the entered gift cards pay of `total` for this checkout.

    Whatever this attempt held before is given back first: the buyer is
    looking at a new total. No codes: nothing held, the card pays it all.
    """
    total = Decimal(str(total)).quantize(gc.CENTS)
    codes = clean_codes(codes)
    if not codes:
        if checkout_ref:
            try:
                await release_ref(db, tenant_id, clean_ref(checkout_ref), reason="Gift card removed at checkout")
            except gc.GiftCardError:
                pass
        return Tender(total=total)
    ref = clean_ref(checkout_ref)
    if buying_gift_cards:
        raise gc.GiftCardError("A gift card can't be paid for with another gift card. Remove the gift card "
                               "code, or buy the gift card on its own order.")
    if not await gc.accepted(db, tenant_id):
        raise gc.GiftCardError("This shop doesn't take gift cards.")
    await release_ref(db, tenant_id, ref, reason="Checkout changed")

    found: list[GiftCard] = []
    for raw in codes:
        try:
            found.append(await gc.lookup(db, tenant_id, raw, visitor))
        except gc.TooManyTries:
            raise
        except gc.GiftCardError as exc:
            ending = raw[-4:] if len(raw) >= 4 else raw
            raise gc.GiftCardError(f"Gift card ending {ending}: {exc}") from None

    # Locked in id order, so two checkouts holding the same cards queue
    # rather than deadlock; spent in the order the buyer entered them.
    locked = {str(c.id): await gc._lock(db, c.id) for c in sorted(found, key=lambda c: str(c.id))}
    balances = []
    for c in found:
        card = locked[str(c.id)]
        problem = gc.usable_problem(card)
        if problem:
            raise gc.GiftCardError(f"Gift card ending {card.code_last4}: {problem}")
        balances.append((str(card.id), card.code_last4, Decimal(str(card.balance))))
    tender = Tender(total=total, taken=_split(total, balances), checkout_ref=ref)
    for t in tender.taken:
        h = await gc.hold(db, locked[t.card_id], t.amount, checkout_ref=ref)
        t.hold_id = str(h.id)
    return tender


async def attach_intent(db, tender: Tender, payment_intent_id: str | None) -> None:
    for t in tender.taken:
        if t.hold_id:
            h = await db.get(GiftCardHold, t.hold_id)
            if h is not None:
                h.payment_intent_id = payment_intent_id
    await db.flush()


def intent_meta(tender: Tender) -> dict[str, str]:
    """For the payment intent: which cards pay how much. Read back by `planned`."""
    if not tender.taken:
        return {}
    return {
        "gift_cards": ";".join(f"{t.card_id}:{t.amount}" for t in tender.taken),
        "gift_card_total": str(tender.gift_total),
        "checkout_ref": tender.checkout_ref,
    }


def planned(meta: Any) -> list[tuple[str, Decimal]]:
    raw = (meta or {}).get("gift_cards") if hasattr(meta, "get") else None
    out: list[tuple[str, Decimal]] = []
    for part in str(raw or "").split(";"):
        if ":" not in part:
            continue
        card_id, amount = part.split(":", 1)
        try:
            out.append((card_id.strip(), Decimal(amount).quantize(gc.CENTS)))
        except Exception:  # noqa: BLE001
            continue
    return out


async def held_for(db, tenant_id: Any, checkout_ref: str) -> list[tuple[str, Decimal]]:
    """What a checkout with no card payment set aside: the plan for `settle`."""
    rows = (await db.execute(
        select(GiftCardHold.gift_card_id, GiftCardHold.amount).where(
            GiftCardHold.tenant_id == tenant_id, GiftCardHold.checkout_ref == checkout_ref,
            GiftCardHold.status == "held").order_by(GiftCardHold.created_at)
    )).all()
    return [(str(card_id), Decimal(str(amount))) for card_id, amount in rows]


class Shortfall(gc.GiftCardError):
    """A card no longer has what the checkout set aside on it."""


async def settle(db, *, tenant_id: Any, checkout_ref: str, plan: list[tuple[str, Decimal]], codes: Any,
                 order_id: Any) -> list[dict]:
    """Spend the planned amounts on the order. Raises Shortfall when a card
    cannot pay its part any more; the caller undoes the order and refunds."""
    presented = {gc.code_hash(tenant_id, c) for c in clean_codes(codes) if gc.normalize(c)}
    paid: list[dict] = []
    for card_id, amount in plan:
        card = await db.get(GiftCard, card_id)
        if card is None or str(card.tenant_id) != str(tenant_id) or card.code_hash not in presented:
            raise Shortfall("Your gift card details changed. Enter the code again.")
        hold_id = (await db.execute(
            select(GiftCardHold.id).where(
                GiftCardHold.gift_card_id == card.id, GiftCardHold.checkout_ref == checkout_ref,
                GiftCardHold.status == "held", GiftCardHold.amount == amount)
            .order_by(GiftCardHold.created_at).limit(1)
        )).scalar_one_or_none()
        if not (hold_id and await gc.capture(db, hold_id, order_id=order_id)):
            try:
                await gc.take_now(db, card.id, amount, checkout_ref=checkout_ref, order_id=order_id)
            except gc.GiftCardError:
                raise Shortfall(f"Gift card ending {card.code_last4} no longer has {gc.money(amount):,.2f} on it. "
                                "Nothing was taken from it.") from None
        paid.append({"card_id": str(card.id), "last4": card.code_last4, "amount": amount})
    await release_ref(db, tenant_id, checkout_ref, reason="Not needed for the order")
    return paid


async def record_payment(db, order: Any, paid: list[dict], events: Any) -> None:
    """The order's history: what each gift card paid."""
    for p in paid:
        await events.record(
            db, order, "payment_received",
            f"Gift card ending {p['last4']} paid ${float(p['amount']):.2f}",
            meta={"amount": float(p["amount"]), "method": "gift_card", "gift_card_last4": p["last4"]},
        )


# ── On an order ────────────────────────────────────────────────────────────

async def order_payments(db, order_id: Any) -> dict:
    """What gift cards paid for an order, and what went back onto them."""
    rows = (await db.execute(
        select(GiftCardHold.gift_card_id, GiftCard.code_last4, func.sum(GiftCardHold.amount))
        .join(GiftCard, GiftCard.id == GiftCardHold.gift_card_id)
        .where(GiftCardHold.order_id == order_id, GiftCardHold.status == "captured")
        .group_by(GiftCardHold.gift_card_id, GiftCard.code_last4)
        .order_by(func.min(GiftCardHold.created_at))
    )).all()
    back = dict((await db.execute(
        select(GiftCardLedger.gift_card_id, func.sum(GiftCardLedger.amount))
        .where(GiftCardLedger.order_id == order_id, GiftCardLedger.kind == "refund")
        .group_by(GiftCardLedger.gift_card_id)
    )).all())
    cards = [{"card_id": str(cid), "last4": last4, "amount": float(Decimal(str(amt)).quantize(gc.CENTS)),
              "refunded": float(Decimal(str(back.get(cid) or 0)).quantize(gc.CENTS))}
             for cid, last4, amt in rows]
    return {
        "cards": cards,
        "paid": float(sum((Decimal(str(c["amount"])) for c in cards), Decimal("0"))),
        "refunded": float(sum((Decimal(str(c["refunded"])) for c in cards), Decimal("0"))),
    }


async def sold_on_order(db, order_id: Any) -> list[GiftCard]:
    return list((await db.execute(
        select(GiftCard).where(GiftCard.purchase_order_id == order_id, GiftCard.source == "purchase")
        .order_by(GiftCard.created_at)
    )).scalars().all())


async def _stripe_refunded(db, order_id: Any) -> Decimal:
    from app.services.refund_service import COUNTED

    return Decimal(str((await db.execute(text(
        "SELECT COALESCE(SUM(amount), 0) FROM payment_refunds WHERE order_id = :oid AND status = ANY(:c)"
    ), {"oid": str(order_id), "c": list(COUNTED)})).scalar_one() or 0)).quantize(gc.CENTS)


@dataclass
class RefundPlan:
    card: Decimal          # through Stripe
    gift: Decimal          # back onto the gift cards that paid
    void_cards: list       # sold, unused cards the refund takes back


async def split_refund(db, order: Any, amount: Decimal) -> RefundPlan:
    """How a refund of `amount` on this order is paid back.

    The card part first, up to what the card paid and has not had back; then
    the gift cards. A refund that reaches into the gift cards the order sold
    (goods first, then those cards) takes back unused cards whole, and refuses
    a used one: its value has been spent.
    """
    amount = Decimal(str(amount)).quantize(gc.CENTS)
    paid = await order_payments(db, order.id)
    gift_paid, gift_back = Decimal(str(paid["paid"])), Decimal(str(paid["refunded"]))
    total = Decimal(str(order.total or 0)).quantize(gc.CENTS)
    card_paid = max(Decimal("0"), total - gift_paid) if getattr(order, "stripe_payment_intent_id", None) else Decimal("0")
    card_back = await _stripe_refunded(db, order.id)

    already = card_back + gift_back
    sold = await sold_on_order(db, order.id)
    void_cards: list = []
    if sold:
        # Goods (and shipping and tax) are refunded first, then the gift cards
        # the order sold, each one whole: refunding a card takes it back.
        goods = total - sum((Decimal(str(c.initial_amount)) for c in sold), Decimal("0"))
        into_cards = max(Decimal("0"), already + amount - max(goods, already))
        if into_cards > 0:
            reached = Decimal("0")
            options: list[Decimal] = []
            for c in sold:
                if c.status == "voided" and c.status_reason and c.status_reason.startswith("Refunded with order"):
                    continue  # taken back by an earlier refund
                # Locked until the refund commits: nobody spends it meanwhile.
                c = await gc._lock(db, c.id)
                value = Decimal(str(c.initial_amount))
                if not (c.status == "active" and Decimal(str(c.balance)) == value):
                    raise gc.GiftCardError(
                        f"The gift card ending {c.code_last4} sold on this order has been used or closed, "
                        f"so its ${value:,.2f} can't be refunded.")
                void_cards.append(c)
                reached += value
                options.append(reached)
                if reached >= into_cards:
                    break
            if reached != into_cards:
                room = max(goods - already, Decimal("0"))
                whole = ", ".join(f"${(room + o):,.2f}" for o in options[:3])
                raise gc.GiftCardError(
                    "Gift cards sold on this order are refunded whole. Refund "
                    + (f"${room:,.2f} (the rest of the order) or " if room > 0 else "")
                    + f"{whole}.")

    card = min(amount, max(Decimal("0"), card_paid - card_back))
    gift = (amount - card).quantize(gc.CENTS)
    if gift > gift_paid - gift_back:
        raise gc.GiftCardError(f"Only ${(card_paid - card_back + gift_paid - gift_back):,.2f} is left to refund on this order.")
    return RefundPlan(card=card.quantize(gc.CENTS), gift=gift, void_cards=void_cards)


async def refund_to_cards(db, order: Any, amount: Decimal, *, key: str, actor: tuple | None,
                          reason: str | None = None) -> list[dict]:
    """Put `amount` back onto the gift cards that paid for the order, in the
    order they paid, each up to what it paid and has not had back."""
    left = Decimal(str(amount)).quantize(gc.CENTS)
    back: list[dict] = []
    for c in (await order_payments(db, order.id))["cards"]:
        if left <= 0:
            break
        room = (Decimal(str(c["amount"])) - Decimal(str(c["refunded"]))).quantize(gc.CENTS)
        part = min(room, left)
        if part <= 0:
            continue
        await gc.refund(db, c["card_id"], part, key=f"{key}:{c['card_id']}", order_id=order.id, actor=actor,
                        reason=reason or f"Refund of order {order.order_number}")
        back.append({"last4": c["last4"], "amount": float(part)})
        left -= part
    if left > 0:
        raise gc.GiftCardError("The gift cards on this order cannot take that much back.")
    return back


async def void_sold(db, cards: list, *, order: Any, actor: tuple | None) -> None:
    for c in cards:
        await gc.set_status(db, c.id, "voided", reason=f"Refunded with order {order.order_number}", actor=actor)
