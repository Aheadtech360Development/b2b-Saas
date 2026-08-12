"""Customer Segments — admin API.

Thin controllers over the shared filter engine. Preview (unsaved definition) and
saved segments run through the exact same `segment_engine.build_query`, so what
the builder previews is what the saved segment returns.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth_middleware import require_admin
from app.models.company import Company
from app.models.segment import CustomerSegment
from app.services import segment_engine
from app.services.metrics_service import recompute_company_metrics

router = APIRouter(prefix="/admin/segments", tags=["admin-segments"])


# ── Schemas ──────────────────────────────────────────────────────────────────
class SegmentIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    definition: dict = Field(default_factory=dict)


class SegmentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    definition: Optional[dict] = None


class PreviewIn(BaseModel):
    definition: dict = Field(default_factory=dict)
    limit: int = Field(default=25, ge=1, le=100)


def _row(s: CustomerSegment) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "description": s.description,
        "definition": s.definition or {},
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


def _validate(definition: dict) -> None:
    """Fail fast on an unknown field/operator instead of saving a broken segment."""
    try:
        segment_engine.build_condition(definition)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Field catalog (drives the UI builder) ────────────────────────────────────
@router.get("/fields")
async def list_fields(_: None = Depends(require_admin)) -> dict:
    return {
        "fields": [{"field": f, "type": spec["type"], "operators": segment_engine.OPERATORS[spec["type"]]}
                   for f, spec in segment_engine.FIELDS.items()],
        "operators": segment_engine.OPERATORS,
    }


# ── Preview (unsaved definition) — same engine as saved ──────────────────────
@router.post("/preview")
async def preview(payload: PreviewIn, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    _validate(payload.definition)
    count = await segment_engine.count_matches(db, payload.definition)
    sample = await segment_engine.sample_matches(db, payload.definition, limit=payload.limit)
    return {"count": count, "sample": sample}


# ── CRUD ─────────────────────────────────────────────────────────────────────
@router.get("")
async def list_segments(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = await db.execute(select(CustomerSegment).order_by(CustomerSegment.created_at.desc()))
    return [_row(s) for s in rows.scalars().all()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_segment(payload: SegmentIn, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    _validate(payload.definition)
    seg = CustomerSegment(name=payload.name, description=payload.description, definition=payload.definition or {})
    db.add(seg)
    await db.flush()
    return _row(seg)


@router.get("/{segment_id}")
async def get_segment(segment_id: uuid.UUID, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    seg = (await db.execute(select(CustomerSegment).where(CustomerSegment.id == segment_id))).scalar_one_or_none()
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    data = _row(seg)
    data["count"] = await segment_engine.count_matches(db, seg.definition)
    return data


@router.patch("/{segment_id}")
async def update_segment(segment_id: uuid.UUID, payload: SegmentUpdate, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    seg = (await db.execute(select(CustomerSegment).where(CustomerSegment.id == segment_id))).scalar_one_or_none()
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    if payload.definition is not None:
        _validate(payload.definition)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(seg, k, v)
    await db.flush()
    return _row(seg)


@router.delete("/{segment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_segment(segment_id: uuid.UUID, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> None:
    seg = (await db.execute(select(CustomerSegment).where(CustomerSegment.id == segment_id))).scalar_one_or_none()
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    await db.delete(seg)


@router.post("/{segment_id}/duplicate", status_code=status.HTTP_201_CREATED)
async def duplicate_segment(segment_id: uuid.UUID, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    seg = (await db.execute(select(CustomerSegment).where(CustomerSegment.id == segment_id))).scalar_one_or_none()
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    copy = CustomerSegment(name=f"{seg.name} (copy)", description=seg.description, definition=seg.definition or {})
    db.add(copy)
    await db.flush()
    return _row(copy)


# ── Members (paginated) ──────────────────────────────────────────────────────
@router.get("/{segment_id}/members")
async def segment_members(
    segment_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    seg = (await db.execute(select(CustomerSegment).where(CustomerSegment.id == segment_id))).scalar_one_or_none()
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    total = await segment_engine.count_matches(db, seg.definition)
    items = await segment_engine.sample_matches(db, seg.definition, limit=page_size, offset=(page - 1) * page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": items}


# ── Metrics backfill (initial rollout / manual refresh) ──────────────────────
@router.post("/metrics/recompute-all")
async def recompute_all_metrics(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    """Rebuild every company's metrics for this tenant. Safe to re-run; intended
    for first rollout or a manual refresh — ongoing updates are event-driven."""
    company_ids = (await db.execute(select(Company.id))).scalars().all()
    for cid in company_ids:
        await recompute_company_metrics(db, cid)
    return {"recomputed": len(company_ids)}
