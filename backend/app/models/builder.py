"""The visual website builder's storage. See migration 0056.

Kept apart from BrandTheme on purpose. That model is how imported-HTML
storefronts render, and nothing in the builder reads or writes it — a brand
moves to the builder only by an explicit switch, and can switch back.
"""
import uuid

from sqlalchemy import ForeignKey, Integer, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, TenantMixin

RENDER_LEGACY = "legacy"
RENDER_BUILDER = "visual_builder"
RENDER_MODES = (RENDER_LEGACY, RENDER_BUILDER)


class BuilderSite(TenantMixin, BaseModel):
    """One per brand: its draft, and which published version is live."""

    __tablename__ = "builder_sites"

    render_mode: Mapped[str] = mapped_column(String(20), default=RENDER_LEGACY, nullable=False)
    # The working copy. The storefront never reads it.
    draft: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    draft_revision: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    published_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("builder_versions.id", ondelete="SET NULL"), nullable=True,
    )


class BuilderVersion(TenantMixin, BaseModel):
    """An immutable snapshot of the site, written once, at publish."""

    __tablename__ = "builder_versions"

    site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("builder_sites.id", ondelete="CASCADE"), nullable=False,
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    document: Mapped[dict] = mapped_column(JSONB, nullable=False)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    published_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )


class BuilderFont(TenantMixin, BaseModel):
    """A font file this brand uploaded. Other brands cannot see it."""

    __tablename__ = "builder_fonts"

    family: Mapped[str] = mapped_column(String(80), nullable=False)
    weight: Mapped[int] = mapped_column(SmallInteger, default=400, nullable=False)
    style: Mapped[str] = mapped_column(String(10), default="normal", nullable=False)
    format: Mapped[str] = mapped_column(String(10), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)


__all__ = [
    "BuilderSite", "BuilderVersion", "BuilderFont",
    "RENDER_LEGACY", "RENDER_BUILDER", "RENDER_MODES",
]
