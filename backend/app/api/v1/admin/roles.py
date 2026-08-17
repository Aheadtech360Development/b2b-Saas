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
from app.core.permissions import ROLE_LABELS, ROLE_SCOPES, SCOPES
from app.middleware.auth_middleware import require_admin
from app.models.role import CustomRole
from app.models.user import User

router = APIRouter(prefix="/admin/roles", tags=["admin-roles"])

# Human labels for scopes (UI). Unknown scopes fall back to the key.
_SCOPE_LABELS = {
    "products": "Products", "orders": "Orders", "customers": "Customers",
    "storefront": "Storefront", "media": "Media", "content": "Content",
    "inventory": "Inventory", "discounts": "Discounts", "staff": "Staff & roles",
    "settings": "Settings", "analytics": "Analytics",
}


class RoleIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    scopes: list[str] = Field(default_factory=list)
    read_only: bool = False


class RoleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    scopes: Optional[list[str]] = None
    read_only: Optional[bool] = None


def _row(r: CustomRole) -> dict:
    return {"id": str(r.id), "name": r.name, "scopes": r.scopes or [], "read_only": r.read_only,
            "created_at": r.created_at.isoformat() if r.created_at else None}


def _validate_scopes(scopes: list[str]) -> None:
    bad = [s for s in scopes if s not in SCOPES]
    if bad:
        raise HTTPException(status_code=400, detail=f"Unknown scope(s): {', '.join(bad)}")


@router.get("/scopes")
async def list_scopes(_: None = Depends(require_admin)) -> dict:
    """Scope catalog + the fixed roles, for the builder UI."""
    return {
        "scopes": [{"key": s, "label": _SCOPE_LABELS.get(s, s)} for s in sorted(SCOPES)],
        "fixed_roles": [{"key": k, "label": ROLE_LABELS[k], "scopes": sorted(ROLE_SCOPES.get(k, set()))}
                        for k in ROLE_LABELS],
    }


@router.get("")
async def list_roles(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = await db.execute(select(CustomRole).order_by(CustomRole.name))
    return [_row(r) for r in rows.scalars().all()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_role(payload: RoleIn, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    _validate_scopes(payload.scopes)
    role = CustomRole(name=payload.name, scopes=payload.scopes, read_only=payload.read_only)
    db.add(role)
    await db.flush()
    return _row(role)


@router.patch("/{role_id}")
async def update_role(role_id: uuid.UUID, payload: RoleUpdate, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    role = (await db.execute(select(CustomRole).where(CustomRole.id == role_id))).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if payload.scopes is not None:
        _validate_scopes(payload.scopes)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(role, k, v)
    await db.flush()
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
