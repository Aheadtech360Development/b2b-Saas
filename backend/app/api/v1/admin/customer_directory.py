"""Admin API — the customer list and a customer's page (services/customer_directory).

Under /admin/customers, which every plan has. /admin/companies belongs to the
wholesale toolset, so on a plan without it the old list was locked whole,
retail buyers included. Here the wholesale parts are the only thing a plan
holds back: a wholesale account added or edited where the plan has no
wholesale accounts, and a pricing tier where it has no tiers.
"""
from __future__ import annotations

import csv
import io
import logging
import secrets
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import get_current_tenant_id
from app.services import customer_directory as cd

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/customers", tags=["admin", "customers"])

INVITE_DAYS = 3
ROLES = ("owner", "buyer", "viewer", "finance")


def _tenant():
    tid = get_current_tenant_id()
    if not tid:
        raise HTTPException(status_code=400, detail="Open this from your shop's admin.")
    return tid


async def _can(db: AsyncSession, feature: str) -> bool:
    from app.services import entitlements

    return await entitlements.enabled(db, get_current_tenant_id(), feature)


# ── The list ──────────────────────────────────────────────────────────────────

@router.get("")
async def list_customers(
    q: str | None = None,
    type: str | None = None,
    status: str | None = None,
    sort: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await cd.directory(db, _tenant(), q=q, kind=type, status=status, sort=sort,
                              page=page, page_size=page_size)


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db)) -> dict:
    """The tabs' numbers, for every Customers screen: each kind, the
    applications waiting, and what this plan includes."""
    tid = _tenant()
    wholesale = await _can(db, "wholesale_accounts")
    pending = 0
    if wholesale:
        pending = int((await db.execute(text(
            "SELECT count(*) FROM wholesale_applications WHERE tenant_id = CAST(:t AS uuid) AND status = 'pending'"
        ), {"t": str(tid)})).scalar() or 0)
    return {
        "counts": await cd.counts(db, tid),
        "applications_pending": pending,
        "features": {
            "wholesale_accounts": wholesale,
            "customer_tiers": await _can(db, "customer_tiers"),
            "net_terms": await _can(db, "net_terms"),
        },
    }


@router.get("/export")
async def export_customers(
    q: str | None = None, type: str | None = None, status: str | None = None, sort: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """The list as it is filtered, as a spreadsheet."""
    rows = await cd.everyone(db, _tenant(), q=q, kind=type, status=status, sort=sort)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Customer", "Type", "Contact", "Email", "Logins", "Orders", "Spent", "Joined", "Last order", "Status"])
    for r in rows:
        w.writerow([r["name"], r["kind"].title(), r["contact"] or "", r["email"] or "", r["logins"], r["orders"],
                    f"{r['spent']:.2f}", (r["joined"] or "")[:10], (r["last_order"] or "")[:10],
                    "No account" if r["status"] == "guest" else r["status"].title()])
    return Response(out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="customers.csv"'})


# ── A guest (no account: known by the address they ordered with) ─────────────

@router.get("/guest")
async def guest(email: str, db: AsyncSession = Depends(get_db)) -> dict:
    found = await cd.guest_profile(db, _tenant(), email)
    if not found:
        raise HTTPException(status_code=404, detail="No orders under that address.")
    return found


@router.get("/guest/orders")
async def guest_orders(email: str, page: int = Query(1, ge=1), db: AsyncSession = Depends(get_db)) -> dict:
    return await cd.orders_of(db, _tenant(), cd.guest_key(email), page=page)


# ── Adding an account ─────────────────────────────────────────────────────────

class AddCustomerIn(BaseModel):
    kind: Literal["retail", "wholesale"] = "retail"
    name: str = Field(..., min_length=1, max_length=255)
    first_name: str | None = Field(None, max_length=100)
    last_name: str | None = Field(None, max_length=100)
    email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    company_email: str | None = Field(None, max_length=255)
    website: str | None = Field(None, max_length=500)
    tax_id: str | None = Field(None, max_length=100)
    business_type: str | None = Field(None, max_length=100)
    address_line1: str | None = Field(None, max_length=255)
    address_line2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state_province: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)
    pricing_tier_id: UUID | None = None
    notes: str | None = None
    # Email the person a link to set their password and sign in.
    send_invite: bool = True


def _clean(v: str | None) -> str | None:
    v = (v or "").strip()
    return v or None


@router.post("", status_code=201)
async def add_customer(payload: AddCustomerIn, db: AsyncSession = Depends(get_db)) -> dict:
    """A new account, added by the shop: the company, and the person who signs
    in for it when there is an email address. A guest who already ordered under
    that address brings their orders with them, as activating their account
    does."""
    from app.models.company import Company, CompanyUser
    from app.models.user import User

    tid = _tenant()
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Give the customer a name.")
    if payload.kind == "wholesale" and not await _can(db, "wholesale_accounts"):
        raise HTTPException(status_code=403, detail="Wholesale accounts are part of the Wholesale plan.")
    tier = payload.pricing_tier_id if payload.kind == "wholesale" and await _can(db, "customer_tiers") else None

    email = (_clean(payload.email) or "").lower() or None
    user = None
    if email:
        if "@" not in email:
            raise HTTPException(status_code=422, detail="That email address is not complete.")
        user = (await db.execute(select(User).where(
            func.lower(User.email) == email, User.tenant_id == tid))).scalar_one_or_none()
        if user is not None:
            already = (await db.execute(text(
                "SELECT c.name FROM company_users cu JOIN companies c ON c.id = cu.company_id "
                "WHERE cu.user_id = CAST(:u AS uuid) AND cu.tenant_id = CAST(:t AS uuid) LIMIT 1"),
                {"u": str(user.id), "t": str(tid)})).scalar()
            if already:
                raise HTTPException(status_code=409, detail=f"{email} already signs in for {already}. Open that customer instead.")

    company = Company(
        name=name, status="active", tenant_id=tid,
        company_email=_clean(payload.company_email) or email, phone=_clean(payload.phone),
        website=_clean(payload.website), tax_id=_clean(payload.tax_id), business_type=_clean(payload.business_type),
        address_line1=_clean(payload.address_line1), address_line2=_clean(payload.address_line2),
        city=_clean(payload.city), state_province=_clean(payload.state_province),
        postal_code=_clean(payload.postal_code), country=_clean(payload.country),
        pricing_tier_id=tier, admin_notes=_clean(payload.notes),
    )
    db.add(company)
    await db.flush()

    if email:
        first = _clean(payload.first_name) or (name.split()[0] if name.split() else "")
        last = _clean(payload.last_name) or (" ".join(name.split()[1:]) if not payload.first_name else "")
        if user is None:
            user = User(email=email, first_name=first, last_name=last or "", phone=_clean(payload.phone),
                        account_type=payload.kind, hashed_password=None, is_active=True,
                        email_verified=False, tenant_id=tid)
            db.add(user)
            await db.flush()
        else:
            # The account a guest checkout opened for them, or one with no company.
            user.account_type = payload.kind
            user.is_active = True
            user.first_name = user.first_name or first
            user.last_name = user.last_name or last or ""
            user.activation_token = None
            user.activation_token_expires = None
        db.add(CompanyUser(company_id=company.id, user_id=user.id, role="owner", is_active=True, tenant_id=tid))
        # Their guest orders now belong to the account.
        await db.execute(text(
            "UPDATE orders SET company_id = CAST(:c AS uuid), placed_by_id = COALESCE(placed_by_id, CAST(:u AS uuid)) "
            "WHERE tenant_id = CAST(:t AS uuid) AND company_id IS NULL AND lower(trim(guest_email)) = :e"),
            {"c": str(company.id), "u": str(user.id), "t": str(tid), "e": email})
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="That email address already has an account here.")

    invited = False
    if email and payload.send_invite and user is not None and not user.hashed_password:
        invited = await _send_invite(db, user, company.name)
    return {"id": str(company.id), "invited": invited}


# ── One account ───────────────────────────────────────────────────────────────

@router.get("/{company_id}")
async def account(company_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    found = await cd.account_profile(db, _tenant(), company_id)
    if not found:
        raise HTTPException(status_code=404, detail="Customer not found")
    return found


@router.get("/{company_id}/orders")
async def account_orders(company_id: UUID, page: int = Query(1, ge=1), db: AsyncSession = Depends(get_db)) -> dict:
    return await cd.orders_of(db, _tenant(), str(company_id), page=page)


class EditIn(BaseModel):
    name: str | None = Field(None, max_length=255)
    trading_name: str | None = Field(None, max_length=255)
    company_email: str | None = Field(None, max_length=255)
    phone: str | None = Field(None, max_length=50)
    website: str | None = Field(None, max_length=500)
    tax_id: str | None = Field(None, max_length=100)
    business_type: str | None = Field(None, max_length=100)
    address_line1: str | None = Field(None, max_length=255)
    address_line2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state_province: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)
    notes: str | None = None
    tags: list[str] | None = None
    tax_exempt: bool | None = None


async def _company(db: AsyncSession, company_id: UUID):
    from app.models.company import Company

    c = (await db.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
    if c is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return c


@router.patch("/{company_id}")
async def edit(company_id: UUID, payload: EditIn, db: AsyncSession = Depends(get_db)) -> dict:
    """What the shop changes on an account that is not wholesale terms: its
    details, its notes, its tags and whether it pays tax. Pricing tiers and net
    terms are changed where the plan has them (/admin/companies)."""
    c = await _company(db, company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        if not (data["name"] or "").strip():
            raise HTTPException(status_code=422, detail="A customer needs a name.")
        c.name = data.pop("name").strip()
    if "notes" in data:
        c.admin_notes = (data.pop("notes") or "").strip() or None
    if "tags" in data:
        tags = []
        for t in data.pop("tags") or []:
            t = (t or "").strip()
            if t and t not in tags:
                tags.append(t[:60])
        c.tags = tags
        # A discount group is found by tag and remembered per company.
        try:
            from app.core.redis import redis_delete

            await redis_delete(f"company:{company_id}:discount_group_id")
        except Exception:
            pass
    if "tax_exempt" in data:
        c.tax_exempt = bool(data.pop("tax_exempt"))
    for field, value in data.items():
        setattr(c, field, _clean(value) if isinstance(value, str) or value is None else value)
    await db.commit()
    return await cd.account_profile(db, _tenant(), company_id)


class SuspendIn(BaseModel):
    reason: str | None = None


@router.post("/{company_id}/suspend")
async def suspend(company_id: UUID, payload: SuspendIn, db: AsyncSession = Depends(get_db)) -> dict:
    """Stop the account ordering. Its people cannot sign in until it is
    reactivated. The reason goes into the notes, which is the only place it is
    kept."""
    c = await _company(db, company_id)
    c.status = "suspended"
    reason = (payload.reason or "").strip()
    if reason:
        from datetime import UTC, datetime

        line = f"Suspended {datetime.now(UTC):%Y-%m-%d}: {reason}"
        c.admin_notes = f"{c.admin_notes}\n{line}" if c.admin_notes else line
    await db.commit()
    return await cd.account_profile(db, _tenant(), company_id)


@router.post("/{company_id}/reactivate")
async def reactivate(company_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    c = await _company(db, company_id)
    c.status = "active"
    await db.commit()
    return await cd.account_profile(db, _tenant(), company_id)


# ── Who signs in for an account ───────────────────────────────────────────────

class LoginIn(BaseModel):
    email: str = Field(..., max_length=255)
    first_name: str = Field("", max_length=100)
    last_name: str = Field("", max_length=100)
    role: str = "buyer"


async def _send_invite(db: AsyncSession, user, company_name: str) -> bool:
    """Email a person the link that sets their password, which is how they
    first sign in. No password travels in the mail. Best-effort: an invite that
    will not send leaves the login in place, and it can be sent again."""
    from app.core.config import settings
    from app.core.tenant_context import get_current_brand_name
    from app.services.email_service import EmailService

    token = secrets.token_urlsafe(32)
    try:
        await db.execute(text(
            "UPDATE users SET password_reset_token = :tok, "
            f"password_reset_expires = now() + interval '{INVITE_DAYS} days' WHERE id = CAST(:u AS uuid)"),
            {"tok": token, "u": str(user.id)})
        await db.commit()
        store = get_current_brand_name() or "our store"
        link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
        who = (user.first_name or "").strip() or "there"
        return bool(EmailService(db).send_raw(
            to_email=user.email,
            subject=f"Your account at {store}",
            body_html=(
                f"<h2>Welcome to {store}</h2>"
                f"<p>Hi {who},</p>"
                f"<p>{store} has opened an account for you"
                f"{'' if company_name == store else f' (<b>{company_name}</b>)'}. "
                "Choose a password to sign in and order:</p>"
                f"<p><a href=\"{link}\">Set your password</a></p>"
                f"<p style='color:#666;font-size:13px'>The link works for {INVITE_DAYS} days. "
                "After that, use “Forgot password” on the sign-in page.</p>"
            ),
        ))
    except Exception:
        logger.warning("Invite for %s did not go out", getattr(user, "email", "?"), exc_info=True)
        return False


@router.post("/{company_id}/logins", status_code=201)
async def add_login(company_id: UUID, payload: LoginIn, db: AsyncSession = Depends(get_db)) -> dict:
    """Give somebody a login for this account and email them how to sign in."""
    from app.models.company import CompanyUser
    from app.models.user import User

    tid = _tenant()
    c = await _company(db, company_id)
    email = (payload.email or "").strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=422, detail="Give an email address to send the invite to.")
    role = (payload.role or "buyer").strip().lower()
    if role not in ROLES:
        raise HTTPException(status_code=422, detail="Role must be owner, buyer, viewer or finance.")

    user = (await db.execute(select(User).where(func.lower(User.email) == email, User.tenant_id == tid))).scalar_one_or_none()
    if user is not None:
        other = (await db.execute(text(
            "SELECT c.name, (cu.company_id = CAST(:c AS uuid)) AS here FROM company_users cu "
            "JOIN companies c ON c.id = cu.company_id WHERE cu.user_id = CAST(:u AS uuid) LIMIT 1"),
            {"u": str(user.id), "c": str(company_id)})).mappings().first()
        if other:
            raise HTTPException(status_code=409, detail=(
                f"{email} already signs in for this account." if other["here"]
                else f"{email} already signs in for {other['name']}."))
        user.is_active = True
    else:
        # The account's own type: a retail account's people order as retail.
        head_type = (await db.execute(text(
            "SELECT u.account_type FROM company_users cu JOIN users u ON u.id = cu.user_id "
            "WHERE cu.company_id = CAST(:c AS uuid) ORDER BY (cu.role = 'owner') DESC LIMIT 1"),
            {"c": str(company_id)})).scalar() or "wholesale"
        user = User(email=email, first_name=(payload.first_name or "").strip(), last_name=(payload.last_name or "").strip(),
                    account_type=head_type, hashed_password=None, is_active=True, email_verified=False, tenant_id=tid)
        db.add(user)
        await db.flush()
    db.add(CompanyUser(company_id=company_id, user_id=user.id, role=role, is_active=True, tenant_id=tid))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="That person already signs in for this account.")
    invited = await _send_invite(db, user, c.name) if not user.hashed_password else False
    profile = await cd.account_profile(db, tid, company_id)
    return {**profile, "invited": invited}


class LoginChangeIn(BaseModel):
    active: bool | None = None
    role: str | None = None
    # Send the set-password link again.
    resend: bool = False


@router.patch("/{company_id}/logins/{user_id}")
async def change_login(company_id: UUID, user_id: UUID, payload: LoginChangeIn, db: AsyncSession = Depends(get_db)) -> dict:
    """Turn a login off or on, change what it may do, or send its invite again.
    The account always keeps one owner who can sign in."""
    from app.models.company import CompanyUser
    from app.models.user import User

    tid = _tenant()
    c = await _company(db, company_id)
    m = (await db.execute(select(CompanyUser).where(
        CompanyUser.company_id == company_id, CompanyUser.user_id == user_id))).scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=404, detail="That person does not sign in for this account.")
    role = (payload.role or "").strip().lower() or None
    if role and role not in ROLES:
        raise HTTPException(status_code=422, detail="Role must be owner, buyer, viewer or finance.")
    losing_owner = str(m.role) == "owner" and ((payload.active is False) or (role and role != "owner"))
    if losing_owner:
        owners = int((await db.execute(text(
            "SELECT count(*) FROM company_users WHERE company_id = CAST(:c AS uuid) AND role = 'owner' AND is_active"),
            {"c": str(company_id)})).scalar() or 0)
        if owners <= 1:
            raise HTTPException(status_code=409, detail="Make someone else the owner first: an account keeps one owner.")
    if payload.active is not None:
        m.is_active = payload.active
    if role:
        m.role = role
    await db.commit()
    invited = None
    if payload.resend:
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one()
        invited = await _send_invite(db, user, c.name)
    profile = await cd.account_profile(db, tid, company_id)
    return {**profile, "invited": invited}
