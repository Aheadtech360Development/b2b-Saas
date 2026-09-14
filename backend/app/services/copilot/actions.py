"""The small set of things the copilot may ask to have done.

Nothing here runs because a model decided to run it. The copilot can only
*propose* an action: it checks the target exists and is in a state the action
makes sense from, and hands back a plain-English summary. That summary reaches
the admin as a button, and the action only runs when a person clicks it — a
separate request, behind require_admin, with the action and its target named
explicitly.

So a reply that says "I'll confirm it" has not confirmed anything, and a model
talked into "just do it" still cannot. The click is the authority.

Everything is tenant-scoped like the rest of the admin, and every action is one
the admin could do on the screen it links to.
"""
from __future__ import annotations

import uuid
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.order import Order


class ActionError(Exception):
    """The action can't be proposed or run; the message is safe to show."""


# ── Orders ───────────────────────────────────────────────────────────────────

async def _find_order(db: AsyncSession, params: dict) -> Order:
    number = str(params.get("order_number") or "").strip().lstrip("#")
    if not number:
        raise ActionError("Which order? Give the order number.")
    order = (await db.execute(select(Order).where(Order.order_number == number))).scalar_one_or_none()
    if not order:
        raise ActionError(f"No order #{number} in this store.")
    return order


def _order_status_action(new_status: str, verb: str, allowed_from: tuple[str, ...]):
    async def preview(db: AsyncSession, params: dict) -> dict:
        order = await _find_order(db, params)
        if order.status == new_status:
            raise ActionError(f"Order #{order.order_number} is already {new_status}.")
        if allowed_from and order.status not in allowed_from:
            raise ActionError(
                f"Order #{order.order_number} is {order.status}; {verb} is only for "
                f"{' or '.join(allowed_from)}."
            )
        extra = ""
        if new_status == "shipped":
            tracking = str(params.get("tracking_number") or "").strip()
            extra = f" with tracking {tracking}" if tracking else " with no tracking number"
        return {
            "summary": f"{verb.capitalize()} order #{order.order_number}{extra} — it is {order.status} now.",
            "target": f"/admin/orders/{order.order_number}",
            "note": "The customer is emailed about the change.",
        }

    async def run(db: AsyncSession, params: dict, admin_user_id: str | None) -> str:
        from app.api.v1.admin.orders import update_order_status
        from app.schemas.order import OrderStatusUpdate

        order = await _find_order(db, params)
        payload = OrderStatusUpdate(
            status=new_status,
            tracking_number=(str(params.get("tracking_number")).strip() if params.get("tracking_number") else None),
            courier=(str(params.get("carrier")).strip() if params.get("carrier") else None),
        )
        # The admin endpoint's own logic: timeline entry, shipped_at, the email.
        await update_order_status(order.id, payload, db)
        return f"Order #{order.order_number} is now {new_status}."

    return preview, run


# ── Print jobs ───────────────────────────────────────────────────────────────

async def _find_job(db: AsyncSession, params: dict):
    from app.api.v1.gang_sheets import GangSheetOrder

    ref = str(params.get("reference") or "").strip()
    if not ref:
        raise ActionError("Which print job? Give its reference, e.g. GS-202609-0003.")
    job = (await db.execute(
        select(GangSheetOrder).where(GangSheetOrder.reference.ilike(ref))
    )).scalar_one_or_none()
    if not job:
        raise ActionError(f"No print job {ref} in this store.")
    return job


def _job_status_action(new_status: str, verb: str, allowed_from: tuple[str, ...], needs_note: bool = False):
    async def preview(db: AsyncSession, params: dict) -> dict:
        job = await _find_job(db, params)
        note = str(params.get("note") or "").strip()
        if job.status == new_status:
            raise ActionError(f"{job.reference} is already {new_status.replace('_', ' ')}.")
        if allowed_from and job.status not in allowed_from:
            raise ActionError(
                f"{job.reference} is {job.status.replace('_', ' ')}; {verb} is only for "
                f"{' or '.join(s.replace('_', ' ') for s in allowed_from)}."
            )
        if needs_note and not note:
            raise ActionError("Say what the customer needs to change — the note is sent to them.")
        return {
            "summary": (f"{verb.capitalize()} {job.reference} ({job.sheet_name})"
                        + (f' with the note: "{note}"' if note else "")),
            "target": "/admin/gang-sheets",
            "note": "The customer is emailed" + (" with your note." if note else "."),
        }

    async def run(db: AsyncSession, params: dict, admin_user_id: str | None) -> str:
        from app.api.v1.gang_sheets import StatusIn, admin_set_status

        job = await _find_job(db, params)
        note = str(params.get("note") or "").strip() or None
        await admin_set_status(job.id, StatusIn(status=new_status, supplier_notes=note), None, db)
        return f"{job.reference} is now {new_status.replace('_', ' ')}."

    return preview, run


# ── Wholesale applications ───────────────────────────────────────────────────

async def _approve_preview(db: AsyncSession, params: dict) -> dict:
    from app.models.wholesale import WholesaleApplication

    name = str(params.get("company_name") or "").strip()
    if not name:
        raise ActionError("Which application? Give the company name.")
    app = (await db.execute(
        select(WholesaleApplication).where(
            WholesaleApplication.company_name.ilike(f"%{name}%"),
            WholesaleApplication.status == "pending",
        )
    )).scalars().first()
    if not app:
        raise ActionError(f"No pending application matching “{name}”.")
    return {
        "summary": f"Approve the wholesale account for {app.company_name}.",
        "target": "/admin/customers/applications",
        "note": "They get a company account and can order at wholesale prices. "
                "Set their pricing tier afterwards on the customer's page.",
        "_application_id": str(app.id),
    }


async def _approve_run(db: AsyncSession, params: dict, admin_user_id: str | None) -> str:
    from app.schemas.wholesale import ApproveApplicationRequest
    from app.services.wholesale_service import WholesaleService

    preview = await _approve_preview(db, params)
    if not admin_user_id:
        raise ActionError("Couldn't tell who is approving this. Please use the Applications screen.")
    company = await WholesaleService(db).approve(
        application_id=uuid.UUID(preview["_application_id"]),
        data=ApproveApplicationRequest(),
        admin_user_id=uuid.UUID(str(admin_user_id)),
    )
    return f"{company.name} is approved and can now order at wholesale prices."


# ── Registry ─────────────────────────────────────────────────────────────────

Preview = Callable[[AsyncSession, dict], Awaitable[dict]]
Run = Callable[[AsyncSession, dict, Any], Awaitable[str]]

_order_confirm = _order_status_action("confirmed", "confirm", ("pending",))
_order_processing = _order_status_action("processing", "move to processing", ("pending", "confirmed"))
_order_shipped = _order_status_action("shipped", "mark shipped", ("confirmed", "processing", "ready_for_pickup"))
_job_approve = _job_status_action("approved", "approve", ("in_review",))
_job_production = _job_status_action("production", "send to production", ("approved",))
_job_complete = _job_status_action("completed", "complete", ("production",))
_job_revision = _job_status_action("revision_requested", "request a revision on", ("in_review", "approved"), needs_note=True)

ACTIONS: dict[str, dict] = {
    "order_confirm": {
        "what": "Confirm a pending order",
        "params": {"order_number": {"type": "string"}},
        "required": ["order_number"],
        "preview": _order_confirm[0], "run": _order_confirm[1],
    },
    "order_processing": {
        "what": "Move an order into processing",
        "params": {"order_number": {"type": "string"}},
        "required": ["order_number"],
        "preview": _order_processing[0], "run": _order_processing[1],
    },
    "order_shipped": {
        "what": "Mark an order shipped, optionally with a tracking number and carrier",
        "params": {
            "order_number": {"type": "string"},
            "tracking_number": {"type": "string"},
            "carrier": {"type": "string"},
        },
        "required": ["order_number"],
        "preview": _order_shipped[0], "run": _order_shipped[1],
    },
    "printjob_approve": {
        "what": "Approve a print job that is in review",
        "params": {"reference": {"type": "string"}},
        "required": ["reference"],
        "preview": _job_approve[0], "run": _job_approve[1],
    },
    "printjob_request_revision": {
        "what": "Send a print job back to the customer with a note saying what to fix",
        "params": {"reference": {"type": "string"}, "note": {"type": "string"}},
        "required": ["reference", "note"],
        "preview": _job_revision[0], "run": _job_revision[1],
    },
    "printjob_production": {
        "what": "Send an approved print job to production",
        "params": {"reference": {"type": "string"}},
        "required": ["reference"],
        "preview": _job_production[0], "run": _job_production[1],
    },
    "printjob_complete": {
        "what": "Mark a print job complete",
        "params": {"reference": {"type": "string"}},
        "required": ["reference"],
        "preview": _job_complete[0], "run": _job_complete[1],
    },
    "application_approve": {
        "what": "Approve a pending wholesale account application",
        "params": {"company_name": {"type": "string"}},
        "required": ["company_name"],
        "preview": _approve_preview, "run": _approve_run,
    },
}

INDEX = "\n".join(f"- {name}: {spec['what']} (needs: {', '.join(spec['required'])})"
                  for name, spec in ACTIONS.items())


async def preview_action(db: AsyncSession, name: str, params: dict) -> dict:
    spec = ACTIONS.get(name)
    if not spec:
        raise ActionError(f"'{name}' isn't something I can do.")
    missing = [p for p in spec["required"] if not str(params.get(p) or "").strip()]
    if missing:
        raise ActionError(f"Missing: {', '.join(missing)}.")
    out = await spec["preview"](db, params)
    return {k: v for k, v in out.items() if not k.startswith("_")}


async def run_action(db: AsyncSession, name: str, params: dict, admin_user_id: str | None) -> str:
    spec = ACTIONS.get(name)
    if not spec:
        raise ActionError(f"'{name}' isn't something I can do.")
    missing = [p for p in spec["required"] if not str(params.get(p) or "").strip()]
    if missing:
        raise ActionError(f"Missing: {', '.join(missing)}.")
    return await spec["run"](db, params, admin_user_id)
