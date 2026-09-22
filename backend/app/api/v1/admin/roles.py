"""Custom roles (RBAC) — admin API.

Tenant admins define roles with an explicit scope set. Gated behind the "staff"
section (same as user management) by the path→scope map in core/permissions.py.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import (
    READ,
    ROLE_LABELS,
    ROLE_SCOPES,
    SCOPES,
    SENSITIVE_SCOPES,
    WRITE,
    normalise_scopes,
)
from app.middleware.auth_middleware import require_admin
from app.models.role import CustomRole
from app.models.user import User

router = APIRouter(prefix="/admin/roles", tags=["admin-roles"])

# Human labels for scopes (UI). Unknown scopes fall back to the key.
_SCOPE_LABELS = {
    "products": "Products", "collections": "Collections", "orders": "Orders",
    "customers": "Customers", "storefront": "Storefront", "media": "Media",
    "content": "Content", "inventory": "Inventory", "discounts": "Discounts",
    "staff": "Staff & roles", "settings": "Settings", "analytics": "Analytics",
    "billing": "Billing & disputes", "payouts": "Payment account & payouts",
    "audit": "Activity log",
}

# What each section actually lets somebody do, in the words the person setting
# it up would use. Shown beside the toggle so "Orders · can edit" is not a
# guess about what that means.
_SCOPE_HELP = {
    "products": ("See products, variants and prices",
                 "Create, edit and delete products and prices"),
    "collections": ("See collections and what is in them",
                    "Create, edit and delete collections and their rules"),
    "orders": ("See orders and their history",
               "Change status, ship, cancel, refund and edit orders"),
    "customers": ("See customers and companies",
                  "Add, edit and approve customers and companies"),
    "storefront": ("See the storefront setup", "Change branding, menus and pages"),
    "media": ("See the media library", "Upload and delete media"),
    "content": ("See blog posts and pages", "Write and publish content"),
    "inventory": ("See stock levels", "Adjust stock, warehouses and purchase orders"),
    "discounts": ("See discounts and pricing rules", "Create and change discounts"),
    "staff": ("See who has access", "Add, edit and remove staff and their permissions"),
    "settings": ("See store settings", "Change store settings, tax and shipping"),
    "analytics": ("See reports and analytics", "Run and export reports"),
    "billing": ("See invoices, refunds and disputes",
                "Issue refunds and respond to disputes"),
    "payouts": ("See the payment account and payouts",
                "Connect and change where money is paid out"),
    "audit": ("See the activity log", "Nothing extra — the log is never edited here"),
}


# A permission set is {section: "read"|"write"}. A plain list is still accepted
# so roles saved by the older screen keep working, and is read as "write on
# these sections" — except the sensitive ones, which a list never granted
# deliberately.
ScopeSet = dict[str, str] | list[str]


class RoleIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    scopes: ScopeSet = Field(default_factory=dict)
    read_only: bool = False


class RoleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    scopes: Optional[ScopeSet] = None
    read_only: Optional[bool] = None


def _row(r: CustomRole) -> dict:
    stored = r.scopes or {}
    return {
        "id": str(r.id), "name": r.name,
        # Always answered as levels, whatever is stored, so the screen has one
        # shape to render.
        "scopes": normalise_scopes(stored, r.read_only),
        "read_only": r.read_only,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _validate_scopes(scopes) -> dict[str, str]:
    """Check a permission set and return it as levels.

    Refuses an unknown section rather than dropping it: a typo that silently
    granted nothing would look like a permission that had been set.
    """
    if isinstance(scopes, dict):
        bad = [s for s in scopes if s not in SCOPES]
        if bad:
            raise HTTPException(status_code=400, detail=f"Unknown section(s): {', '.join(bad)}")
        bad_levels = [f"{k}={v}" for k, v in scopes.items() if str(v).lower() not in (READ, WRITE)]
        if bad_levels:
            raise HTTPException(
                status_code=400,
                detail=f"A permission is either \"read\" or \"write\": {', '.join(bad_levels)}",
            )
        return {k: str(v).lower() for k, v in scopes.items()}

    bad = [s for s in (scopes or []) if s not in SCOPES]
    if bad:
        raise HTTPException(status_code=400, detail=f"Unknown section(s): {', '.join(bad)}")
    return normalise_scopes(list(scopes or []))


async def _forget_role_holders(db: AsyncSession, role_id) -> None:
    """Drop the cached permissions of everyone on this role.

    Editing a role has to take effect now. Without this the change would sit
    behind the middleware's short cache, and an admin who had just removed
    somebody's access would watch them keep using it.
    """
    from sqlalchemy import text as _text

    from app.middleware.auth_middleware import forget_permissions

    rows = (await db.execute(
        _text("SELECT id FROM users WHERE custom_role_id = CAST(:r AS uuid)"),
        {"r": str(role_id)},
    )).scalars().all()
    for user_id in rows:
        forget_permissions(user_id)


@router.get("/scopes")
async def list_scopes(_: None = Depends(require_admin)) -> dict:
    """Scope catalog + the fixed roles, for the builder UI."""
    return {
        "scopes": [
            {
                "key": s,
                "label": _SCOPE_LABELS.get(s, s),
                "sensitive": s in SENSITIVE_SCOPES,
                "read_means": _SCOPE_HELP.get(s, ("View only", "Full control"))[0],
                "write_means": _SCOPE_HELP.get(s, ("View only", "Full control"))[1],
            }
            for s in sorted(SCOPES)
        ],
        "fixed_roles": [{"key": k, "label": ROLE_LABELS[k], "scopes": sorted(ROLE_SCOPES.get(k, set()))}
                        for k in ROLE_LABELS],
        "levels": [READ, WRITE],
    }


@router.get("")
async def list_roles(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = await db.execute(select(CustomRole).order_by(CustomRole.name))
    return [_row(r) for r in rows.scalars().all()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_role(payload: RoleIn, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    # Store what the check returned, not what arrived: a role saved as a plain
    # list would otherwise keep being re-interpreted on every read.
    role = CustomRole(
        name=payload.name,
        scopes=_validate_scopes(payload.scopes),
        read_only=payload.read_only,
    )
    db.add(role)
    await db.flush()
    return _row(role)


@router.patch("/{role_id}")
async def update_role(role_id: uuid.UUID, payload: RoleUpdate, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    role = (await db.execute(select(CustomRole).where(CustomRole.id == role_id))).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    changes = payload.model_dump(exclude_unset=True)
    if payload.scopes is not None:
        changes["scopes"] = _validate_scopes(payload.scopes)
    for k, v in changes.items():
        setattr(role, k, v)
    await db.flush()
    await _forget_role_holders(db, role.id)
    return _row(role)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(role_id: uuid.UUID, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> None:
    role = (await db.execute(select(CustomRole).where(CustomRole.id == role_id))).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    # Detach any users on this role so they fall back to a safe fixed role.
    for u in (await db.execute(select(User).where(User.custom_role_id == role_id))).scalars().all():
        u.custom_role_id = None
        if u.role == "tenant_custom":
            u.role = "tenant_viewer"  # safe fallback
    await db.delete(role)
