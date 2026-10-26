# backend/app/api/v1/admin/users.py
"""Admin user management — list, create, update, delete, reset password."""
import logging
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import hash_password
from app.core.tenant_context import get_current_tenant_id
from app.models.company import CompanyUser, Company
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/users", tags=["admin", "users"])

# Frontend role <-> DB role mapping (5 fixed roles + legacy aliases)
_ROLE_TO_DB = {
    "administrator": "tenant_admin",
    "manager": "tenant_manager",
    "editor": "tenant_editor",
    "order_manager": "tenant_fulfillment",
    "viewer": "tenant_viewer",
    "production": "tenant_production",
    # legacy aliases
    "admin": "tenant_admin", "staff": "tenant_editor", "customer": "buyer",
}
_DB_TO_UI = {
    "tenant_admin": "administrator", "platform_admin": "administrator",
    "tenant_manager": "manager", "tenant_editor": "editor",
    "tenant_fulfillment": "order_manager", "tenant_viewer": "viewer",
    "tenant_production": "production",
    "tenant_staff": "editor", "buyer": "customer",
}


def _db_role_to_ui(role: str, is_admin: bool) -> str:
    if role in _DB_TO_UI:
        return _DB_TO_UI[role]
    return "administrator" if is_admin else "customer"


def _user_to_dict(user: User) -> dict:
    role = _db_role_to_ui(getattr(user, "role", "") or "", user.is_admin)

    company_name: str | None = None
    if user.company_memberships:
        first = user.company_memberships[0]
        if first.company:
            company_name = first.company.name

    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": f"{user.first_name} {user.last_name}".strip(),
        "role": role,
        "custom_role_id": str(user.custom_role_id) if getattr(user, "custom_role_id", None) else None,
        "is_admin": user.is_admin,
        "is_active": user.is_active,
        "email_verified": user.email_verified,
        "company_name": company_name,
        "last_login": user.last_login.isoformat() if user.last_login else None,
        # Whether a second step guards their sign-in, and whether they are
        # still to set a password from the invite they were sent.
        "two_factor": bool(getattr(user, "two_factor_enabled", False)),
        "invited": user.last_login is None and bool(getattr(user, "password_reset_token", None)),
        "created_at": user.created_at.isoformat() if hasattr(user, "created_at") and user.created_at else None,
    }


def _base_query():
    return select(User).options(
        selectinload(User.company_memberships).selectinload(CompanyUser.company)
    )


@router.get("")
async def list_users(
    q: str | None = None,
    role: str | None = None,
    status: str | None = None,
    staff_only: bool = Query(False, description="Leave buyers out: they are listed under Customers"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    query = _base_query()
    if staff_only:
        query = query.where(User.role != "buyer")

    # Tenant isolation: a brand admin only sees their own tenant's users.
    _tid = get_current_tenant_id()
    if _tid is not None:
        query = query.where(User.tenant_id == _tid)

    if q:
        query = query.where(
            or_(
                User.first_name.ilike(f"%{q}%"),
                User.last_name.ilike(f"%{q}%"),
                User.email.ilike(f"%{q}%"),
            )
        )

    if role and role in _ROLE_TO_DB:
        query = query.where(User.role == _ROLE_TO_DB[role])

    if status == "active":
        query = query.where(User.is_active.is_(True))
    elif status == "inactive":
        query = query.where(User.is_active.is_(False))

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar_one()

    query = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    return {"items": [_user_to_dict(u) for u in users], "total": total}


INVITE_DAYS = 3


async def _send_staff_invite(db: AsyncSession, user: User) -> bool:
    """Email a team member the link that sets their password, which is how
    they first sign in. No password travels in the mail. Best-effort: an invite
    that will not send leaves the account in place, and it can be sent again.

    The link opens on the shop's own address, and the mail is in its name.
    """

    from app.core.config import settings
    from app.core.permissions import ROLE_LABELS
    from app.core.tenant_context import get_current_brand_name
    from app.services.email_service import EmailService

    token = secrets.token_urlsafe(32)
    try:
        # On the person, not beside them: the answer that follows reads the same
        # object, and has to say they are invited.
        from datetime import datetime, timedelta, timezone

        user.password_reset_token = token
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(days=INVITE_DAYS)
        await db.commit()
        path = f"/reset-password?token={token}"
        try:
            from app.services import brand_urls

            link = await brand_urls.for_tenant(db, user.tenant_id, path)
        except Exception:
            link = f"{settings.FRONTEND_URL.rstrip('/')}{path}"
        store = get_current_brand_name() or "our store"
        role = "a custom role" if getattr(user, "custom_role_id", None) else ROLE_LABELS.get(user.role or "", "a team member")
        # The design's team invite (services/mails.team_invite), in
        # PrintCoPilot's card: an account on the platform, opened by a link.
        from app.services import mails

        subject, html = mails.team_invite(shop=store, role=role, accept_url=link, valid_days=INVITE_DAYS)
        return bool(EmailService(db).send_raw(to_email=user.email, subject=subject, body_html=html))
    except Exception:
        logger.warning("Staff invite for %s did not go out", getattr(user, "email", "?"), exc_info=True)
        return False


def _taken_message(owner: dict, email: str) -> str:
    """What to tell an admin whose new user's email is already in use."""
    from app.core.tenant_context import get_current_tenant_id

    here = get_current_tenant_id()
    theirs = owner.get("tenant_id")
    name = " ".join(x for x in (owner.get("first_name"), owner.get("last_name")) if x).strip()
    who = f"{name} ({email})" if name else email

    if owner.get("is_platform_admin"):
        return (
            f"{email} is the platform's own admin account, which cannot also be a "
            "user of a shop. Use a different address."
        )
    if here is not None and theirs is not None and str(theirs) == str(here):
        if (owner.get("role") or "") == "buyer":
            return (
                f"{who} is already a customer of your shop, and one address cannot be "
                "both a customer and a staff login. Add this person with a different "
                "address, or change theirs on the customer record first."
            )
        if not owner.get("is_active"):
            return (
                f"{who} is already a user of your shop but is deactivated. Reactivate "
                "them from the list instead of adding them again."
            )
        return f"{who} is already a user of your shop."
    # email_owner only looks at this shop (one account per address per shop),
    # so this is somebody here the branches above did not name.
    return f"{email} already has an account here. Add this person with a different address."

@router.post("", status_code=201)
async def create_user(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    email: str = (payload.get("email") or "").strip().lower()
    first_name: str = (payload.get("first_name") or "").strip()
    last_name: str = (payload.get("last_name") or "").strip()
    role: str = payload.get("role", "staff")

    if not email or not first_name:
        raise HTTPException(status_code=422, detail="email and first_name are required")

    from app.core.database import email_owner

    # "That email is taken" is not something an admin can act on, so the
    # answer says which case it is — their own staff, or their own customer.
    # Only this shop is asked: an address can have an account at every shop.
    owner = await email_owner(email)
    if owner:
        raise HTTPException(status_code=409, detail=_taken_message(owner, email))

    # Nobody types a password for somebody else. The account is made with one
    # no one knows, and the person sets their own from the link they are sent.
    raw_password: str = secrets.token_urlsafe(24)
    custom_role_id = payload.get("custom_role_id")
    db_role = "tenant_custom" if custom_role_id else _ROLE_TO_DB.get(role, "tenant_editor")

    user = User(
        email=email,
        first_name=first_name,
        last_name=last_name,
        hashed_password=hash_password(raw_password),
        tenant_id=get_current_tenant_id(),
        role=db_role,
        is_admin=(db_role != "buyer"),  # all staff roles access the admin panel
        is_active=True,
        email_verified=True,
        custom_role_id=UUID(str(custom_role_id)) if custom_role_id else None,
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="This email address already has an account. Use a different address, or ask that person to sign in with it.")
    await db.refresh(user)

    invited = await _send_staff_invite(db, user)

    # Reload with relationships
    result = await db.execute(_base_query().where(User.id == user.id))
    user = result.scalar_one()
    return {**_user_to_dict(user), "invite_sent": invited}


@router.post("/{user_id}/invite")
async def invite_user_again(user_id: UUID, db: AsyncSession = Depends(get_db)) -> dict:
    """Send the set-password link again, to somebody who has not signed in yet
    or whose link ran out."""
    _tid = get_current_tenant_id()
    q = select(User).where(User.id == user_id, User.role != "buyer")
    if _tid is not None:
        q = q.where(User.tenant_id == _tid)
    user = (await db.execute(q)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not await _send_staff_invite(db, user):
        raise HTTPException(status_code=502, detail="The invite could not be sent. Check your shop's email under Settings, then try again.")
    return {"invite_sent": True}


@router.patch("/{user_id}")
async def update_user(
    user_id: UUID,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    _tid = get_current_tenant_id()
    q = _base_query().where(User.id == user_id)
    if _tid is not None:
        q = q.where(User.tenant_id == _tid)
    result = await db.execute(q)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if "first_name" in payload and payload["first_name"]:
        user.first_name = payload["first_name"].strip()
    if "last_name" in payload:
        user.last_name = (payload["last_name"] or "").strip()
    if "email" in payload and payload["email"]:
        new_email = payload["email"].strip().lower()
        if new_email != user.email:
            # At this shop: the same address may have an account at another.
            conflict = await db.execute(
                select(User).where(User.email == new_email, User.tenant_id == user.tenant_id, User.id != user.id)
            )
            if conflict.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Email already in use")
            user.email = new_email
    if "role" in payload:
        user.role = _ROLE_TO_DB.get(payload["role"], "tenant_editor")
        user.is_admin = (user.role != "buyer")
    # Custom role wins when provided; null clears it back to the fixed role.
    if "custom_role_id" in payload:
        cr = payload["custom_role_id"]
        if cr:
            user.custom_role_id = UUID(str(cr))
            user.role = "tenant_custom"
            user.is_admin = True
        else:
            user.custom_role_id = None
            if user.role == "tenant_custom":
                user.role = _ROLE_TO_DB.get(payload.get("role", "editor"), "tenant_editor")
                user.is_admin = True
    if "is_active" in payload:
        user.is_active = bool(payload["is_active"])

    await db.commit()

    result = await db.execute(_base_query().where(User.id == user.id))
    user = result.scalar_one()
    return _user_to_dict(user)


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Remove a person from the shop, or say exactly why they can't be.

    Orders and returns are the shop's books and keep the account they came
    from, so somebody with either is not deleted: they are deactivated, or the
    shop's test data is cleared first. What is only theirs — messages they
    sent, carts they saved, price lists they asked for — goes with them.

    This used to hand the database's refusal straight back as a bare 500, which
    the page showed as a Delete button that did nothing.
    """
    _tid = get_current_tenant_id()
    q = select(User).where(User.id == user_id)
    if _tid is not None:
        q = q.where(User.tenant_id == _tid)
    result = await db.execute(q)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Read now: after a refused delete the row can no longer be read without a query.
    name = user.full_name.strip() or user.email
    if str(getattr(request.state, "user_id", "") or "") == str(user.id):
        raise HTTPException(status_code=409, detail="You can't delete the account you are signed in with.")

    from sqlalchemy import delete as sa_delete

    from app.models.communication import Message
    from app.models.order import Order, OrderTemplate
    from app.models.rma import RMARequest
    from app.models.system import PriceListRequest

    orders = (await db.execute(
        select(func.count()).select_from(Order).where(Order.placed_by_id == user.id)
    )).scalar() or 0
    returns = (await db.execute(
        select(func.count()).select_from(RMARequest).where(RMARequest.submitted_by_id == user.id)
    )).scalar() or 0
    if orders or returns:
        has = " and ".join(part for part in (
            f"{orders} order{'' if orders == 1 else 's'}" if orders else "",
            f"{returns} return{'' if returns == 1 else 's'}" if returns else "",
        ) if part)
        raise HTTPException(status_code=409, detail=(
            f"{name} has {has} on record, so the account can't be deleted. Deactivate it instead. "
            "If these were test orders, clear the shop's test data first, then delete."
        ))

    try:
        for model, column in (
            (Message, Message.sender_id),
            (OrderTemplate, OrderTemplate.created_by_id),
            (PriceListRequest, PriceListRequest.requested_by_id),
        ):
            await db.execute(sa_delete(model).where(column == user.id))
        await db.delete(user)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        # Something else still points at them. Named, when the database names it.
        cause = getattr(exc.orig, "__cause__", None) or exc.orig
        held = str(getattr(cause, "table_name", "") or "").replace("_", " ") or "other records"
        raise HTTPException(status_code=409, detail=(
            f"{name} is still used by {held}, so the account can't be deleted. Deactivate it instead."
        ))
    except DBAPIError:
        await db.rollback()
        # The database refused for a reason of its own — a rule on a table that
        # pointed at them, as the activity log's once did (migration 0059).
        # Said, and logged in full, rather than handed back as a bare 500.
        logger.exception("Deleting user %s was refused by the database", user_id)
        raise HTTPException(status_code=409, detail=(
            f"{name} couldn't be deleted: the database refused it. Deactivate the account instead."
        ))


@router.post("/{user_id}/reset-password", status_code=204)
async def reset_user_password(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    from app.services.auth_service import AuthService
    svc = AuthService(db)
    # This brand's account, by its brand: an address can have an account at
    # several shops (migration 0058), and asked without one the lookup picks
    # the platform's admin first, then the oldest, which may be somebody else's.
    await svc.send_password_reset(user.email, user.tenant_id)
