"""Product templates — what goes around the standard product information.

See migration 0047 for the storage and services/product_templates.py for the
layout rules (which blocks exist, which can't be removed, how a product's
template is chosen).
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, TenantMixin


class ProductTemplate(TenantMixin, BaseModel):
    __tablename__ = "product_templates"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # {"blocks": [...], "sections": [...]} — the editor's copy.
    draft: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    # The shoppers' copy; None until the first Publish.
    published: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
