# backend/app/api/v1/admin/users.py
"""Admin user management — list, create, update, delete, reset password."""
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import hash_password
from app.core.tenant_context import get_current_tenant_id
from app.models.company import CompanyUser, Company
from app.models.user import User

router = APIRouter(prefix="/admin/users", tags=["admin", "users"])

# Frontend role <-> DB role mapping (5 fixed roles + legacy aliases)
_ROLE_TO_DB = {
    "administrator": "tenant_admin",
    "manager": "tenant_manager",
    "editor": "tenant_editor",
    "order_manager": "tenant_fulfillment",
    "viewer": "tenant_viewer",
    # legacy aliases
    "admin": "tenant_admin", "staff": "tenant_editor", "customer": "buyer",
}
_DB_TO_UI = {
    "tenant_admin": "administrator", "platform_admin": "administrator",
    "tenant_manager": "manager", "tenant_editor": "editor",
    "tenant_fulfillment": "order_manager", "tenant_viewer": "viewer",
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
        "is_admin": user.is_admin,
        "is_active": user.is_active,
        "email_verified": user.email_verified,
        "company_name": company_name,
        "last_login": user.last_login.isoformat() if user.last_login else None,
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
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    query = _base_query()

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


@router.post("", status_code=201)
async def create_user(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    email: str = (payload.get("email") or "").strip().lower()
    first_name: str = (payload.get("first_name") or "").strip()
    last_name: str = (payload.get("last_name") or "").strip()
    role: str = payload.get("role", "staff")
    send_welcome: bool = bool(payload.get("send_welcome_email", False))

    if not email or not first_name:
        raise HTTPException(status_code=422, detail="email and first_name are required")

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A user with this email already exists")

    raw_password: str = payload.get("password") or secrets.token_urlsafe(12)
    db_role = _ROLE_TO_DB.get(role, "tenant_editor")

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
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    if send_welcome:
        try:
            from app.services.email_service import EmailService
            svc = EmailService(db)
            svc.send_raw(
                to_email=email,
                subject="Your staff account is ready",
                body_html=f"""
                <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
                  <div style="padding:32px;background:#fff;border:1px solid #eee">
                    <h2 style="color:#2A2830;margin:0 0 16px">Welcome, {first_name}!</h2>
                    <p style="color:#374151;font-size:14px;line-height:1.7">A staff account has been created for you.</p>
                    <p style="color:#374151;font-size:14px"><b>Email:</b> {email}<br>
                    <b>Temporary password:</b> {raw_password}</p>
                    <p style="color:#374151;font-size:14px">Please log in and change your password.</p>
                  </div>
                </div>
                """,
            )
        except Exception:
            pass  # non-fatal

    # Reload with relationships
    result = await db.execute(_base_query().where(User.id == user.id))
    user = result.scalar_one()
    return _user_to_dict(user)


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
            conflict = await db.execute(select(User).where(User.email == new_email))
            if conflict.scalar_one_or_none():
                raise HTTPException(status_code=409, detail="Email already in use")
            user.email = new_email
    if "role" in payload:
        user.role = _ROLE_TO_DB.get(payload["role"], "tenant_editor")
        user.is_admin = (user.role != "buyer")
    if "is_active" in payload:
        user.is_active = bool(payload["is_active"])

    await db.commit()

    result = await db.execute(_base_query().where(User.id == user.id))
    user = result.scalar_one()
    return _user_to_dict(user)


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    _tid = get_current_tenant_id()
    q = select(User).where(User.id == user_id)
    if _tid is not None:
        q = q.where(User.tenant_id == _tid)
    result = await db.execute(q)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()


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
    await svc.send_password_reset(user.email)
