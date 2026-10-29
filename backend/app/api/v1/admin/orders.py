"""Admin — order management and RMA."""
import asyncio
import csv
import io
import json as _json
import logging
from datetime import date, datetime, timezone
from uuid import UUID

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.models.company import Company
from app.models.order import Order, OrderItem
from app.models.user import User
from app.models.rma import RMAItem, RMARequest
from app.schemas.order import (
    AdminOrderDetail,
    AdminOrderListItem,
    CancelOrderRequest,
    DraftOrderCreate,
    DraftUpdate,
    OrderItemOut,
    OrderStatusUpdate,
    OrderUpdateRequest,
    RMACreate,
    RMAOut,
    RMAUpdateRequest,
    SendInvoicePayload,
)
from app.services import attribution, order_events
from app.types.api import PaginatedResponse

router = APIRouter(prefix="/admin", tags=["admin-orders"])


def _af_email(content_html: str) -> str:
    """Prepared content in the design's card, in the sending shop's name and
    logo (services/mail_layout.frame). It used to put the platform's LOGO_URL
    on every shop's mail."""
    from app.services.mail_layout import frame

    return frame(content_html)


# ---------------------------------------------------------------------------
# Email helper
# ---------------------------------------------------------------------------

async def _send_order_status_email(order: Order, new_status: str, db: AsyncSession) -> None:
    """Tell the customer their order moved on (services/mails): shipped, ready
    for pickup and refunded as the design draws them, every other status in
    the same card. Guest and company orders alike.

    Shipped, ready for pickup and refunded are three of the shop's
    Notifications (Settings): its own switch, subject and opening lines.
    """
    import logging as _log_mod
    _log = _log_mod.getLogger(__name__)
    try:
        from app.core.config import settings as _settings
        from app.services import mails
        from app.services import notifications as _notes
        from app.services.email_service import EmailService

        _LABEL = {
            "pending": "Received", "confirmed": "Confirmed",
            "processing": "Processing", "ready_for_pickup": "Ready for pickup",
            "shipped": "Shipped", "delivered": "Delivered",
            "cancelled": "Cancelled", "refunded": "Refunded",
        }
        label = _LABEL.get(new_status, new_status.replace("_", " ").capitalize())
        note_key = {"shipped": "order_shipped", "ready_for_pickup": "ready_for_pickup",
                    "refunded": "refund_issued"}.get(new_status)

        # Who to tell, and where their order opens: a guest's order page by its
        # view key (in the #fragment, which no server or log sees), a company's
        # in its account.
        if order.is_guest_order and order.guest_email:
            from app.services import order_view

            to_email = order.guest_email
            first = ((order.guest_name or "").split() or ["there"])[0]
            order_url = (f"{_settings.FRONTEND_URL}/checkout/thank-you/{order.order_number}"
                         f"#k={order_view.view_key(order.id, order.tenant_id)}")
        else:
            from sqlalchemy import select as _select

            from app.models.company import CompanyUser as _CompanyUser
            from app.models.user import User as _User

            user = (await db.execute(
                _select(_User)
                .join(_CompanyUser, _CompanyUser.user_id == _User.id)
                .where(_CompanyUser.company_id == order.company_id, _CompanyUser.is_active == True)  # noqa: E712
                .limit(1)
            )).scalar_one_or_none()
            if not user:
                return
            to_email = user.email
            first = user.first_name or "there"
            order_url = f"{_settings.FRONTEND_URL}/account/orders/{order.id}"

        w = (await _notes.wording(db, note_key, {
            "order": order.order_number, "customer": first,
            "total": f"${float(order.total or 0):.2f}", "tracking": order.tracking_number or "",
        }) if note_key else _notes.Wording(True, None, None))
        if not w.send:
            return

        # Shipped and delivered point at the shop's tracking page (every parcel, one place).
        track_url = None
        if new_status in ("shipped", "delivered"):
            from app.services import tracking_page as _tracking_page

            track_url = await _tracking_page.link(db, order)

        if new_status == "shipped":
            subject, html = mails.order_shipped(order, order_url=order_url, subject=w.subject, intro_html=w.intro_html,
                                                track_url=track_url)
        elif new_status == "ready_for_pickup":
            # The place and the hours: the brand's own pickup location (Admin →
            # Shipping), never another shop's.
            from app.services.pickup import pickup_location

            subject, html = mails.ready_for_pickup(
                order, order_url=order_url, pickup=await pickup_location(db, order.tenant_id),
                subject=w.subject, intro_html=w.intro_html)
        elif new_status == "refunded":
            subject, html = mails.refund_issued(order, order_url=order_url, subject=w.subject, intro_html=w.intro_html)
        else:
            subject, html = mails.order_update(order, status=new_status, label=label, order_url=order_url,
                                               track_url=track_url)
        EmailService(db).send_raw(to_email=to_email, subject=subject, body_html=html)

    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Order status email failed: %s", exc)


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------

# Which stored event a status change really is. A status says where an order
# is; the event says when it got there, so the two are not the same thing.
_EVENT_FOR_STATUS: dict[str, str] = {
    "confirmed": "order_confirmed",
    "processing": "processing_started",
    "ready_for_pickup": "ready_for_pickup",
    "shipped": "shipped",
    "delivered": "delivered",
    "cancelled": "cancelled",
    "refunded": "refund_issued",
}

_RMA_EVENT: dict[str, str] = {
    "approved": "return_approved",
    "rejected": "return_rejected",
    "completed": "return_completed",
    "pending": "return_requested",
}


async def _record_label_events(db, request, order, result: dict) -> None:
    """Buying a label is two things happening: a label bought, and a parcel
    handed over. The timeline shows both, because a brand chasing a parcel
    wants the shipped time, and a brand chasing a charge wants the purchase."""
    carrier = result.get("carrier") or "Carrier"
    service = result.get("service") or ""
    tracking = result.get("tracking_number")
    own_account = result.get("source") == "carrier"

    await order_events.record_admin(
        db, request, order, "label_purchased",
        f"{carrier} label bought on your own account ({service})" if own_account
        else f"Shippo label generated via {carrier} {service}".rstrip(),
        meta={"carrier": carrier, "service": service, "tracking_number": tracking,
              "cost": result.get("cost"), "source": result.get("source")},
    )
    await order_events.record_admin(
        db, request, order, "shipped",
        f"Shipped via {carrier} {service}".rstrip()
        + (f" — tracking {tracking}" if tracking else ""),
        meta={"carrier": carrier, "service": service, "tracking_number": tracking},
    )


@router.post("/orders/draft", status_code=201)
async def create_draft_order(
    payload: DraftOrderCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create an empty draft (pending) order for admin to fill in.

    `request` is here because the event this writes records who did it. It was
    referenced without being a parameter, so every draft order raised a
    NameError and came back as a 500 — the feature did not work at all.
    """
    from uuid import UUID as _UUID
    from app.models.company import Company as _Company, CompanyUser as _CompanyUser
    import json as _json
    import string, random

    # An account, or a guest by name and email (the New order wizard's
    # "Choose guest"; a guest order has no company and no user, as at guest
    # checkout).
    company_id = _UUID(str(payload.company_id)) if payload.company_id else None
    member = None
    if company_id is not None:
        company = (await db.execute(select(_Company).where(_Company.id == company_id))).scalar_one_or_none()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")
        # Who it is placed for. An account the shop added without an email has
        # nobody signing in for it yet: the order is still its own, and its
        # invoice goes to the company's email.
        member = (await db.execute(
            select(_CompanyUser).where(_CompanyUser.company_id == company_id, _CompanyUser.is_active == True)
            .limit(1)
        )).scalar_one_or_none()
    else:
        guest_email = (payload.guest_email or "").strip().lower()
        if not guest_email or "@" not in guest_email or not (payload.guest_name or "").strip():
            raise HTTPException(status_code=422, detail="Choose a customer, or give the guest a name and an email address.")

    method = "will_call" if (payload.shipping_method or "") == "will_call" else "standard"
    if method == "will_call":
        from app.services.pickup import PICKUP_OFF, pickup_offered

        if not await pickup_offered(db, getattr(request.state, "tenant_id", None)):
            raise HTTPException(status_code=422, detail=PICKUP_OFF)

    # Generate order number
    suffix = "".join(random.choices(string.digits, k=6))
    order_number = f"DRAFT-{suffix}"

    order = Order(
        company_id=company_id,
        placed_by_id=member.user_id if member else None,
        is_guest_order=company_id is None,
        guest_name=None if company_id else (payload.guest_name or "").strip(),
        guest_email=None if company_id else (payload.guest_email or "").strip().lower(),
        guest_phone=None if company_id else (payload.guest_phone or "").strip() or None,
        order_number=order_number,
        status="pending",
        payment_status="unpaid",
        po_number=payload.po_number,
        notes=payload.notes,
        shipping_method=method,
        shipping_address_snapshot=(
            _json.dumps(payload.shipping_address.model_dump()) if payload.shipping_address and method != "will_call" else None
        ),
        subtotal=0,
        shipping_cost=0,
        tax_amount=0,
        total=0,
    )
    db.add(order)
    await db.flush()
    meta = {"channel": "admin_draft", "company_id": str(company_id) if company_id else None,
            "guest": company_id is None}
    if payload.quote_request_id:
        # The quote request it prices: answered now, and no longer waiting
        # for a price on the Quotes screen (services/quotes).
        from sqlalchemy import text as _qt

        answered = await db.execute(_qt(
            "UPDATE contact_submissions SET answered_at = COALESCE(answered_at, now()), is_read = true "
            "WHERE id = CAST(:id AS uuid) AND tenant_id = CAST(:t AS uuid)"
        ), {"id": str(_UUID(payload.quote_request_id)), "t": str(getattr(request.state, "tenant_id", ""))})
        if answered.rowcount:
            meta["quote_request_id"] = payload.quote_request_id
    await order_events.record_admin(
        db, request, order,
        "order_created", f"Draft order {order.order_number} created",
        meta=meta,
    )
    await db.commit()
    await db.refresh(order)
    return {"id": str(order.id), "order_number": order.order_number}


def _filtered_orders(
    *, q: str | None = None, status: str | None = None, payment_status: str | None = None,
    company_id: str | None = None, guest_only: bool = False, utm_source: str | None = None,
    utm_campaign: str | None = None, drafts_only: bool = False, queue: str | None = None,
    payment: str | None = None, method: str | None = None,
    date_from: date | None = None, date_to: date | None = None,
):
    """The order list's filters, in one place.

    The list and its CSV export both read this, so "Export" hands over the
    rows that are on the screen and not some other set.
    """
    # LEFT JOIN so guest orders (company_id=NULL) are included. It has to be
    # the ORM .outerjoin(): with the core outerjoin() the brand filter on
    # Company lands in WHERE and silently drops every guest order.
    query = select(Order, Company.name.label("company_name")).outerjoin(
        Company, Order.company_id == Company.id
    )
    # Drafts are identified by their number. Filtering here rather than in the
    # browser means the draft list pages properly: it used to fetch one page of
    # pending orders and sift it client-side, so a store with more pending orders
    # than that page simply stopped showing its own drafts.
    if drafts_only:
        query = query.where(Order.order_number.like("DRAFT-%"))

    if q and q.strip():
        like = f"%{q.strip()}%"
        # The number, the PO, or who it is for: the company, or a guest's name
        # or email.
        query = query.where(
            Order.order_number.ilike(like) | Order.po_number.ilike(like)
            | Order.guest_email.ilike(like) | Order.guest_name.ilike(like)
            | Company.name.ilike(like)
        )
    if status:
        query = query.where(Order.status == status)
    if payment_status:
        query = query.where(Order.payment_status == payment_status)
    # The list's own Payment filter. "unpaid" is everything not settled (unpaid,
    # pending, part paid), which is what somebody chasing money means by it.
    if payment == "paid":
        query = query.where(Order.payment_status == "paid")
    elif payment == "unpaid":
        query = query.where(Order.payment_status.notin_(("paid", "refunded")))
    elif payment == "refunded":
        query = query.where(Order.payment_status == "refunded")
    if method == "pickup":
        query = query.where(Order.shipping_method == "will_call")
    elif method == "ship":
        query = query.where(func.coalesce(Order.shipping_method, "") != "will_call")
    if queue:
        # The slice Home counted, from the same definition, so the button
        # beside "3 paid orders to ship" opens those three.
        from app.services import order_queues

        wanted = order_queues.conditions(queue.strip())
        if wanted is None:
            raise HTTPException(status_code=400, detail=f"There is no order queue called '{queue}'.")
        query = query.where(*wanted)
    if company_id:
        query = query.where(Order.company_id == company_id)
    if guest_only:
        query = query.where(Order.is_guest_order == True)  # noqa: E712
    # "Show me what that campaign brought in": the question a brand running
    # ads actually asks of this list.
    if utm_source:
        query = query.where(func.lower(Order.utm_source) == utm_source.strip().lower())
    if utm_campaign:
        query = query.where(Order.utm_campaign == utm_campaign.strip())
    if date_from:
        query = query.where(Order.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.where(Order.created_at <= datetime.combine(date_to, datetime.max.time()))
    return query


@router.get("/orders", response_model=PaginatedResponse[AdminOrderListItem])
async def list_admin_orders(
    q: str | None = None,
    status: str | None = None,
    payment_status: str | None = None,
    company_id: str | None = None,
    guest_only: bool = Query(False, description="Show only guest orders"),
    utm_source: str | None = Query(None, description="Only orders from this traffic source"),
    utm_campaign: str | None = Query(None, description="Only orders from this campaign"),
    drafts_only: bool = Query(False, description="Show only draft orders (DRAFT-…)"),
    queue: str | None = Query(None, description="A named slice of the list, e.g. to_ship (services/order_queues)"),
    payment: str | None = Query(None, description="paid, unpaid (anything not settled) or refunded"),
    method: str | None = Query(None, description="ship or pickup"),
    date_from: date | None = Query(None, description="Filter orders created on or after this date"),
    date_to: date | None = Query(None, description="Filter orders created on or before this date"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    query = _filtered_orders(
        q=q, status=status, payment_status=payment_status, company_id=company_id, guest_only=guest_only,
        utm_source=utm_source, utm_campaign=utm_campaign, drafts_only=drafts_only, queue=queue,
        payment=payment, method=method, date_from=date_from, date_to=date_to,
    )

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar_one()

    result = await db.execute(
        query.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    rows = result.all()

    try:
        from app.services.suppliers.orders import order_supplier_summary
        _supplier = await order_supplier_summary(db, [r[0].id for r in rows])
    except Exception:
        _supplier = {}

    # How many lines each order has, in one query and not one per row.
    _ids = [r[0].id for r in rows]
    _counts = dict((await db.execute(
        select(OrderItem.order_id, func.count(OrderItem.id))
        .where(OrderItem.order_id.in_(_ids)).group_by(OrderItem.order_id)
    )).all()) if _ids else {}
    # Where each one stands: paid, artwork, fulfilment, what is next.
    from app.services import order_progress as _progress

    _facts = await _progress.facts_for(db, [r[0] for r in rows])
    # What each weighs, for the ship queue, in one query: the variants'
    # weights, or half a pound a unit when none is recorded (_order_weight_lbs).
    _weigh: dict = {}
    if _ids:
        from app.models.product import ProductVariant as _PV

        for _oid, _qty, _grams in (await db.execute(
            select(OrderItem.order_id, OrderItem.quantity, _PV.weight_grams)
            .outerjoin(_PV, _PV.id == OrderItem.variant_id)
            .where(OrderItem.order_id.in_(_ids))
        )).all():
            _w = _weigh.setdefault(_oid, [0.0, 0])
            _w[0] += float(_grams or 0) * (_qty or 0)
            _w[1] += int(_qty or 0)

    def _lbs(oid) -> float | None:
        grams, units = _weigh.get(oid, [0.0, 0])
        if grams > 0:
            return max(round(grams / 453.592, 2), 0.5)
        return max(round(units * 0.5, 2), 0.5) if units else None

    items = []
    for row in rows:
        order, company_name = row
        item_count = _counts.get(order.id, 0)
        items.append(AdminOrderListItem(
            id=order.id,
            order_number=order.order_number,
            company_name=company_name,
            status=order.status,
            payment_status=order.payment_status,
            po_number=order.po_number,
            total=order.total,
            item_count=item_count,
            created_at=order.created_at,
            tracking_number=order.tracking_number,
            courier=order.courier,
            courier_service=order.courier_service,
            shipped_at=order.shipped_at,
            is_guest_order=order.is_guest_order,
            guest_email=order.guest_email,
            guest_name=order.guest_name,
            timeline=order.timeline or [],
            supplier=_supplier.get(order.id),
            attribution=attribution.summary(order),
            shipping_method=order.shipping_method,
            shipping_cost=order.shipping_cost,
            carrier=order.carrier,
            tracking_url=order.tracking_url,
            label_url=order.label_url,
            progress=_progress.summary(_facts[order.id]),
            weight_lbs=_lbs(order.id),
        ))

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size, pages=(total + page_size - 1) // page_size)


@router.get("/orders/export-csv")
async def export_orders_csv(
    q: str | None = None,
    status: str | None = None,
    payment: str | None = None,
    method: str | None = None,
    queue: str | None = None,
    drafts_only: bool = False,
    company_id: str | None = None,
    utm_source: str | None = None,
    utm_campaign: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    # The list's own filters, so the file holds the rows that are on the
    # screen. It used to take the search and the status and drop the rest.
    query = _filtered_orders(
        q=q, status=status, payment=payment, method=method, queue=queue, drafts_only=drafts_only,
        company_id=company_id, utm_source=utm_source, utm_campaign=utm_campaign,
        date_from=date_from, date_to=date_to,
    )
    result = await db.execute(query.order_by(Order.created_at.desc()))
    rows = result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Order #", "Company / Guest", "Status", "Payment", "PO Number", "Total", "Created",
        "Source", "Medium", "Campaign", "Term", "Content", "Landing page", "Referrer",
    ])
    for row in rows:
        order, company_name = row
        display_name = company_name or (f"Guest: {order.guest_email}" if order.is_guest_order else "Unknown")
        _attr = getattr(order, "attribution", None) or {}
        writer.writerow([
            order.order_number, display_name, order.status, order.payment_status,
            order.po_number or "", str(order.total), order.created_at.isoformat(),
            order.utm_source or "", order.utm_medium or "", order.utm_campaign or "",
            order.utm_term or "", order.utm_content or "",
            _attr.get("landing_page", ""), _attr.get("referrer", ""),
        ])
    # Email the admin who triggered the export
    try:
        from app.models.user import User as _ExportUser
        from app.services.email_service import EmailService as _ExportEmailSvc
        from app.core.config import settings as _exp_settings
        admin_user_id = getattr(request.state, "user_id", None) if request else None
        if admin_user_id:
            admin = (await db.execute(select(_ExportUser).where(_ExportUser.id == admin_user_id))).scalar_one_or_none()
            if admin and admin.email:
                filter_desc = f"status={status}" if status else "all statuses"
                if q:
                    filter_desc += f', search=&ldquo;{q}&rdquo;'
                _ExportEmailSvc(db).send_raw(
                    to_email=admin.email,
                    subject="Your orders export is ready",
                    body_html=_af_email(
                        f'<h2 style="color:#2A2830;margin:0 0 12px">Export Complete</h2>'
                        f'<p>Hi {admin.first_name or "there"},</p>'
                        f'<p>Your orders CSV export has been generated successfully.</p>'
                        f'<div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0">'
                        f'<p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em">Rows Exported</p>'
                        f'<p style="margin:4px 0 0;font-weight:800;font-size:24px;color:#2A2830">{len(rows)}</p>'
                        f'<p style="margin:12px 0 0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em">Filters</p>'
                        f'<p style="margin:4px 0 0;font-size:13px;color:#2A2830">{filter_desc}</p>'
                        f'</div>'
                        f'<p style="color:#6b7280;font-size:13px">The file was downloaded directly to your browser.</p>'
                    ),
                )
    except Exception:
        pass

    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders.csv"},
    )


@router.get("/orders/overview")
async def orders_overview(db: AsyncSession = Depends(get_db)) -> dict:
    """What the order list's tabs count, and which carriers a label can be bought from.

    Each count is taken from the queue its tab lists (services/order_queues),
    so a tab's number is the number of rows under it.
    """
    from app.core.tenant_context import get_current_tenant_id
    from app.services import order_queues
    from app.services.admin_home import carrier_names

    tabs: dict[str, int] = {}
    for name in ("all", "new", "to_ship", "ready_for_pickup", "sent"):
        try:
            tabs[name] = await order_queues.count(db, name)
        except Exception as exc:  # one tab that cannot be counted must not blank the others
            logger.warning("orders overview: %s could not be counted: %s", name, exc)
            tabs[name] = 0
            await db.rollback()

    async def _count(stmt) -> int:
        try:
            return int((await db.execute(stmt)).scalar_one() or 0)
        except Exception as exc:
            logger.warning("orders overview: a count failed: %s", exc)
            await db.rollback()
            return 0

    # The drafts the Drafts tab lists: still pending (a confirmed one is an order).
    tabs["drafts"] = await _count(select(func.count(Order.id)).where(Order.order_number.like("DRAFT-%"),
                                                                      Order.status == "pending"))
    tabs["returns"] = await _count(select(func.count(RMARequest.id)).where(RMARequest.status == "pending"))
    # Quotes waiting on the shop: requests to price, and quotes accepted to convert.
    try:
        from app.services import quotes as _quotes

        _board = await _quotes.board(db, get_current_tenant_id())
        tabs["quotes"] = sum(1 for q in _board if q["status"] in ("needs_pricing", "accepted"))
    except Exception as exc:
        logger.warning("orders overview: quotes could not be counted: %s", exc)
        tabs["quotes"] = 0
        await db.rollback()

    try:
        carriers = await carrier_names(db, get_current_tenant_id())
    except Exception as exc:
        logger.warning("orders overview: carriers unreadable: %s", exc)
        carriers = []
        await db.rollback()
    return {"tabs": tabs, "carriers": carriers}


class _SavedView(BaseModel):
    id: str = Field(..., min_length=1, max_length=40)
    name: str = Field(..., min_length=1, max_length=60)
    # The list's own address parameters: tab, q, payment, method, from, to.
    params: dict[str, str] = {}


class _SavedViews(BaseModel):
    views: list[_SavedView] = Field(default_factory=list, max_length=20)


@router.get("/orders/views")
async def get_order_views(db: AsyncSession = Depends(get_db)) -> dict:
    """The filters this shop has saved on its order list, shared by its staff."""
    from app.core.tenant_settings import get_setting

    raw = await get_setting(db, "order_views")
    try:
        views = _json.loads(raw) if raw else []
    except Exception:
        views = []
    return {"views": views if isinstance(views, list) else []}


@router.put("/orders/views")
async def save_order_views(payload: _SavedViews, db: AsyncSession = Depends(get_db)) -> dict:
    from app.core.tenant_settings import set_setting

    views = [v.model_dump() for v in payload.views]
    await set_setting(db, "order_views", _json.dumps(views))
    await db.commit()
    return {"views": views}


@router.get("/orders/{order_id}", response_model=AdminOrderDetail)
async def get_admin_order(order_id: str, db: AsyncSession = Depends(get_db)):
    import uuid as _uuid

    # Resolve by order_number for prefixed ("AF-...", "DRAFT-...") and numeric ("1008")
    # formats; fall back to UUID only when the value looks like one.
    upper = order_id.upper()
    if upper.startswith("AF-") or upper.startswith("DRAFT-"):
        where_clause = Order.order_number == upper
    elif order_id.isdigit():
        where_clause = Order.order_number == order_id
    else:
        try:
            where_clause = Order.id == _uuid.UUID(order_id)
        except ValueError:
            raise NotFoundError(f"Order {order_id} not found")

    result = await db.execute(
        select(Order, Company.name.label("company_name"))
        # ORM outerjoin, not the core outerjoin(): the tenant filter on Company
        # then goes into ON, so orders with no company (guests) still match.
        .outerjoin(Company, Order.company_id == Company.id)
        .where(where_clause)
    )
    row = result.one_or_none()
    if not row:
        raise NotFoundError(f"Order {order_id} not found")
    order, company_name = row

    # In the order they were added, so a line does not jump when another changes.
    items_result = await db.execute(
        select(OrderItem).where(OrderItem.order_id == order.id).order_by(OrderItem.created_at, OrderItem.id)
    )
    items = items_result.scalars().all()

    # Calculate shipment weight from variant weights (used to pre-fill Shippo label weight)
    _GRAMS_PER_LB = 453.592
    _DEFAULT_LBS_PER_UNIT = 0.5  # standard apparel blank fallback
    try:
        from app.models.product import ProductVariant as _PV
        variant_ids = [str(item.variant_id) for item in items if item.variant_id]
        variant_weight_g: dict[str, float] = {}
        if variant_ids:
            _vr = await db.execute(
                select(_PV.id, _PV.weight_grams).where(_PV.id.in_(variant_ids))
            )
            for _vid, _wg in _vr.all():
                if _wg:
                    variant_weight_g[str(_vid)] = float(_wg)

        total_grams = 0.0
        total_qty = sum(item.quantity for item in items)
        has_variant_weights = False
        for item in items:
            _vid_s = str(item.variant_id) if item.variant_id else None
            if _vid_s and _vid_s in variant_weight_g:
                total_grams += variant_weight_g[_vid_s] * item.quantity
                has_variant_weights = True

        if has_variant_weights and total_grams > 0:
            calculated_weight_lbs = max(round(total_grams / _GRAMS_PER_LB, 2), 0.5)
        else:
            calculated_weight_lbs = max(round(total_qty * _DEFAULT_LBS_PER_UNIT, 2), 0.5)
    except Exception:
        calculated_weight_lbs = 1.0

    # Enrich with customer contact — from placing user or guest fields
    customer_name: str | None = order.guest_name if order.is_guest_order else None
    customer_email: str | None = order.guest_email if order.is_guest_order else None
    customer_phone: str | None = order.guest_phone if order.is_guest_order else None
    if not order.is_guest_order and order.placed_by_id:
        try:
            user_result = await db.execute(select(User).where(User.id == order.placed_by_id))
            user = user_result.scalar_one_or_none()
            if user:
                customer_name = f"{user.first_name} {user.last_name}".strip() or None
                customer_email = user.email
                customer_phone = user.phone
        except Exception:
            pass

    # Parse shipping address snapshot
    shipping_address: dict | None = None
    if order.shipping_address_snapshot:
        try:
            raw = _json.loads(order.shipping_address_snapshot)
            shipping_address = {
                "full_name": raw.get("full_name") or raw.get("label"),
                "address_line1": raw.get("address_line1") or raw.get("line1"),
                "address_line2": raw.get("address_line2") or raw.get("line2"),
                "city": raw.get("city"),
                "state": raw.get("state"),
                "postal_code": raw.get("postal_code"),
                "zip_code": raw.get("postal_code"),
                "country": raw.get("country"),
            }
        except Exception:
            pass

    try:
        from app.services.suppliers.orders import order_supplier_summary
        _supplier_detail = (await order_supplier_summary(db, [order.id])).get(order.id)
    except Exception:
        _supplier_detail = None

    _events_rows = await order_events.for_order(db, order.id)

    from app.services import refund_service as _refunds
    from app.services.dispute_service import DisputeService as _Disputes

    _refund_rows = await _refunds.refunds_for_order(db, order.id)
    # Gift cards: what they paid here, and the cards this order sold. In a
    # savepoint: the order opens even if this cannot be read.
    _gift_pay, _gift_sold = None, []
    try:
        from app.services import gift_card_checkout as _gcc

        async with db.begin_nested():
            _gift_pay = await _gcc.order_payments(db, order.id)
            _gift_sold = [{
                "id": str(c.id), "last4": c.code_last4, "amount": float(c.initial_amount),
                "balance": float(c.balance), "status": c.status, "recipient_email": c.recipient_email,
                "recipient_name": c.recipient_name,
                "delivered_at": c.delivered_at.isoformat() if c.delivered_at else None,
            } for c in await _gcc.sold_on_order(db, order.id)]
    except Exception:
        logger.warning("Could not read gift cards for order %s", order.id, exc_info=True)
    _remaining = (await _refunds.remaining_refundable(db, order.id)
                  if order.stripe_payment_intent_id or (_gift_pay or {}).get("cards") else None)
    _dispute_rows = [
        {k: (v.isoformat() if hasattr(v, "isoformat") else (float(v) if k == "amount" and v is not None else v))
         for k, v in d.items()}
        for d in await _Disputes(db).for_order(order.id)
    ]

    # What the total is made of: every discount with its code, the tax with
    # where and at what rate. The page showed subtotal, tax and a total that
    # did not meet, and nothing to say a discount came between them.
    from app.services import order_money as _money

    _discounts = await _money.discount_lines(db, order)

    # A gang sheet line carries what production prints from — see
    # gang_sheets.production_details, and _attach_sheets for how each sheet
    # finds its line. In a savepoint: if it fails, the order still opens.
    _item_rows = [OrderItemOut.model_validate(i) for i in items]
    try:
        from app.api.v1.gang_sheets import production_details as _production

        async with db.begin_nested():
            _sheets = await _production(db, order.id)
        _item_rows = _attach_sheets(_item_rows, _sheets)
    except Exception:
        logger.warning("Could not load gang sheet details for order %s", order.id, exc_info=True)

    from app.services import order_progress as _progress

    _f = (await _progress.facts_for(db, [order]))[order.id]
    _progress_out = {**_progress.summary(_f), "steps": _progress.steps(_f)}
    try:
        from app.core.tenant_context import get_current_tenant_id as _tid_now
        from app.services.admin_home import carrier_names as _carrier_names

        async with db.begin_nested():
            _carriers_on = await _carrier_names(db, _tid_now())
    except Exception:
        _carriers_on = []

    # "This is their 3rd order": the buyer's orders up to this one, drafts aside.
    try:
        async with db.begin_nested():
            _nth = await _buyer_order_count(db, order)
    except Exception:
        logger.warning("Could not count the buyer's orders for %s", order.id, exc_info=True)
        _nth = None

    try:
        return AdminOrderDetail(
            supplier=_supplier_detail,
            progress=_progress_out,
            carriers=_carriers_on,
            id=order.id,
            order_number=order.order_number,
            status=order.status,
            payment_status=order.payment_status,
            po_number=order.po_number,
            order_notes=order.notes,
            subtotal=order.subtotal,
            shipping_cost=order.shipping_cost,
            tax_amount=order.tax_amount,
            total=order.total,
            company_id=order.company_id,
            company_name=company_name,
            tracking_number=order.tracking_number,
            tracking_url=getattr(order, "tracking_url", None),
            label_url=getattr(order, "label_url", None),
            carrier=getattr(order, "carrier", None),
            shipping_rate_id=getattr(order, "shipping_rate_id", None),
            shipping_method=getattr(order, "shipping_method", None),
            courier=order.courier,
            courier_service=order.courier_service,
            shipped_at=order.shipped_at,
            created_at=order.created_at,
            updated_at=order.updated_at,
            items=_item_rows,
            tax_rate=getattr(order, "tax_rate", None),
            tax_region=getattr(order, "tax_region", None),
            tax_label=_money.tax_label(order),
            discounts=_discounts,
            customer_name=customer_name,
            customer_email=customer_email,
            customer_phone=customer_phone,
            shipping_address=shipping_address,
            is_guest_order=order.is_guest_order,
            guest_email=order.guest_email,
            guest_name=order.guest_name,
            guest_phone=order.guest_phone,
            payment_method=getattr(order, "payment_method", None),
            ach_bank_name=getattr(order, "ach_bank_name", None),
            ach_account_holder=getattr(order, "ach_account_holder", None),
            ach_account_last4=getattr(order, "ach_account_last4", None),
            ach_account_type=getattr(order, "ach_account_type", None),
            ach_verified=getattr(order, "ach_verified", None),
            payment_terms=getattr(order, "payment_terms", None),
            invoice_sent_at=getattr(order, "invoice_sent_at", None),
            marked_paid_at=getattr(order, "marked_paid_at", None),
            marked_paid_by=getattr(order, "marked_paid_by", None),
            amount_paid=order.amount_paid,
            balance_due=order.balance_due,
            is_fully_paid=order.is_fully_paid,
            timeline=order.timeline or [],
            events=_events_rows,
            attribution=attribution.summary(order),
            conversion=attribution.journey(order, order_count=_nth),
            amount_refunded=getattr(order, "amount_refunded", None),
            refundable_remaining=_remaining,
            refunds=_refund_rows,
            disputes=_dispute_rows,
            gift_card_payments=_gift_pay if (_gift_pay or {}).get("cards") else None,
            gift_cards_sold=_gift_sold,
            calculated_weight_lbs=calculated_weight_lbs,
            items_edited=bool(getattr(order, "items_edited", False)),
            convenience_fee=getattr(order, "convenience_fee", None),
        )
    except Exception as exc:
        logger.exception("get_admin_order serialization error for order %s: %s", order_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))


async def _buyer_order_count(db: AsyncSession, order: Order) -> int | None:
    """Which of the buyer's orders this is: the company's, the person's, or the
    guest email's orders placed up to and including it. None when the order
    names no buyer."""
    if order.company_id:
        same = Order.company_id == order.company_id
    elif order.placed_by_id:
        same = Order.placed_by_id == order.placed_by_id
    elif order.guest_email:
        same = func.lower(Order.guest_email) == order.guest_email.strip().lower()
    else:
        return None
    count = await db.scalar(
        select(func.count(Order.id)).where(
            same,
            Order.created_at <= order.created_at,
            ~Order.order_number.like("DRAFT-%"),
        )
    )
    return int(count or 0) or None


def _attach_sheets(items: list[OrderItemOut], sheets: list[dict]) -> list[OrderItemOut]:
    """Each gang sheet line with its sheet's production details.

    Most lines carry the sheet's reference in their name ("Gang Sheet
    GS-IH-2610-0018 — 22x10"). An Upload by size line is named for the design's
    size alone ("DTF Transfers by Size — 2"x1.33""), which is the sheet's own
    name. So a line finds its sheet by reference, then by name (one with the
    same quantity first), then takes whichever sheet is left, in order — an
    order with one sheet, the usual case, always finds it.
    """
    import re

    left = list(sheets)
    gang = [i for i in items if (i.sku or "").upper() == "GANG-SHEET"]
    found: dict[str, dict] = {}

    def by_reference(item: OrderItemOut, sheet: dict) -> bool:
        ref = sheet.get("reference") or ""
        # A whole reference: GS-2610-1000 is not GS-2610-10000.
        return bool(ref) and re.search(rf"(?<![\w-]){re.escape(ref)}(?![\w-])", item.product_name or "") is not None

    def by_name(item: OrderItemOut, sheet: dict) -> bool:
        return (item.product_name or "").strip().lower() == (sheet.get("sheet_name") or "").strip().lower()

    def by_name_and_quantity(item: OrderItemOut, sheet: dict) -> bool:
        return by_name(item, sheet) and item.quantity == sheet.get("quantity")

    for matches in (by_reference, by_name_and_quantity, by_name):
        for item in gang:
            if str(item.id) in found:
                continue
            sheet = next((s for s in left if matches(item, s)), None)
            if sheet is not None:
                found[str(item.id)] = sheet
                left.remove(sheet)
    for item in gang:
        if str(item.id) not in found and left:
            found[str(item.id)] = left.pop(0)
    return [i.model_copy(update={"gang_sheet": found[str(i.id)]}) if str(i.id) in found else i for i in items]


@router.get("/orders/{order_id}/events")
async def list_order_events(order_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """This order's history — what happened, when, and who did it.

    Every row was written by the code that performed the action, so the times
    are records rather than guesses. Newest first, which is how the order page
    reads it.
    """
    order = (await db.execute(select(Order.id).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")
    return {"events": await order_events.for_order(db, order_id)}


@router.post("/orders/{order_id}/verify-ach", status_code=200)
async def verify_ach_payment(order_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Mark an ACH order as payment verified (admin confirms bank transfer received)."""
    from sqlalchemy import text as _text
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")
    try:
        await db.execute(
            _text("UPDATE orders SET ach_verified=true, payment_status='paid' WHERE id=:oid"),
            {"oid": str(order_id)},
        )
        await db.commit()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"status": "verified", "order_id": str(order_id)}


@router.post("/orders/{order_id}/items", status_code=201)
async def add_order_item(
    order_id: UUID,
    payload: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Add a line item to a pending/draft order.

    A product sold by colour and size takes `variant_id`. One built from its
    options (a sign, a banner) takes `product_id` and `selections`, priced by
    the option engine as the storefront prices it. Without a `unit_price` the
    line is charged what this customer pays online: their tier and discount
    group, or the guest price (services/draft_orders.variant_price).
    """
    from uuid import UUID as _UUID
    from app.models.product import Product, ProductVariant
    from app.services import draft_orders

    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status in ("delivered", "cancelled", "refunded"):
        raise HTTPException(status_code=422, detail="Cannot add items to a completed or cancelled order")

    quantity = int(payload.get("quantity", 1) or 0)
    if quantity < 1:
        raise HTTPException(status_code=422, detail="Quantity has to be 1 or more.")

    variant_id_str = payload.get("variant_id")
    if variant_id_str:
        variant_id = _UUID(str(variant_id_str))
        variant = (await db.execute(
            select(ProductVariant).where(ProductVariant.id == variant_id)
        )).scalar_one_or_none()
        if not variant:
            raise HTTPException(status_code=404, detail="Product variant not found")
        product = (await db.execute(
            select(Product).where(Product.id == variant.product_id)
        )).scalar_one_or_none()
        given = payload.get("unit_price")
        unit_price = (float(draft_orders.money(given)) if given not in (None, "")
                      else float(await draft_orders.variant_price(db, order, variant)))
        line_total = round(unit_price * quantity, 2)
        item = OrderItem(
            order_id=order_id,
            variant_id=variant_id,
            product_id=variant.product_id,
            quantity=quantity,
            unit_price=unit_price,
            line_total=line_total,
            product_name=product.name if product else "Unknown",
            sku=variant.sku or "",
            color=variant.color,
            size=variant.size,
        )
    elif payload.get("product_id"):
        # Built from its options, as the cart builds a configured line
        # (cart_service.add_configured, order_service): unit price from the
        # option engine, plus its setup fees once.
        from app.services.configurator_service import ConfigurationError, price_configuration

        product = (await db.execute(
            select(Product).where(Product.id == _UUID(str(payload["product_id"])))
        )).scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        if (product.pricing_mode or "variant") != "configurable":
            raise HTTPException(status_code=422, detail="Choose a colour and size for this product.")
        selections = payload.get("selections") or {}
        try:
            priced = await price_configuration(db, product.id, selections, quantity)
        except ConfigurationError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        # Sold by its own quantity question: the answer is how many.
        if priced.get("quantity_from_option"):
            quantity = int(priced["quantity"])
        unit_price = float(priced["unit_price"])
        fees = float(priced.get("setup_fees") or 0)
        line_total = round(unit_price * quantity + fees, 2)
        chosen = " · ".join(f'{b["option"]}: {b["value"]}' for b in priced["breakdown"][:4])
        item = OrderItem(
            order_id=order_id,
            variant_id=None,
            product_id=product.id,
            quantity=quantity,
            unit_price=unit_price,
            line_total=line_total,
            product_name=f"{product.name}{' — ' + chosen if chosen else ''}"[:255],
            sku=(priced.get("sku_suffix") or "CONFIGURED")[:50],
            color=None,
            size=None,
            configuration={"selections": {str(k): v for k, v in selections.items()}, "breakdown": priced["breakdown"],
                           "unit_price": priced["unit_price"], "setup_fees": priced.get("setup_fees"),
                           "sku_suffix": priced.get("sku_suffix"),
                           "quantity_from_option": bool(priced.get("quantity_from_option")),
                           "rounding": priced.get("rounding") or 0},
        )
    else:
        raise HTTPException(status_code=422, detail="variant_id, or product_id with its choices, is required.")
    db.add(item)
    await db.flush()

    # Recalculate order totals: a draft afresh, tax included; a placed order
    # by adding the line, as before.
    if order.status == "pending":
        await draft_orders.reprice(db, order)
    else:
        order.subtotal = float(order.subtotal or 0) + line_total
        order.total = float(order.subtotal) + float(order.shipping_cost or 0) + float(order.tax_amount or 0)
    try:
        order.items_edited = True
    except Exception:
        pass

    await order_events.record_admin(
        db, request, order, "items_edited",
        f"Added {quantity} x {item.product_name}"
        + (f" ({item.sku})" if item.sku else "")
        + f" — order total now ${float(order.total):.2f}",
        meta={"action": "add", "sku": item.sku, "quantity": quantity,
              "line_total": round(line_total, 2), "order_total": float(order.total)},
    )
    await db.commit()
    return {"message": "Item added", "item_id": str(item.id), "subtotal": float(order.subtotal), "total": float(order.total)}


@router.delete("/orders/{order_id}/items/{item_id}", status_code=200)
async def remove_order_item(
    order_id: UUID,
    item_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Remove a line item from a pending/draft order."""
    item = (await db.execute(
        select(OrderItem).where(OrderItem.id == item_id, OrderItem.order_id == order_id)
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if order is not None and order.status == "pending":
        # A draft is worked out afresh, tax included (services/draft_orders).
        from app.services import draft_orders

        await db.delete(item)
        await db.flush()
        await draft_orders.reprice(db, order)
        await order_events.record_admin(
            db, request, order, "items_edited",
            f"Removed {item.quantity} x {item.product_name}"
            + (f" ({item.sku})" if item.sku else "")
            + f" — order total now ${float(order.total or 0):.2f}",
            meta={"action": "remove", "sku": item.sku, "quantity": item.quantity,
                  "line_total": float(item.line_total or 0), "order_total": float(order.total or 0)},
        )
        await db.commit()
        return {"message": "Item removed", "subtotal": float(order.subtotal or 0), "total": float(order.total or 0)}
    if order and order.status not in ("delivered", "cancelled", "refunded"):
        order.subtotal = max(0, float(order.subtotal or 0) - float(item.line_total or 0))
        order.total = float(order.subtotal) + float(order.shipping_cost or 0) + float(order.tax_amount or 0)
        try:
            order.items_edited = True
        except Exception:
            pass

    if order is not None:
        await order_events.record_admin(
            db, request, order, "items_edited",
            f"Removed {item.quantity} x {item.product_name}"
            + (f" ({item.sku})" if item.sku else "")
            + f" — order total now ${float(order.total or 0):.2f}",
            meta={"action": "remove", "sku": item.sku, "quantity": item.quantity,
                  "line_total": float(item.line_total or 0), "order_total": float(order.total or 0)},
        )
    await db.delete(item)
    await db.commit()
    return {"message": "Item removed"}


# ── The New order wizard (design 32) ─────────────────────────────────────────
# A phone or counter order: the draft is made at the first step, and these
# read and change it until it is placed (services/draft_orders).

async def _draft(db: AsyncSession, order_id: UUID) -> Order:
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.get("/orders/{order_id}/wizard", response_model=dict)
async def draft_wizard_state(order_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Everything the New order wizard shows for one draft."""
    from app.services import draft_orders

    return await draft_orders.wizard_state(db, await _draft(db, order_id))


@router.patch("/orders/{order_id}/draft", response_model=dict)
async def update_draft(
    order_id: UUID, payload: DraftUpdate, request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    """Delivery, shipping charge, PO number and note on a draft; totals and tax
    worked out again."""
    import json as _json
    from app.services import draft_orders

    order = await _draft(db, order_id)
    if order.status != "pending":
        raise HTTPException(status_code=409, detail="This order is already placed. Change it on its order page.")
    fields = payload.model_fields_set
    if "shipping_method" in fields and payload.shipping_method is not None:
        method = "will_call" if payload.shipping_method == "will_call" else "standard"
        if method == "will_call":
            from app.services.pickup import PICKUP_OFF, pickup_offered

            if not await pickup_offered(db, getattr(request.state, "tenant_id", None)):
                raise HTTPException(status_code=422, detail=PICKUP_OFF)
        order.shipping_method = method
    if "shipping_address" in fields:
        order.shipping_address_snapshot = (
            _json.dumps(payload.shipping_address.model_dump()) if payload.shipping_address else None
        )
    if "shipping_cost" in fields and payload.shipping_cost is not None:
        order.shipping_cost = draft_orders.money(payload.shipping_cost)
    if "po_number" in fields:
        order.po_number = (payload.po_number or "").strip() or None
    if "notes" in fields:
        order.notes = (payload.notes or "").strip() or None
    await draft_orders.reprice(db, order)
    await db.commit()
    return await draft_orders.wizard_state(db, order)


class PasteSkus(BaseModel):
    text: str = Field(..., max_length=20000)


@router.post("/orders/{order_id}/items/paste", response_model=dict)
async def paste_draft_skus(
    order_id: UUID, payload: PasteSkus, request: Request, db: AsyncSession = Depends(get_db),
) -> dict:
    """Lines of "SKU quantity" added at once, each at this customer's price.
    SKUs this shop does not have, and lines it cannot read, come back by name."""
    from sqlalchemy import func as _func
    from app.models.product import Product, ProductVariant
    from app.services import draft_orders

    order = await _draft(db, order_id)
    if order.status != "pending":
        raise HTTPException(status_code=409, detail="This order is already placed. Change it on its order page.")
    wanted = draft_orders.parse_skus(payload.text)
    if not wanted:
        raise HTTPException(status_code=422, detail="Paste one SKU per line, with its quantity after it.")
    if len(wanted) > 200:
        raise HTTPException(status_code=422, detail="Paste up to 200 SKUs at a time.")

    found = {
        v.sku.upper(): (v, p)
        for v, p in (await db.execute(
            select(ProductVariant, Product).join(Product, Product.id == ProductVariant.product_id)
            .where(_func.upper(ProductVariant.sku).in_([sku for sku, _ in wanted]),
                   ProductVariant.status == "active")
        )).all()
    }
    added, missing = [], []
    for sku, qty in wanted:
        hit = found.get(sku)
        if hit is None or qty < 1:
            missing.append(sku if qty >= 1 else f"{sku} (no quantity)")
            continue
        variant, product = hit
        unit = await draft_orders.variant_price(db, order, variant)
        line = draft_orders.money(unit * qty)
        db.add(OrderItem(
            order_id=order.id, variant_id=variant.id, product_id=product.id, quantity=qty,
            unit_price=unit, line_total=line, product_name=product.name, sku=variant.sku or "",
            color=variant.color, size=variant.size,
        ))
        added.append({"sku": variant.sku, "quantity": qty})
    if added:
        await db.flush()
        await draft_orders.reprice(db, order)
        await order_events.record_admin(
            db, request, order, "items_edited",
            f"Added {len(added)} pasted SKU{'s' if len(added) != 1 else ''} — order total now ${float(order.total or 0):.2f}",
            meta={"action": "paste", "added": added, "not_found": missing},
        )
    await db.commit()
    state = await draft_orders.wizard_state(db, order)
    return {**state, "added": added, "not_found": missing}


@router.get("/orders/{order_id}/payment-link", response_model=dict)
async def order_payment_link(order_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """The order's own pay page, with its key, as the invoice email links it:
    for the shop to text or paste to a customer."""
    from app.core.config import get_settings as _settings
    from app.core.tenant_context import get_current_brand_site
    from app.services import order_view

    order = await _draft(db, order_id)
    if (order.payment_status or "") == "paid":
        raise HTTPException(status_code=409, detail="This order is already paid.")
    # The brand's own shop, as the emails point their links (email_service
    # _point_at_brand), not the platform's address.
    site = (get_current_brand_site() or _settings().FRONTEND_URL or "").rstrip("/")
    url = (f"{site}/checkout/invoice/{order.order_number}"
           f"#k={order_view.view_key(order.id, order.tenant_id)}")
    return {"url": url, "order_number": order.order_number}


@router.patch("/orders/{order_id}", response_model=dict)
async def update_admin_order(
    order_id: UUID,
    payload: OrderUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import text as _text
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")

    old_status = order.status
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(order, field, value)

    from_draft = None
    if (payload.status == "confirmed" and old_status == "pending"
            and (order.order_number or "").startswith("DRAFT-")):
        # A draft (or a quote) becoming an order takes the next number in the
        # shop's own run. Left as DRAFT-…, the order queues and Reports went
        # on treating it as a draft (order_queues, report_view) and its invoice
        # carried the draft's number. The old number stays on the event, so a
        # quote link sent with it still finds the order (services/quotes).
        from app.services.order_service import OrderService as _OrderService

        from_draft = order.order_number
        order.order_number = await _OrderService(db)._generate_order_number()

    if payload.status and payload.status != old_status:
        await order_events.record_admin(
            db, request, order, _EVENT_FOR_STATUS.get(payload.status, "status_changed"),
            (f"Draft {from_draft} became order {order.order_number}" if from_draft else
             f"Status changed from {old_status.replace('_', ' ')} to {payload.status.replace('_', ' ')}"),
            meta={"from": old_status, "to": payload.status, **({"from_draft": from_draft} if from_draft else {})},
        )

    await db.commit()

    if payload.status and payload.status != old_status:
        await _send_order_status_email(order, payload.status, db)

        # Auto-send invoice when a draft/pending order is confirmed
        if payload.status == "confirmed" and old_status == "pending":
            try:
                from app.services.email_service import EmailService as _ES
                from app.models.company import CompanyUser as _CU
                from sqlalchemy import select as _sel

                _to_email: str | None = None
                _cust_name: str | None = None
                if order.is_guest_order and order.guest_email:
                    _to_email = order.guest_email
                    _cust_name = order.guest_name
                elif order.placed_by_id:
                    _u = (await db.execute(_sel(User).where(User.id == order.placed_by_id))).scalar_one_or_none()
                    if _u:
                        _to_email = _u.email
                        _cust_name = f"{_u.first_name} {_u.last_name}".strip() or None

                if _to_email:
                    _terms = getattr(order, "payment_terms", None) or "net_30"
                    _ok = _ES(db).send_invoice(order, _to_email, payment_terms=_terms, customer_name=_cust_name)
                    if _ok:
                        await db.execute(
                            _text("UPDATE orders SET invoice_sent_at = now() WHERE id = :oid"),
                            {"oid": str(order_id)},
                        )
                        await db.commit()
            except Exception as _e:
                import logging as _lg
                _lg.getLogger(__name__).warning("Auto invoice email failed: %s", _e)

    return {"message": "Order updated"}


@router.patch("/orders/{order_id}/status", response_model=dict)
async def update_order_status(
    order_id: UUID,
    payload: OrderStatusUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    old_status = order.status
    _old_tracking = order.tracking_number
    order.status = payload.status

    if payload.tracking_number is not None:
        order.tracking_number = payload.tracking_number
    if payload.courier is not None:
        order.courier = payload.courier
    if payload.courier_service is not None:
        order.courier_service = payload.courier_service
    if payload.status == "shipped" and not order.shipped_at:
        order.shipped_at = datetime.now(timezone.utc)

    # A tracking number arriving with the status change is its own event: the
    # brand needs to see when the parcel got a number, not only when someone
    # moved the status.
    if payload.tracking_number and payload.tracking_number != _old_tracking:
        await order_events.record_admin(
            db, request, order, "tracking_added",
            f"Tracking {payload.tracking_number}"
            + (f" ({payload.courier})" if payload.courier else ""),
            meta={"tracking_number": payload.tracking_number, "carrier": payload.courier},
        )

    if payload.status != old_status:
        await order_events.record_admin(
            db, request, order, _EVENT_FOR_STATUS.get(payload.status, "status_changed"),
            f"Status changed from {old_status.replace('_', ' ')} to {payload.status.replace('_', ' ')}",
            meta={"from": old_status, "to": payload.status},
        )

    # The parcels behind the tracking page: a number typed here is one, and
    # marking the order delivered by hand delivers its parcels.
    from app.services import shipments as _shipments

    if payload.tracking_number and payload.tracking_number != _old_tracking:
        await _shipments.record_safely(
            db, order, payload.tracking_number, carrier=payload.courier, service=payload.courier_service,
            status="in_transit" if payload.status in ("shipped", "delivered") else "label_created", source="manual")
    if payload.status == "delivered" and old_status != "delivered":
        await _shipments.mark_order(db, order, "delivered", note="Marked delivered by the shop")

    await db.commit()

    if payload.status != old_status and payload.notify:
        await _send_order_status_email(order, payload.status, db)

    return {"success": True, "status": order.status}


class _LabelRequest(BaseModel):
    carrier: str  # "usps" | "ups" | "fedex"
    # Optional parcel override; the order page pre-fills it from item weights.
    weight_lbs: float | None = None
    # False when the shop would rather tell the customer itself.
    notify: bool = True
    length_in: float | None = None
    width_in: float | None = None
    height_in: float | None = None


@router.post("/orders/{order_id}/labels", status_code=200)
async def generate_shipping_label(
    order_id: UUID,
    payload: _LabelRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a Shippo label for an order, mark it shipped, and email the customer."""
    from app.services.shippo_service import create_shippo_label, get_client
    from app.services import shippo_service
    from sqlalchemy import text as _text
    import logging as _logging
    _lbl_log = _logging.getLogger(__name__)

    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Try saved rate_id from customer's checkout selection first (may be expired)
    saved_rate_id = getattr(order, "shipping_rate_id", None)
    result = None

    # A direct-carrier rate is "<carrier>:<service>" — buy it on the brand's own
    # UPS/FedEx/USPS account rather than through the aggregator.
    if saved_rate_id and ":" in str(saved_rate_id):
        try:
            from app.core.tenant_context import get_current_tenant_id
            from app.services import carrier_service, shippo_service as _ship_svc

            _tid = get_current_tenant_id()
            _from = await _ship_svc.get_ship_from(db, _tid)
            label = await carrier_service.buy_label(
                db,
                rate_id=str(saved_rate_id),
                ship_from=_from,
                ship_to=carrier_service.ship_to_from_snapshot(order.shipping_address_snapshot),
                parcel={
                    "weight_lb": payload.weight_lbs or getattr(order, "calculated_weight_lbs", None) or 1.0,
                    "length_in": payload.length_in or 12,
                    "width_in": payload.width_in or 9,
                    "height_in": payload.height_in or 3,
                },
                tenant_id=_tid,
            )
            result = carrier_service.label_result(order, label)
        except Exception as _dc_exc:
            _lbl_log.warning("Direct carrier label failed: %s", _dc_exc)
            raise HTTPException(status_code=400, detail=str(_dc_exc))

    if result is None and saved_rate_id:
        try:
            from shippo.models import components as _comp
            from app.core.tenant_context import get_current_tenant_id as _gtid
            client = get_client(await shippo_service.get_shippo_key(db, _gtid()))
            txn = client.transactions.create(
                _comp.TransactionCreateRequest(
                    rate=saved_rate_id,
                    label_file_type=_comp.LabelFileTypeEnum.PDF,
                    async_=False,
                )
            )
            if txn.status == _comp.TransactionStatusEnum.SUCCESS:
                result = {
                    "success": True,
                    "tracking_number": txn.tracking_number,
                    "tracking_url": txn.tracking_url_provider,
                    "label_url": txn.label_url,
                    "carrier": order.carrier or payload.carrier.upper(),
                    "service": order.courier_service or "",
                }
            else:
                _lbl_log.warning("Saved rate_id transaction not SUCCESS (%s), falling back", txn.status)
        except Exception as _e:
            _lbl_log.warning("Saved rate_id failed (likely expired): %s — falling back to fresh rate", _e)

    if result is None:
        result = await create_shippo_label(order, carrier=payload.carrier.lower(), db=db)

    if result.get("success"):
        order.tracking_number = result["tracking_number"]
        order.carrier = result["carrier"]
        order.courier = result["carrier"]   # keeps email helper working
        order.courier_service = result["service"]
        order.status = "shipped"
        if not order.shipped_at:
            order.shipped_at = datetime.now(timezone.utc)

        # label_url / tracking_url added via startup migration — use raw SQL for safety
        await db.execute(
            _text("UPDATE orders SET label_url=:lu, tracking_url=:tu WHERE id=:oid"),
            {"lu": result.get("label_url"), "tu": result.get("tracking_url"), "oid": str(order_id)},
        )

        await _record_label_events(db, request, order, result)
        from app.services import shipments as _shipments

        await _shipments.record_safely(
            db, order, result["tracking_number"], carrier=result.get("carrier"), service=result.get("service"),
            tracking_url=result.get("tracking_url"), status="label_created")

        await db.commit()
        if payload.notify:
            await _send_order_status_email(order, "shipped", db)

    return result


@router.get("/orders/{order_id}/label")
async def download_order_label(order_id: UUID, db: AsyncSession = Depends(get_db)):
    """The label file kept on the order (UPS/USPS/FedEx labels bought on the
    brand's own account). Tenant-scoped like every order read."""
    import base64 as _b64

    from fastapi.responses import Response
    from sqlalchemy.orm import undefer

    order = (await db.execute(
        select(Order).options(undefer(Order.label_data)).where(Order.id == order_id)
    )).scalar_one_or_none()
    if not order or not order.label_data:
        raise HTTPException(status_code=404, detail="No label file on this order")
    fmt = (order.label_format or "PDF").upper()
    media = {"PDF": "application/pdf", "GIF": "image/gif", "PNG": "image/png", "ZPL": "application/octet-stream"}
    try:
        data = _b64.b64decode(order.label_data)
    except Exception:
        raise HTTPException(status_code=500, detail="The stored label is unreadable")
    name = f"label-{order.order_number}-{(order.tracking_number or '').split(',')[0]}.{fmt.lower()}"
    return Response(content=data, media_type=media.get(fmt, "application/octet-stream"),
                    headers={"Content-Disposition": f'inline; filename="{name}"'})


class _FetchRatesRequest(BaseModel):
    # Left out: worked out from the order's own lines.
    weight_lbs: float | None = None


@router.post("/orders/{order_id}/fetch-rates", status_code=200)
async def fetch_order_rates(
    order_id: UUID,
    payload: _FetchRatesRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return live Shippo rates for a Standard Ground order so the admin can pick one."""
    from app.services.shippo_service import get_client, WAREHOUSE_ADDRESS
    from shippo.models import components as _comp

    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    from app.services import carrier_service as _carriers

    _dest = _carriers.ship_to_from_snapshot(order.shipping_address_snapshot)
    to_address = {
        "name": _dest["name"],
        "street1": _dest["street1"] or "123 Main St",
        "city": _dest["city"] or "Unknown",
        "state": _dest["state"],
        "zip": _dest["zip"],
        "country": _dest["country"],
    }
    if not to_address["state"] or not to_address["zip"]:
        raise HTTPException(status_code=422, detail="Incomplete shipping address on order (missing state or ZIP)")

    weight_lbs = max(payload.weight_lbs or await _order_weight_lbs(db, order.id), 0.5)
    # What was quoted, for the batch label window's To and Weight columns.
    quoted = {"to": {"city": to_address["city"], "state": to_address["state"]}, "weight_lbs": round(weight_lbs, 2)}
    # Quote from THIS brand's warehouse, not the platform default — the origin
    # changes the price, so a brand in NY must not be rated from Dallas.
    from app.core.tenant_context import get_current_tenant_id as _gtid_wh
    from app.services import shippo_service as _ship_wh
    wh = await _ship_wh.get_ship_from(db, _gtid_wh()) or WAREHOUSE_ADDRESS

    # A brand with its own UPS / FedEx / USPS accounts is quoted — and later
    # billed — on those, never on the aggregator.
    direct = await _carriers.get_rates(
        db, ship_from=wh, ship_to=_dest,
        parcel={"weight_lb": weight_lbs, "length_in": 12, "width_in": 10, "height_in": 6},
        tenant_id=_gtid_wh(),
    )
    if direct.get("connected"):
        return {
            "rates": [{
                "rate_id": r["rate_id"], "carrier": r["carrier"].upper(), "service": r["service_name"],
                "cost": r["amount"], "currency": r["currency"], "days": r["estimated_days"],
            } for r in direct["rates"]],
            "source": "carrier",
            **quoted,
            **({"error": "; ".join(e["message"] for e in direct["errors"])} if direct["errors"] and not direct["rates"] else {}),
            **({"warnings": direct["errors"]} if direct["errors"] and direct["rates"] else {}),
        }

    try:
        from app.core.tenant_context import get_current_tenant_id as _gtid
        client = get_client(await _ship_wh.get_shippo_key(db, _gtid()))
        shipment = client.shipments.create(
            _comp.ShipmentCreateRequest(
                address_from=_comp.AddressCreateRequest(
                    name=wh["name"], street1=wh["street1"], city=wh["city"],
                    state=wh["state"], zip=wh["zip"], country=wh["country"],
                    phone=wh["phone"], email=wh["email"],
                ),
                address_to=_comp.AddressCreateRequest(
                    name=to_address["name"], street1=to_address["street1"],
                    city=to_address["city"], state=to_address["state"],
                    zip=to_address["zip"], country=to_address["country"],
                ),
                parcels=[_comp.ParcelCreateRequest(
                    length="12", width="10", height="6",
                    distance_unit=_comp.DistanceUnitEnum.IN,
                    weight=str(round(weight_lbs, 2)),
                    mass_unit=_comp.WeightUnitEnum.LB,
                )],
                async_=False,
            )
        )
        # Retry if major carriers are missing (Shippo may return partial results)
        _expected = {"ups", "usps", "fedex"}
        for _attempt in range(5):
            _present = {(r.provider or "").lower() for r in (shipment.rates or [])}
            _missing = _expected - _present
            if not _missing or _attempt == 4:
                if _missing:
                    logger.warning("fetch-rates: %s absent after %d attempts", _missing, _attempt + 1)
                break
            logger.info("fetch-rates attempt %d: %s missing, retrying in 1.5 s", _attempt + 1, _missing)
            await asyncio.sleep(1.5)
            try:
                updated = client.shipments.get(shipment_id=shipment.object_id)
                if updated and (updated.rates or []):
                    shipment = updated
            except Exception as _re:
                logger.warning("fetch-rates re-fetch attempt %d failed: %s", _attempt + 1, _re)
                break

        rates = []
        for rate in (shipment.rates or []):
            try:
                rates.append({
                    "rate_id": rate.object_id,
                    "carrier": rate.provider or "Unknown",
                    "service": rate.servicelevel.name if rate.servicelevel else "Standard",
                    "cost": float(rate.amount),
                    "currency": rate.currency or "USD",
                    "days": rate.estimated_days,
                })
            except Exception:
                continue
        rates.sort(key=lambda r: r["cost"])
        return {"rates": rates, **quoted}
    except Exception as exc:
        logger.warning("Admin fetch-rates error: %s", exc)
        return {"rates": [], "error": str(exc), **quoted}


class _ManualLabelRequest(BaseModel):
    rate_id: str | None = None    # if provided, purchase this specific Shippo rate
    carrier: str = ""             # carrier name (metadata when rate_id used; fallback key otherwise)
    service: str = ""             # service name (metadata when rate_id used)
    weight_lbs: float = 1.0      # used only when rate_id is not provided
    notify: bool = True          # False when the shop would rather tell the customer itself


@router.post("/orders/{order_id}/generate-label-manual", status_code=200)
async def generate_label_manual(
    order_id: UUID,
    payload: _ManualLabelRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a Shippo label for Standard Ground orders.

    If rate_id is provided (admin selected a live rate), purchases that specific rate.
    Otherwise falls back to weight-based carrier selection.
    """
    from sqlalchemy import text as _text2

    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if payload.rate_id and ":" in payload.rate_id:
        # A rate from the brand's own carrier ("ups:03"): buy it there.
        from app.core.tenant_context import get_current_tenant_id as _gtid_c
        from app.services import carrier_service as _carriers
        from app.services import shippo_service as _ship_c
        from app.services.carriers.base import CarrierError as _CarrierError
        try:
            label = await _carriers.buy_label(
                db, rate_id=payload.rate_id,
                ship_from=await _ship_c.get_ship_from(db, _gtid_c()),
                ship_to=_carriers.ship_to_from_snapshot(order.shipping_address_snapshot),
                parcel={"weight_lb": max(payload.weight_lbs, 0.1), "length_in": 12, "width_in": 10, "height_in": 6},
                tenant_id=_gtid_c(),
            )
            result = _carriers.label_result(order, label)
        except _CarrierError as exc:
            result = {"success": False, "error": str(exc)}
        except Exception as exc:
            logger.warning("direct carrier label failed: %s", exc)
            result = {"success": False, "error": "The carrier didn't answer. No label was bought — try again."}
    elif payload.rate_id:
        # Purchase the specific rate the admin selected from fetch-rates
        from app.services import shippo_service as _ship_svc2
        from app.services.shippo_service import get_client
        from shippo.models import components as _comp2
        from app.core.tenant_context import get_current_tenant_id as _gtid
        try:
            client = get_client(await _ship_svc2.get_shippo_key(db, _gtid()))
            txn = client.transactions.create(
                _comp2.TransactionCreateRequest(
                    rate=payload.rate_id,
                    label_file_type=_comp2.LabelFileTypeEnum.PDF,
                    async_=False,
                )
            )
            if txn.status == _comp2.TransactionStatusEnum.SUCCESS:
                result: dict = {
                    "success": True,
                    "tracking_number": txn.tracking_number,
                    "tracking_url": txn.tracking_url_provider,
                    "label_url": txn.label_url,
                    "carrier": payload.carrier or "",
                    "service": payload.service or "",
                }
            else:
                msgs = " | ".join([m.text for m in (txn.messages or []) if hasattr(m, "text")])
                result = {"success": False, "error": msgs or "Label creation failed"}
        except Exception as exc:
            result = {"success": False, "error": str(exc)}
    else:
        # Fallback: weight-based — extract address and call create_label
        from app.services.shippo_service import create_label, CARRIER_TOKENS
        addr = _json.loads(order.shipping_address_snapshot or "{}")
        to_address = {
            "name": addr.get("full_name") or addr.get("name") or "",
            "street1": addr.get("address_line1") or addr.get("street1") or "",
            "city": addr.get("city", ""),
            "state": addr.get("state") or addr.get("state_province", ""),
            "zip": addr.get("zip_code") or addr.get("postal_code") or addr.get("zip", ""),
            "country": addr.get("country", "US"),
        }
        if not all([to_address["street1"], to_address["city"], to_address["state"], to_address["zip"]]):
            raise HTTPException(status_code=422, detail="Incomplete shipping address on order")
        carrier_token = CARRIER_TOKENS.get(payload.carrier.lower(), "usps_priority")
        # On the brand's own Shippo account, from the brand's own dock. Without
        # these two the label was bought on the platform's account and shipped
        # from the platform's address — we paid for the brand's postage, and
        # the parcel said it came from somewhere the brand has never been.
        from app.core.tenant_context import get_current_tenant_id as _label_tid
        from app.services import shippo_service as _ship_svc

        _lt = getattr(request.state, "tenant_id", None) or _label_tid()
        result = await create_label(
            str(order_id), to_address, carrier_token,
            weight_oz=payload.weight_lbs * 16.0,
            address_from=await _ship_svc.get_ship_from(db, _lt),
            api_key=await _ship_svc.get_shippo_key(db, _lt),
        )

    if result.get("success"):
        order.tracking_number = result["tracking_number"]
        order.carrier = result["carrier"]
        order.courier = result["carrier"]
        order.courier_service = result["service"]
        order.status = "shipped"
        if not order.shipped_at:
            order.shipped_at = datetime.now(timezone.utc)

        await db.execute(
            _text2("UPDATE orders SET label_url=:lu, tracking_url=:tu WHERE id=:oid"),
            {"lu": result.get("label_url"), "tu": result.get("tracking_url"), "oid": str(order_id)},
        )

        await _record_label_events(db, request, order, result)
        from app.services import shipments as _shipments

        await _shipments.record_safely(
            db, order, result["tracking_number"], carrier=result.get("carrier"), service=result.get("service"),
            tracking_url=result.get("tracking_url"), status="label_created")

        await db.commit()
        if payload.notify:
            await _send_order_status_email(order, "shipped", db)

    return result


async def _order_weight_lbs(db: AsyncSession, order_id) -> float:
    """What an order weighs, from its variants' weights, or half a pound a unit
    when none is recorded. The same sum the order page pre-fills its weight box
    with, for a caller that has not been given one."""
    try:
        from app.models.product import ProductVariant as _PV

        lines = (await db.execute(
            select(OrderItem.variant_id, OrderItem.quantity).where(OrderItem.order_id == order_id)
        )).all()
        ids = [v for v, _ in lines if v]
        grams = dict((await db.execute(
            select(_PV.id, _PV.weight_grams).where(_PV.id.in_(ids))
        )).all()) if ids else {}
        total = sum(float(grams.get(v) or 0) * q for v, q in lines)
        if total > 0:
            return max(round(total / 453.592, 2), 0.5)
        return max(round(sum(q for _, q in lines) * 0.5, 2), 0.5)
    except Exception:
        return 1.0


@router.post("/orders/{order_id}/packed", response_model=dict)
async def mark_order_packed(order_id: UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """Packed, and waiting for a label or a courier.

    Not a status: a packed order is still confirmed or processing, so every
    screen that reads statuses goes on working. It is a recorded event, which is
    what the order's timeline, its steps and Home's "Ready to ship" read.
    """
    from app.models.order import OrderEvent

    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")
    if order.status not in ("confirmed", "processing"):
        raise HTTPException(
            status_code=409,
            detail="Only an order that is confirmed and has not shipped can be marked packed.",
        )
    already = (await db.execute(
        select(OrderEvent.id).where(OrderEvent.order_id == order.id, OrderEvent.type == "packed").limit(1)
    )).scalar_one_or_none()
    if already:
        return {"packed": True, "already": True}
    await order_events.record_admin(db, request, order, "packed", "Packed and ready to go")
    await db.commit()
    return {"packed": True}


class _NoteRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


@router.post("/orders/{order_id}/notes", response_model=dict)
async def add_order_note(
    order_id: UUID,
    payload: _NoteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """A note for the shop's own team, kept in the order's history with who
    wrote it and when. The customer never sees it."""
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")
    text_ = payload.text.strip()
    if not text_:
        raise HTTPException(status_code=422, detail="Write the note first.")
    await order_events.record_admin(db, request, order, "note", text_)
    await db.commit()
    return {"events": await order_events.for_order(db, order.id)}


@router.post("/orders/{order_id}/cancel", response_model=dict)
async def cancel_admin_order(
    order_id: UUID,
    payload: CancelOrderRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")
    if order.status == "cancelled":
        return {"message": "Order was already cancelled"}

    _was = order.status
    order.status = "cancelled"
    # Appended, not assigned: overwriting `notes` threw away whatever the buyer
    # or the brand had written on the order.
    if payload.reason:
        _existing = (order.notes or "").strip()
        order.notes = (_existing + "\n" if _existing else "") + f"Cancelled: {payload.reason}"

    await order_events.record_admin(
        db, request, order, "cancelled",
        f"Order cancelled — {payload.reason}" if payload.reason else "Order cancelled",
        meta={"reason": payload.reason, "previous_status": _was},
    )
    await db.commit()

    await _send_order_status_email(order, "cancelled", db)

    return {"message": "Order cancelled"}


class RefundOrderRequest(BaseModel):
    # None refunds whatever is still paid — which after a partial refund is not
    # the order total, and refunding the total again would overshoot it.
    amount: float | None = None
    reason: str | None = None     # duplicate | fraudulent | requested_by_customer
    note: str | None = None       # for the brand's own records
    # A value the screen generates once per press of the button. Sent to Stripe
    # as the idempotency key, so a double click, a retry after a timeout, or a
    # page resubmit all resolve to the one refund instead of two.
    request_id: str | None = None


async def issue_refund(
    db: AsyncSession,
    request: Request,
    order: Order,
    *,
    amount: float | None = None,
    reason: str | None = None,
    note: str | None = None,
    request_id: str | None = None,
) -> dict:
    """Refund a card order, in full (amount None) or in part, on the brand's
    own Stripe account, and record it. The order page's Refund and a return
    resolved as a refund (services/returns) both come here, so both are held
    to the same checks and recorded the same way. Raises HTTPException with
    words the admin can act on.
    """
    import hashlib
    from decimal import Decimal

    import stripe as _stripe

    from app.services import gift_card_checkout as gcc
    from app.services import gift_cards as gc
    from app.services import refund_service
    from app.services.connect_service import ConnectService
    from app.services.payment_service import PaymentService

    gift = await gcc.order_payments(db, order.id)
    if not order.stripe_payment_intent_id and not gift["cards"]:
        raise HTTPException(
            status_code=400,
            detail="This order was not paid by card; refund it through the way it was paid.",
        )
    if order.payment_status != "paid":
        raise HTTPException(
            status_code=400,
            detail=f"Nothing left to refund on this order (payment status: {order.payment_status}).",
        )

    tenant_id = getattr(request.state, "tenant_id", None)

    remaining = await refund_service.remaining_refundable(db, order.id)
    if remaining <= 0:
        raise HTTPException(status_code=400, detail="This order has already been refunded in full.")

    amount = remaining if amount is None else Decimal(str(amount)).quantize(Decimal("0.01"))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="A refund must be more than $0.00.")
    if amount > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"Only ${remaining:.2f} is left to refund on this order.",
        )
    if reason and reason not in ("duplicate", "fraudulent", "requested_by_customer"):
        raise HTTPException(status_code=400, detail="Reason is duplicate, fraudulent or requested_by_customer.")

    # Card first, up to what the card paid; the rest back onto the gift cards
    # that paid. Gift cards this order sold go back whole, and only unused
    # (they are locked until this commits). Worked out before any money moves.
    try:
        plan = await gcc.split_refund(db, order, amount)
    except gc.GiftCardError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # The key covers the order, the amount and what was left before — so the
    # same press twice is one refund, while a genuine second partial refund of
    # the same amount (with less left) is a new one.
    raw_key = request_id or f"{order.id}:{amount}:{remaining}"
    idempotency_key = "refund-" + hashlib.sha256(f"{tenant_id}:{raw_key}".encode()).hexdigest()[:40]

    actor_id, actor_name = await order_events.admin_actor(db, request)
    refund = None
    result: dict = {}
    if plan.card > 0:
        connect = await ConnectService(db).get_status(str(tenant_id))
        if not connect.get("account_id"):
            raise HTTPException(status_code=400, detail="This store has no connected payment account.")
        try:
            refund = await PaymentService(db).create_refund(
                payment_intent_id=order.stripe_payment_intent_id,
                connected_account_id=connect["account_id"],
                # Always the exact amount validated above, never "whatever Stripe
                # thinks is left": what leaves the brand's account is what was checked.
                amount_decimal=plan.card,
                reason=reason,
                idempotency_key=idempotency_key,
                metadata={"order_id": str(order.id), "order_number": order.order_number,
                          "requested_by": actor_name},
            )
        except _stripe.error.InvalidRequestError as exc:
            # Stripe's own words — "charge already refunded", "amount exceeds" —
            # are something the admin can act on; a 502 is not.
            raise HTTPException(status_code=400, detail=getattr(exc, "user_message", None) or str(exc))
        except _stripe.error.StripeError as exc:
            logger.exception("Stripe refund failed for order %s", order.id)
            raise HTTPException(status_code=502, detail="The payment provider could not process the refund. Try again shortly.")

        result = await refund_service.record_refund(
            db, refund=refund, source="admin",
            initiated_by=actor_id, initiated_by_name=actor_name, note=note,
        ) or {}

    if plan.gift > 0:
        back = await gcc.refund_to_cards(db, order, plan.gift, key=idempotency_key, actor=(actor_id, actor_name),
                                         reason=note or f"Refund of order {order.order_number}")
        result.update(await refund_service.resync_order(db, order.id, Decimal(str(order.total or 0))))
        for b in back:
            await order_events.record(
                db, order, "refund_issued",
                f"Refund of ${b['amount']:.2f} back to gift card ending {b['last4']}",
                actor_type="admin", actor_id=actor_id, actor_name=actor_name,
                meta={"amount": b["amount"], "method": "gift_card", "gift_card_last4": b["last4"],
                      "total_refunded": result.get("total_refunded"),
                      "fully_refunded": result.get("fully_refunded")},
            )
    if plan.void_cards:
        await gcc.void_sold(db, plan.void_cards, order=order, actor=(actor_id, actor_name))
        for c in plan.void_cards:
            await order_events.record(
                db, order, "note", f"Gift card ending {c.code_last4} voided: its ${float(c.initial_amount):.2f} was refunded",
                actor_type="admin", actor_id=actor_id, actor_name=actor_name,
                meta={"gift_card_last4": c.code_last4, "amount": float(c.initial_amount)},
            )
    await db.commit()
    await db.refresh(order)

    return {
        "message": "Refund issued" if result.get("fully_refunded") else "Partial refund issued",
        "refund_id": (getattr(refund, "id", None) or (refund or {}).get("id")) if refund is not None else None,
        "amount": float(amount),
        "card_amount": float(plan.card),
        "gift_card_amount": float(plan.gift),
        "status": result.get("status") or ("succeeded" if plan.gift > 0 else None),
        "total_refunded": result.get("total_refunded"),
        "remaining": result.get("remaining"),
        "payment_status": order.payment_status,
    }


@router.post("/orders/{order_id}/refund", response_model=dict)
async def refund_admin_order(
    order_id: UUID,
    payload: RefundOrderRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Refund a card order, in full or in part, on the brand's own Stripe account.

    Authorisation is layered: the middleware requires the orders permission and
    the billing permission with write access (money leaves the brand here), and
    the session only finds this brand's orders, so an id from another brand is
    simply not found.

    The refund is recorded from Stripe's answer, never from the request: the
    same row the webhook will later update.
    """
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")
    return await issue_refund(db, request, order, amount=payload.amount, reason=payload.reason,
                              note=payload.note, request_id=payload.request_id)


@router.get("/refunds")
async def list_admin_refunds(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Every refund on this brand's orders, newest first."""
    from app.services import refund_service

    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        return {"items": [], "total": 0, "refunded_total": 0}
    return await refund_service.list_refunds(
        db, tenant_id, limit=page_size, offset=(page - 1) * page_size,
    )


@router.get("/disputes")
async def list_admin_disputes(request: Request, db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Chargebacks/disputes on this brand's Direct-charge orders. Tenant-scoped."""
    from app.services.dispute_service import DisputeService
    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        return []
    return await DisputeService(db).list_for_tenant(str(tenant_id))


@router.post("/orders/{order_id}/resend-invoice", response_model=dict)
async def resend_invoice_email(order_id: UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """Generate and email the invoice PDF to the customer (or admin in dev)."""
    from sqlalchemy.orm import selectinload
    from app.services.email_service import EmailService

    result = await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise NotFoundError(f"Order {order_id} not found")

    # Resolve customer email
    to_email: str | None = None
    if order.is_guest_order:
        to_email = order.guest_email
    elif order.placed_by_id:
        user_row = (await db.execute(
            select(User).where(User.id == order.placed_by_id)
        )).scalar_one_or_none()
        if user_row:
            to_email = user_row.email

    if not to_email:
        raise HTTPException(status_code=422, detail="No customer email found for this order")

    ok = EmailService(db).send_invoice(order, to_email)
    if not ok:
        raise HTTPException(status_code=502, detail="Invoice email failed to send")

    return {"message": f"Invoice emailed to {to_email}"}


@router.post("/orders/{order_id}/send-invoice", response_model=dict)
async def send_invoice_email(
    order_id: UUID,
    payload: SendInvoicePayload,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Send (or resend) invoice with specified payment terms to the customer."""
    from sqlalchemy.orm import selectinload
    from app.services.email_service import EmailService

    result = await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Persist payment terms
    order.payment_terms = payload.payment_terms
    await db.commit()
    await db.refresh(order)

    # Resolve customer contact
    to_email: str | None = None
    customer_name: str | None = None
    if order.is_guest_order and order.guest_email:
        to_email = order.guest_email
        customer_name = order.guest_name
    elif order.placed_by_id:
        user_row = (await db.execute(select(User).where(User.id == order.placed_by_id))).scalar_one_or_none()
        if user_row:
            to_email = user_row.email
            customer_name = f"{user_row.first_name} {user_row.last_name}".strip() or None
    if not to_email and order.company_id:
        # An account the shop added with no one signing in for it yet (a
        # phone order): its own email.
        company_row = (await db.execute(select(Company).where(Company.id == order.company_id))).scalar_one_or_none()
        if company_row and company_row.company_email:
            to_email = company_row.company_email
            customer_name = company_row.name

    if not to_email:
        raise HTTPException(status_code=422, detail="No customer email found for this order")

    ok = EmailService(db).send_invoice(order, to_email, payment_terms=payload.payment_terms, customer_name=customer_name)
    if not ok:
        raise HTTPException(status_code=502, detail="Invoice email failed to send")

    from sqlalchemy import text as _t2
    await db.execute(
        _t2("UPDATE orders SET invoice_sent_at = now() WHERE id = :oid"),
        {"oid": str(order_id)},
    )
    await order_events.record_admin(
        db, request, order, "invoice_sent",
        f"Invoice sent to {to_email}"
        + (f" ({payload.payment_terms.replace('_', ' ')})" if payload.payment_terms else ""),
        meta={"to": to_email, "payment_terms": payload.payment_terms},
    )
    await db.commit()

    return {"message": f"Invoice sent to {to_email}"}


@router.post("/orders/{order_id}/mark-paid", response_model=dict)
async def mark_order_paid(
    order_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Mark an order as paid and record who marked it."""
    from sqlalchemy import text as _t3

    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Resolve admin name from request state
    admin_name = "Admin"
    admin_user_id = getattr(request.state, "user_id", None) if request else None
    if admin_user_id:
        _admin = (await db.execute(select(User).where(User.id == admin_user_id))).scalar_one_or_none()
        if _admin:
            admin_name = f"{_admin.first_name} {_admin.last_name}".strip() or "Admin"

    order.payment_status = "paid"

    # Invoice tracking fields go in via raw SQL to avoid ORM column issues.
    await db.execute(
        _t3("""
            UPDATE orders
            SET payment_status = 'paid',
                marked_paid_at  = now(),
                marked_paid_by  = :admin,
                amount_paid     = COALESCE(total, 0)
            WHERE id = :oid
        """),
        {"admin": admin_name, "oid": str(order_id)},
    )
    await order_events.record(
        db, order, "payment_received",
        f"Payment received — marked as paid (${float(order.total):.2f})",
        actor_type="admin", actor_id=admin_user_id, actor_name=admin_name,
        meta={"amount": float(order.total), "method": "manual"},
    )
    await db.commit()

    return {"message": "Order marked as paid"}


@router.get("/rma")
async def list_admin_rma(
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    query = select(RMARequest)
    if status:
        query = query.where(RMARequest.status == status)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    result = await db.execute(
        query.order_by(RMARequest.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )
    rows = list(result.scalars().all())
    # Which order each return is for, in one query.
    numbers = dict((await db.execute(
        select(Order.id, Order.order_number).where(Order.id.in_([r.order_id for r in rows]))
    )).all()) if rows else {}
    return PaginatedResponse(
        # Plain values: the rows themselves cannot be written out as JSON, so
        # this list answered 500 as soon as a shop had one return.
        items=[{
            "id": str(r.id), "rma_number": r.rma_number,
            "order_id": str(r.order_id), "order_number": numbers.get(r.order_id),
            "status": r.status, "reason": r.reason, "notes": r.notes, "admin_notes": r.admin_notes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.patch("/rma/{rma_id}", response_model=dict)
async def update_rma(
    rma_id: UUID,
    payload: RMAUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    rma = (await db.execute(select(RMARequest).where(RMARequest.id == rma_id))).scalar_one_or_none()
    if not rma:
        raise NotFoundError(f"RMA {rma_id} not found")
    _was = rma.status
    rma.status = payload.status
    if payload.admin_notes:
        rma.admin_notes = payload.admin_notes

    # The return belongs to an order, so its history belongs on that order.
    if payload.status != _was:
        _order = (await db.execute(select(Order).where(Order.id == rma.order_id))).scalar_one_or_none()
        if _order is not None:
            await order_events.record_admin(
                db, request, _order, _RMA_EVENT.get(payload.status, "note"),
                f"Return {rma.rma_number} {payload.status}"
                + (f" — {payload.admin_notes}" if payload.admin_notes else ""),
                meta={"rma_id": str(rma.id), "rma_number": rma.rma_number,
                      "from": _was, "to": payload.status},
            )
    await db.commit()

    # Notify customer of status change
    try:
        from app.tasks.email_tasks import send_rma_status_email
        send_rma_status_email.delay(str(rma_id))
    except Exception:
        pass

    return {"message": f"RMA {payload.status}"}


# ---------------------------------------------------------------------------
# Abandoned Carts — admin view (live CartItem data, inactive > 1 hour)
# ---------------------------------------------------------------------------

@router.get("/abandoned-carts")
async def admin_list_abandoned_carts(
    db: AsyncSession = Depends(get_db),
):
    from datetime import timedelta
    from app.models.order import CartItem
    from app.models.product import ProductVariant, Product
    from app.models.company import CompanyUser

    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)

    result = await db.execute(
        select(CartItem)
        .where(CartItem.updated_at < cutoff)
        .order_by(CartItem.company_id, CartItem.updated_at.desc())
    )
    items = result.scalars().all()

    # Group by company_id
    company_map: dict[str, list] = {}
    for item in items:
        key = str(item.company_id)
        company_map.setdefault(key, []).append(item)

    out = []
    for company_id_str, cart_items in company_map.items():
        company = (await db.execute(
            select(Company).where(Company.id == cart_items[0].company_id)
        )).scalar_one_or_none()

        # Get owner email
        customer_email = None
        owner_row = (await db.execute(
            select(CompanyUser).where(
                CompanyUser.company_id == cart_items[0].company_id,
                CompanyUser.role == "owner",
            )
        )).scalar_one_or_none()
        if owner_row:
            owner_user = (await db.execute(
                select(User).where(User.id == owner_row.user_id)
            )).scalar_one_or_none()
            if owner_user:
                customer_email = owner_user.email

        items_detail = []
        total = 0.0
        for ci in cart_items:
            variant = (await db.execute(
                select(ProductVariant).where(ProductVariant.id == ci.variant_id)
            )).scalar_one_or_none()
            product_name = ""
            if variant:
                prod = (await db.execute(
                    select(Product).where(Product.id == variant.product_id)
                )).scalar_one_or_none()
                product_name = prod.name if prod else ""
            unit = float(ci.unit_price or 0)
            line = unit * ci.quantity
            total += line
            items_detail.append({
                "variant_id": str(ci.variant_id),
                "product_name": product_name,
                "sku": variant.sku if variant else "",
                "color": variant.color if variant else "",
                "size": variant.size if variant else "",
                "quantity": ci.quantity,
                "unit_price": unit,
                "line_total": line,
            })

        abandoned_at = max(ci.updated_at for ci in cart_items)
        out.append({
            "id": company_id_str,
            "company_name": company.name if company else "Unknown",
            "company_id": company_id_str,
            "customer_email": customer_email,
            "abandoned_at": abandoned_at.isoformat(),
            "total": round(total, 2),
            "item_count": len(cart_items),
            "items": items_detail,
            "is_recovered": False,
            "recovered_at": None,
        })

    return sorted(out, key=lambda x: x["abandoned_at"], reverse=True)


@router.post("/abandoned-carts/{company_id}/remind")
async def send_abandoned_cart_reminder(
    company_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    from datetime import timedelta
    from app.models.order import CartItem
    from app.models.product import ProductVariant, Product
    from app.models.company import CompanyUser
    from app.services.email_service import EmailService
    from app.core.config import settings

    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    result = await db.execute(
        select(CartItem)
        .where(CartItem.company_id == company_id, CartItem.updated_at < cutoff)
    )
    cart_items = result.scalars().all()
    if not cart_items:
        raise HTTPException(status_code=404, detail="No abandoned cart items found")

    owner_row = (await db.execute(
        select(CompanyUser).where(
            CompanyUser.company_id == company_id, CompanyUser.role == "owner"
        )
    )).scalar_one_or_none()
    if not owner_row:
        raise HTTPException(status_code=404, detail="Company owner not found")
    owner = (await db.execute(select(User).where(User.id == owner_row.user_id))).scalar_one_or_none()
    if not owner:
        raise HTTPException(status_code=404, detail="Owner user not found")

    rows_html = ""
    total = 0.0
    for ci in cart_items:
        variant = (await db.execute(
            select(ProductVariant).where(ProductVariant.id == ci.variant_id)
        )).scalar_one_or_none()
        prod = None
        if variant:
            prod = (await db.execute(
                select(Product).where(Product.id == variant.product_id)
            )).scalar_one_or_none()
        unit = float(ci.unit_price or 0)
        line = unit * ci.quantity
        total += line
        name = prod.name if prod else "Product"
        details = " / ".join(filter(None, [variant.color if variant else None, variant.size if variant else None]))
        details_html = f'<br><span style="font-size:11px;color:#9ca3af">{details}</span>' if details else ""
        rows_html += (
            f'<tr>'
            f'<td style="padding:8px 0;border-bottom:1px solid #f3f4f6">{name}{details_html}'
            f'</td>'
            f'<td style="padding:8px;border-bottom:1px solid #f3f4f6;text-align:center">{ci.quantity}</td>'
            f'<td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right">${unit:.2f}</td>'
            f'</tr>'
        )

    EmailService(db).send_raw(
        to_email=owner.email,
        subject="You left items in your cart — AF Apparels",
        body_html=_af_email(
            f'<h2 style="color:#2A2830;margin:0 0 12px">Your cart is waiting!</h2>'
            f'<p>Hi {owner.first_name or "there"},</p>'
            f'<p>You have items saved in your AF Apparels cart. Complete your order before they sell out.</p>'
            f'<table style="width:100%;border-collapse:collapse;margin:16px 0">'
            f'<thead><tr>'
            f'<th style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;padding:0 0 8px">Product</th>'
            f'<th style="text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;padding:0 8px 8px">Qty</th>'
            f'<th style="text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;padding:0 0 8px">Price</th>'
            f'</tr></thead>'
            f'<tbody>{rows_html}</tbody>'
            f'<tfoot><tr>'
            f'<td colspan="2" style="padding:12px 0 0;text-align:right;font-weight:700;color:#2A2830">Total:</td>'
            f'<td style="padding:12px 0 0;text-align:right;font-weight:800;font-size:18px;color:#1A5CFF">${total:.2f}</td>'
            f'</tr></tfoot>'
            f'</table>'
            f'<p style="margin-top:24px">'
            f'<a href="{settings.FRONTEND_URL.rstrip("/")}/cart" style="background:#1A5CFF;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">Complete Your Order</a>'
            f'</p>'
        ),
    )
    return {"message": f"Reminder sent to {owner.email}"}