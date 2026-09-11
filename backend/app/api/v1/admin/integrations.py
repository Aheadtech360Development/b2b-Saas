"""Admin API — connect a brand's own suppliers and shipping carriers.

Generic on purpose: the provider registry describes what each one needs, so this
file never mentions a specific carrier or supplier. Adding one is a registry
entry in `integrations_service`, and both this API and the admin screen pick it
up with no further changes.

Secrets go in but never come back out — a saved secret is returned only as a
hint ("••••a1b2"), and leaving a secret field blank on re-save keeps the stored
value.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import get_current_tenant_id
from app.middleware.auth_middleware import require_admin
from app.services import integrations_service as svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/integrations", tags=["admin", "integrations"])


class ConnectRequest(BaseModel):
    values: dict[str, str] = Field(default_factory=dict)
    # Save even when the live test fails — useful when a carrier is briefly down
    # and the admin knows the credentials are right.
    force: bool = False


@router.get("")
async def list_integrations(
    category: str | None = Query(None, description="'supplier' or 'carrier'"),
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Every provider with this brand's connection state."""
    tid = get_current_tenant_id()
    providers = await svc.list_connections(db, tenant_id=tid, category=category)
    return {
        "providers": providers,
        "connected_count": sum(1 for p in providers if p["connection"].get("connected")),
    }


@router.post("/{provider}/test")
async def test_integration(
    provider: str,
    payload: ConnectRequest,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Try the credentials without saving them.

    A blank secret means "use the one already stored", so an admin can re-test a
    live connection without retyping it.
    """
    if provider not in svc.PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")

    tid = get_current_tenant_id()
    stored = await svc.get_connection(db, provider, tenant_id=tid) or {}
    merged = {**stored, **{k: v for k, v in payload.values.items() if v not in (None, "")}}
    return await svc.verify(provider, merged)


@router.post("/{provider}")
async def connect_integration(
    provider: str,
    payload: ConnectRequest,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Verify and store this brand's credentials for a provider."""
    if provider not in svc.PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")

    tid = get_current_tenant_id()
    if not tid:
        raise HTTPException(status_code=400, detail="No store context on this request")

    stored = await svc.get_connection(db, provider, tenant_id=tid) or {}
    merged = {**stored, **{k: v for k, v in payload.values.items() if v not in (None, "")}}

    missing = [
        f["label"] for f in svc.PROVIDERS[provider]["fields"]
        if f["required"] and not merged.get(f["name"])
    ]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required field(s): {', '.join(missing)}")

    result = await svc.verify(provider, merged)
    if not result.get("ok") and not payload.force:
        # 400 with the carrier's own words — the admin can fix the credential
        # rather than guess.
        raise HTTPException(status_code=400, detail=result.get("message") or "Could not connect.")

    try:
        await svc.save_connection(db, provider, payload.values, tenant_id=tid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await db.commit()

    saved = await svc.get_connection(db, provider, tenant_id=tid)
    return {
        "provider": provider,
        "connection": svc.mask(provider, saved),
        "verified": bool(result.get("ok")),
        "message": result.get("message") or "Connected.",
    }


@router.delete("/{provider}")
async def disconnect_integration(
    provider: str,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Forget this brand's credentials for a provider."""
    if provider not in svc.PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")
    tid = get_current_tenant_id()
    removed = await svc.delete_connection(db, provider, tenant_id=tid)
    await db.commit()
    return {"provider": provider, "disconnected": removed}
