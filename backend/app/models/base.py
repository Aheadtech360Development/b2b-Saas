"""Base SQLAlchemy model with UUID primary key and audit timestamps."""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column


class Base(DeclarativeBase):
    """Declarative base for all models."""


class TimestampMixin:
    """Mixin that adds created_at and updated_at to any model."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class UUIDMixin:
    """Mixin that adds a UUID primary key."""

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )


class BaseModel(UUIDMixin, TimestampMixin, Base):
    """Abstract base model with UUID PK + timestamps. All entities inherit this."""

    __abstract__ = True

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} id={self.id}>"


class TenantMixin:
    """
    Mixin that scopes a model to a single tenant (brand).

    Any model that includes this mixin is automatically:
      • filtered to the current tenant on every SELECT
      • stamped with the current tenant_id on every INSERT
    …by the centralized SQLAlchemy events in app.core.tenant_scope.

    tenant_id is nullable so that (a) existing rows can be backfilled safely and
    (b) platform-level operations can bypass scoping. The event layer enforces
    isolation at runtime; the column NULLability is only about migration safety.
    """

    @declared_attr
    def tenant_id(cls) -> Mapped[uuid.UUID | None]:
        # Plain UUID column (no ORM-level ForeignKey) — the `tenants` table has no
        # ORM model, so the FK constraint is added at the DB level in the migration.
        return mapped_column(
            PGUUID(as_uuid=True),
            nullable=True,
            index=True,
        )
