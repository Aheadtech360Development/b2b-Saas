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

    from app.core.billing_plans import plan_summary
    from app.core.features import FEATURES

    have = sorted(await entitlements.for_tenant(db, tenant_id))
    plan = (await db.execute(
        text("SELECT plan FROM tenants WHERE id = CAST(:t AS uuid)"), {"t": str(tenant_id)}
    )).scalar()

    labels = {key: label for key, label, _group in FEATURES}
    return {
        "features": have,
        "plan": plan_summary(plan),
        "locked": locked_features(set(have), plan),
        "labels": labels,
    }


def locked_features(have: set[str], plan: str | None) -> list[dict[str, Any]]:
    """For each thing this shop cannot use, the cheapest plan that includes it.

    The console says "upgrade to Wholesale" rather than "not available", so
    the answer to a locked screen is a decision the shop can actually make.
    """
    from app.core.billing_plans import BILLING_PLANS, PLAN_ORDER
    from app.core.features import FEATURES, PLAN_FEATURES, plan_defaults

    own = plan_defaults(plan)
    locked = []
    for key, label, group in FEATURES:
        if key in have:
            continue
        # Its own plan includes it, so the platform switched it off for this
        # brand: naming a plan would send the shop to buy what it has.
        wants = None if key in own else next(
            (p for p in PLAN_ORDER if key in PLAN_FEATURES.get(p, set())), None
        )
        locked.append({
            "feature": key,
            "label": label,
            "group": group,
            # None means no upgrade brings it back: no plan sells it, or the
            # platform switched it off for this brand.
            "upgrade_to": BILLING_PLANS[wants]["name"] if wants else None,
            "upgrade_key": wants,
        })
    return locked
