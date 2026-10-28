"""A parcel of an order, and where it has been (migration 0068_retail_shipments).

An order has none, one or several. The tracking page shows one timeline per
shipment; `services/shipments.py` writes them and keeps `orders.tracking_*`
in step for everything that still reads the order's own fields.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, TenantMixin


class Shipment(TenantMixin, BaseModel):
    __tablename__ = "shipments"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    carrier: Mapped[str | None] = mapped_column(String(100))
    service: Mapped[str | None] = mapped_column(String(100))
    tracking_number: Mapped[str] = mapped_column(String(255), nullable=False)
    tracking_url: Mapped[str | None] = mapped_column(Text)
    # label_created | in_transit | out_for_delivery | delivered | returned | failure | unknown
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="label_created")
    # courier (reported) | manual (set by the shop)
    status_source: Mapped[str] = mapped_column(String(10), nullable=False, default="courier")
    status_detail: Mapped[str | None] = mapped_column(String(500))
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # When the tracking loop next asks the courier; None once there is no point.
    next_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    events: Mapped[list["ShipmentEvent"]] = relationship(
        "ShipmentEvent", back_populates="shipment", cascade="all, delete-orphan",
        order_by="ShipmentEvent.occurred_at",
    )


class ShipmentEvent(TenantMixin, BaseModel):
    __tablename__ = "shipment_events"

    shipment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    source: Mapped[str] = mapped_column(String(10), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    shipment: Mapped["Shipment"] = relationship("Shipment", back_populates="events")
