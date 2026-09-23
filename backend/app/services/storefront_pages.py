"""The shop's written pages: contact, quote, and the policies in the footer.

The design has a home page, a collection page and a product page. It has no
page for "Shipping Policy" — but the footer links to one, and a shop that goes
live with dead policy links is not a shop anybody trusts. So these pages are
written here, as words the brand owns and edits, and drawn in the theme's own
stylesheet so they look like the rest of the shop rather than like a different
site.

Nothing is invented about the brand: the defaults describe how this kind of
print shop works and leave the specifics ("2 business days", an address) as
plain wording the brand changes. Stored per brand in one settings row, so
there is no schema to migrate and no second place for a page to live.
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_settings import get_setting, set_setting

SETTINGS_KEY = "storefront_pages"

MAX_SECTIONS = 20
MAX_HEADING = 200
MAX_BODY = 20000


def _page(slug: str, title: str, intro: str, sections: list[tuple[str, str]],
          *, form: str = "") -> dict[str, Any]:
    return {
        "slug": slug,
        "title": title,
        "intro": intro,
        "form": form,
        "sections": [{"heading": h, "body": b} for h, b in sections],
    }


# What each page says until the brand writes its own. Plain, specific to a
# print shop, and free of promises only the brand can make.
DEFAULTS: dict[str, dict[str, Any]] = {
    "contact": _page(
        "contact", "Contact us",
        "Tell us what you need and we will come back to you. Orders, artwork, "
        "reprints — anything.",
        [],
        form="contact",
    ),
    "quote": _page(
        "quote", "Get a quote",
        "Bigger run, unusual size, or something that isn't on the site yet? "
        "Send us the details and we will price it.",
        [],
        form="quote",
    ),
    "shipping": _page(
        "shipping", "Shipping Policy",
        "How orders are produced and sent.",
        [
            ("Production time",
             "Production starts once your artwork is approved. Orders placed before the "
             "daily cut-off go into that day's production run; anything after it goes "
             "into the next one. Production time is separate from transit time."),
            ("Shipping and transit",
             "Orders ship from our facility with the carrier chosen at checkout. Transit "
             "time is the carrier's, not ours, and we cannot speed up a parcel once it "
             "has left us."),
            ("Local pickup",
             "Pickup orders are held at our counter once they are finished. We will let "
             "you know when yours is ready and how long we can hold it."),
            ("Tracking",
             "You get a tracking number by email as soon as your order ships. You can "
             "also follow it from your order confirmation."),
            ("Wrong or undeliverable addresses",
             "Check the address before you order. A parcel returned to us because of a "
             "bad address can be sent again, but the second shipment is charged."),
        ],
    ),
    "returns": _page(
        "returns", "Returns & Reprints",
        "Custom print is made for you, so this is about getting it right rather "
        "than sending it back.",
        [
            ("If we got it wrong",
             "If what arrives does not match what you ordered — wrong size, wrong "
             "colour, a print fault — tell us and send a photo. We reprint it. You do "
             "not pay twice and you do not pay the shipping."),
            ("If the artwork was the problem",
             "We print the file you send at the size you choose. Low-resolution "
             "artwork, the wrong colour mode or a typo in the file will print exactly "
             "as supplied, so those are not reprints. We will always flag a file that "
             "looks likely to print badly before we run it."),
            ("Time limit",
             "Tell us within a reasonable window of delivery, while the problem can "
             "still be traced to the run. Claims long after delivery are hard to place."),
            ("Blanks and stock items",
             "Unprinted stock in its original condition and packaging can be returned. "
             "Anything printed, cut or pressed cannot."),
            ("Cancelling",
             "An order can be cancelled up to the point it goes into production. After "
             "that the material is already used."),
        ],
    ),
    "privacy": _page(
        "privacy", "Privacy Policy",
        "What we collect, why, and what we do not do with it.",
        [
            ("What we collect",
             "What you give us in order to buy something: your name, email, phone, "
             "billing and shipping address, and the artwork you upload. Plus the "
             "ordinary record of your orders."),
            ("Why we have it",
             "To take your order, print it, ship it, bill it, and answer you when you "
             "ask about it. Nothing here is collected for any other reason."),
            ("Payment details",
             "Card details are handled by our payment processor and are never stored on "
             "our servers. We see enough to match a payment to an order and no more."),
            ("Your artwork",
             "Files you upload are used to produce your order and to reprint it if you "
             "reorder. We do not sell them, publish them, or use them to promote "
             "anything without asking you first."),
            ("Who else sees it",
             "Only the services that make an order happen: payment, shipping, and email. "
             "Each gets what that job needs. We do not sell your details to anybody."),
            ("Your choices",
             "Ask us for a copy of what we hold, ask us to correct it, or ask us to "
             "delete it — we keep what tax and accounting rules require us to keep, and "
             "remove the rest. Marketing email always has an unsubscribe link."),
        ],
    ),
    "terms": _page(
        "terms", "Terms of Service",
        "The terms you are agreeing to when you order.",
        [
            ("Placing an order",
             "An order is accepted when we confirm it. Prices and stock can change "
             "before that, and an obvious pricing error does not oblige us to fill an "
             "order at that price."),
            ("Your artwork",
             "By uploading a file you confirm you have the right to print it. We do not "
             "check ownership, and we cannot print anything that infringes someone "
             "else's rights."),
            ("Proofs and approval",
             "Where a proof is provided, production runs from the approved proof. What "
             "you approve is what gets made."),
            ("Colour",
             "Screens and printers do not match exactly. We print to a consistent "
             "standard, but a small shift between what you see on screen and what comes "
             "off the press is normal and is not a fault."),
            ("Payment",
             "Orders are paid before production unless account terms have been agreed "
             "with you in writing."),
            ("Liability",
             "If something goes wrong with an order, our responsibility is to reprint it "
             "or refund it. We are not liable for indirect losses beyond that."),
            ("Changes",
             "These terms can change. The version on this page is the one that applies "
             "to an order placed today."),
        ],
    ),
}

ORDER = ["contact", "quote", "shipping", "returns", "privacy", "terms"]


def _clean(slug: str, given: Any) -> dict[str, Any]:
    """One page as the brand saved it, checked against what a page can be.

    The brand writes the words; it does not get to invent a page, a form or a
    hundred sections.
    """
    base = DEFAULTS[slug]
    if not isinstance(given, dict):
        return dict(base)
    sections_in = given.get("sections")
    sections = base["sections"]
    if isinstance(sections_in, list):
        sections = [
            {
                "heading": str((s or {}).get("heading") or "")[:MAX_HEADING],
                "body": str((s or {}).get("body") or "")[:MAX_BODY],
            }
            for s in sections_in[:MAX_SECTIONS]
            if isinstance(s, dict) and (str((s or {}).get("heading") or "").strip()
                                        or str((s or {}).get("body") or "").strip())
        ]
    return {
        "slug": slug,
        "title": str(given.get("title") or base["title"])[:MAX_HEADING],
        "intro": str(given.get("intro") or "")[:MAX_BODY] if "intro" in given else base["intro"],
        "form": base["form"],          # which form a page carries is not the brand's to change
        "sections": sections,
    }


def clean_all(given: Any) -> dict[str, dict[str, Any]]:
    """Every page, in a fixed set, however little was sent."""
    incoming = given if isinstance(given, dict) else {}
    return {slug: _clean(slug, incoming.get(slug)) for slug in ORDER}


async def load(db: AsyncSession, tenant_id: Any) -> dict[str, dict[str, Any]]:
    """This brand's pages — its own words where it has written them."""
    raw = await get_setting(db, SETTINGS_KEY, tenant_id=tenant_id)
    try:
        stored = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        stored = {}
    return clean_all(stored)


async def save(db: AsyncSession, tenant_id: Any, pages: Any) -> dict[str, dict[str, Any]]:
    cleaned = clean_all(pages)
    await set_setting(db, SETTINGS_KEY, json.dumps(cleaned), tenant_id=tenant_id)
    return cleaned


def links() -> list[dict[str, str]]:
    """Where these pages live, for the customizer's link picker."""
    return [
        {"label": DEFAULTS[slug]["title"], "href": href_for(slug)}
        for slug in ORDER
    ]


def href_for(slug: str) -> str:
    if slug == "contact":
        return "/contact"
    if slug == "quote":
        return "/quote"
    return f"/policies/{slug}"
