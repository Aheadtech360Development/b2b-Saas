"""Where a print job stands, said once.

The Production board's columns and counts, a job's steps and the one thing to
do next all come from here, so the board and the job's own page cannot
disagree.

A job joins the queue when its order is placed, paid or not: a cash on
delivery order is paid when it is handed over, and its sheet has to be printed
before that. The job's own `paid_at` is only set by a card at checkout, so it
is not what decides; the order's payment is. A job nobody checked out is a
draft and stays out of the queue, so the shop prints only work somebody
ordered.

Pure, apart from the loaders at the foot.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

REVIEW = ("submitted", "in_review")
SENT_BACK = "revision_requested"
SHIPPED = ("shipped", "delivered")
CLOSED = ("cancelled", "refunded")

# The board's columns, left to right. A job sent back to the customer waits in
# the first one: it still needs a look when the new artwork comes in.
COLUMNS = ("review", "approved", "production", "ready")
_COLUMN = {"review": "review", "customer": "review", "approved": "approved",
           "production": "production", "ready": "ready"}

CUTOFF_KEY = "production_cutoff"


@dataclass(frozen=True)
class Job:
    status: str
    order_id: str | None = None
    order_status: str | None = None
    payment_status: str | None = None


def stage(j: Job) -> str:
    """draft | review | customer | approved | production | ready | shipped | rejected | cancelled"""
    if not j.order_id:
        return "draft"
    if (j.order_status or "") in CLOSED:
        return "cancelled"
    s = j.status
    if s == "rejected":
        return "rejected"
    if s == SENT_BACK:
        return "customer"
    if s in ("approved", "production"):
        return s
    if s == "completed":
        return "shipped" if (j.order_status or "") in SHIPPED else "ready"
    # submitted, in_review, or a status not known here: it needs a look.
    return "review"


def column(st: str) -> str | None:
    return _COLUMN.get(st)


def paid(j: Job) -> bool:
    return (j.payment_status or "") == "paid"


# The one thing to do next. `to` is the status it sets, when it sets one.
_NEXT = {
    "review": ("review", "Review artwork", None),
    "customer": ("open", "Open", None),
    "approved": ("start", "Start printing", "production"),
    "production": ("finish", "Mark ready to ship", "completed"),
    "ready": ("order", "Open order", None),
}


def next_action(st: str) -> dict | None:
    hit = _NEXT.get(st)
    return {"key": hit[0], "label": hit[1], "to": hit[2]} if hit else None


_STEPS = (("review", "Artwork review"), ("approved", "Approved"), ("production", "In production"),
          ("ready", "Ready to ship"), ("shipped", "Shipped"))
_AT = {"review": 0, "customer": 0, "approved": 1, "production": 2, "ready": 3, "shipped": 4}


def steps(j: Job) -> list[dict]:
    """Paid, then the job's way through the shop.

    Paid stands on its own evidence: a cash on delivery job is printed before it
    is paid. The rest are done up to the stage the job is at, and that one is
    the current step.
    """
    st = stage(j)
    out = [{"key": "paid", "label": "Paid", "state": "done" if paid(j) else "todo"}]
    if st in ("rejected", "cancelled"):
        out.append({"key": "review", "label": "Artwork review", "state": "done" if st == "rejected" else "todo"})
        out.append({"key": st, "label": "Rejected" if st == "rejected" else "Order cancelled", "state": "stopped"})
        return out
    at = _AT.get(st, -1)
    for i, (key, label) in enumerate(_STEPS):
        state = "done" if i < at or st == "shipped" else "current" if i == at else "todo"
        out.append({"key": key, "label": label, "state": state})
    return out


def kind_of(sheet_size_id: Any, product_type: str | None) -> str:
    """gang_sheet | upload_by_size | upload_own. A buyer's own finished sheet is
    bought on a sheet size like a built one, so only its product tells it apart."""
    if product_type in ("upload_by_size", "upload_own"):
        return product_type
    return "gang_sheet" if sheet_size_id else "upload_by_size"


_CUTOFF = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


def clean_cutoff(value: str | None) -> str:
    """A same-day cutoff as "HH:MM" (24-hour), or "" for none. ValueError otherwise."""
    text = (value or "").strip()
    if not text:
        return ""
    m = _CUTOFF.match(text)
    if not m:
        raise ValueError(text)
    return f"{int(m.group(1)):02d}:{m.group(2)}"


def _money(v: Any) -> float:
    try:
        return round(float(v or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def describe(job_status: str, order: dict | None, *, sheet_size_id: Any = None,
             product_type: str | None = None) -> dict:
    """Where one job stands, for its own page: the stage, the steps, the next
    step and the order it belongs to."""
    j = Job(job_status, order.get("id") if order else None,
            order.get("status") if order else None, order.get("payment_status") if order else None)
    st = stage(j)
    return {
        "stage": st,
        "steps": steps(j),
        "next": next_action(st),
        "job_kind": kind_of(sheet_size_id, product_type),
        "order_paid": paid(j),
        "order_number": order.get("order_number") if order else None,
        "order_status": order.get("status") if order else None,
        "order_payment_status": order.get("payment_status") if order else None,
        "order_payment_method": order.get("payment_method") if order else None,
        "order_shipping_method": order.get("shipping_method") if order else None,
    }


def row(job: Any, order: dict | None, product_type: str | None, company: str | None = None) -> dict:
    """One job as the board and the list show it."""
    d = describe(job.status, order, sheet_size_id=job.sheet_size_id, product_type=product_type)
    return {
        "id": str(job.id),
        "reference": job.reference,
        "status": job.status,
        "stage": d["stage"],
        "column": column(d["stage"]),
        "next": d["next"],
        "kind": d["job_kind"],
        "sheet_name": job.sheet_name,
        "width_in": float(job.sheet_width_in or 0),
        "height_in": float(job.sheet_height_in or 0),
        "quantity": int(job.sheet_quantity or 1),
        "subtotal": _money(job.subtotal),
        "customer": job.contact_name or company or "Guest",
        "contact_email": job.contact_email,
        "revision_count": int(job.revision_count or 0),
        "paid": d["order_paid"],
        "order_id": order.get("id") if order else None,
        "order_number": d["order_number"],
        "order_status": d["order_status"],
        "payment_method": d["order_payment_method"],
        "pickup": "will_call" in (d["order_shipping_method"] or ""),
        "ordered_at": order.get("created_at") if order else None,
        "updated_at": job.updated_at.isoformat() if getattr(job, "updated_at", None) else None,
    }


def board(rows: list[dict], drafts: int, drafts_value: float, cutoff: str | None) -> dict:
    """The board's one answer: the jobs in the queue, oldest order first, and
    the counts above them, all from the same rows."""
    jobs = [r for r in rows if r.get("column")]
    counts = {c: sum(1 for r in jobs if r["column"] == c) for c in COLUMNS}
    return {
        "counts": {
            "queue": len(jobs),
            "value": round(sum(r["subtotal"] for r in jobs), 2),
            "unpaid": sum(1 for r in jobs if not r["paid"]),
            "customer": sum(1 for r in jobs if r["stage"] == "customer"),
            **counts,
            "drafts": int(drafts),
            "drafts_value": round(float(drafts_value or 0), 2),
        },
        "jobs": jobs,
        "cutoff": cutoff or None,
    }


# ── Reading a shop's jobs ─────────────────────────────────────────────────────

def _order_dict(o: Any) -> dict:
    return {
        "id": str(o.id), "order_number": o.order_number, "status": o.status,
        "payment_status": o.payment_status, "payment_method": getattr(o, "payment_method", None),
        "shipping_method": o.shipping_method,
        "created_at": o.created_at.isoformat() if o.created_at else None,
    }


async def linked_order(db, order_id) -> dict | None:
    if not order_id:
        return None
    from sqlalchemy import select

    from app.models.order import Order

    o = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    return _order_dict(o) if o else None


async def load_queue(db) -> list[dict]:
    """Every job in the queue: ordered, not rejected, its order still open, and
    not printed and sent already. Oldest order first."""
    from sqlalchemy import and_, not_, select

    from app.api.v1.gang_sheets import GangSheetOrder
    from app.models.company import Company
    from app.models.order import Order
    from app.models.product import Product

    q = (
        select(GangSheetOrder, Order, Product.gang_sheet_type, Company.name)
        .join(Order, Order.id == GangSheetOrder.order_id)
        .outerjoin(Product, Product.id == GangSheetOrder.product_id)
        .outerjoin(Company, Company.id == Order.company_id)
        .where(
            GangSheetOrder.status != "rejected",
            Order.status.notin_(CLOSED),
            not_(and_(GangSheetOrder.status == "completed", Order.status.in_(SHIPPED))),
        )
        .order_by(Order.created_at.asc(), GangSheetOrder.created_at.asc())
    )
    return [row(job, _order_dict(order), ptype, company)
            for job, order, ptype, company in (await db.execute(q)).all()]


async def drafts_summary(db) -> tuple[int, float]:
    """How many sheets were built and never checked out, and what they come to."""
    from sqlalchemy import func, select

    from app.api.v1.gang_sheets import GangSheetOrder

    n, value = (await db.execute(
        select(func.count(GangSheetOrder.id), func.coalesce(func.sum(GangSheetOrder.subtotal), 0))
        .where(GangSheetOrder.order_id.is_(None), GangSheetOrder.status != "rejected")
    )).one()
    return int(n or 0), float(value or 0)


async def load_drafts(db, limit: int = 50) -> list[dict]:
    from sqlalchemy import select

    from app.api.v1.gang_sheets import GangSheetOrder
    from app.models.product import Product

    q = (
        select(GangSheetOrder, Product.gang_sheet_type)
        .outerjoin(Product, Product.id == GangSheetOrder.product_id)
        .where(GangSheetOrder.order_id.is_(None), GangSheetOrder.status != "rejected")
        .order_by(GangSheetOrder.updated_at.desc().nulls_last(), GangSheetOrder.created_at.desc())
        .limit(limit)
    )
    return [row(job, None, ptype) for job, ptype in (await db.execute(q)).all()]
