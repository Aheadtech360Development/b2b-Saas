"""What this brand's own console may show.

The API refuses a feature the brand's plan does not include; this is so the
console does not offer it in the first place. A screen that leads to a 403 is
worse than a screen that isn't there.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.middleware.auth_middleware import require_admin

router = APIRouter(prefix="/admin/entitlements", tags=["admin-entitlements"])


@router.get("")
async def my_entitlements(
    request: Request,
    _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """The features this brand may use, as a list the console can check against."""
    from app.core.features import ALL_FEATURES
    from app.services import entitlements

    tenant_id = getattr(request.state, "tenant_id", None)
    if not tenant_id:
        return {"features": list(ALL_FEATURES), "plan": None, "locked": [], "upgrade_to": None}

    from sqlalchemy import text

    from app.core.billing_plans import BILLING_PLANS, PLAN_ORDER, plan_summary
    from app.core.features import FEATURES, PLAN_FEATURES

    have = sorted(await entitlements.for_tenant(db, tenant_id))
    plan = (await db.execute(
        text("SELECT plan FROM tenants WHERE id = CAST(:t AS uuid)"), {"t": str(tenant_id)}
    )).scalar()

    # For each thing this shop cannot use, the cheapest plan that includes it.
    # The console says "upgrade to Wholesale" rather than "not available", so
    # the answer to a locked screen is a decision the shop can actually make.
    labels = {key: label for key, label, _group in FEATURES}
    locked = []
    for key, label, group in FEATURES:
        if key in have:
            continue
        wants = next((p for p in PLAN_ORDER if key in PLAN_FEATURES.get(p, set())), None)
        locked.append({
            "feature": key,
            "label": label,
            "group": group,
            # None means no plan sells it — the platform switched it off for
            # this brand, and upgrading would not bring it back.
            "upgrade_to": BILLING_PLANS[wants]["name"] if wants else None,
            "upgrade_key": wants,
        })

    return {
        "features": have,
        "plan": plan_summary(plan),
        "locked": locked,
        "labels": labels,
    }
