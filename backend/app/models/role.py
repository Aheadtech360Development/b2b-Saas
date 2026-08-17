"""Custom RBAC roles — tenant-defined permission sets.

A brand can create roles beyond the 5 fixed ones (e.g. "Sales rep" = orders +
customers only). `scopes` is a subset of app.core.permissions.SCOPES; `read_only`
makes the role view-only across its scopes. Assigned to a user via
users.custom_role_id; enforcement stays centralized in permissions.can_access.
"""
from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, TenantMixin


class CustomRole(TenantMixin, BaseModel):
    __tablename__ = "custom_roles"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    scopes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    read_only: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
