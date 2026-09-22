"""A brand's website theme — the design it runs on, and what its admin edited.

See migration 0048, services/theme_import.py (HTML → definition) and
services/theme_render.py (definition + values → the page a shopper gets).
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, TenantMixin


class BrandTheme(TenantMixin, BaseModel):
    __tablename__ = "brand_themes"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    # The parsed design: pages → sections → editable fields.
    definition: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    # The customizer's copy: {"pages": {"home": {"order": [...], "hidden": [...],
    # "values": {section_id: {field_key: value}}}}}
    draft: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    # What shoppers see; None until the first Publish.
    published: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
