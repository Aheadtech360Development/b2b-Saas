"""What a brand can actually use, right now.

A plan decides the default; the platform decides the answer. Every feature can
be granted to a brand its plan does not include, and taken away from one its
plan does — that override is a row in `tenant_feature_flags`, and it wins.

Read on every admin request, so it is cached for a few seconds: long enough
that a busy console is not one query per click, short enough that switching a
feature off is felt immediately rather than whenever a token expires.
"""
from __future__ import annotations

import logging
import time
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.features import ALL_FEATURES, plan_defaults

logger = logging.getLogger(__name__)

TTL_SECONDS = 15

_cache: dict[str, tuple[float, set[str]]] = {}


def forget(tenant_id: Any = None) -> None:
    """Drop what was remembered — after a flag or a plan changes."""
    if tenant_id is None:
        _cache.clear()
    else:
        _cache.pop(str(tenant_id), None)


async def _read(db: AsyncSession, tenant_id: str) -> set[str]:
    plan = (await db.execute(
        text("SELECT plan FROM tenants WHERE id = CAST(:t AS uuid)"), {"t": tenant_id}
    )).scalar()
    effective = plan_defaults(plan)

    # The overrides. A row saying false removes a feature the plan grants; a
    # row saying true adds one it does not.
    for feature, is_enabled in (await db.execute(
        text("SELECT feature, is_enabled FROM tenant_feature_flags WHERE tenant_id = CAST(:t AS uuid)"),
        {"t": tenant_id},
    )).all():
        if feature not in ALL_FEATURES:
            continue  # a key nobody offers any more
        if is_enabled:
            effective.add(feature)
        else:
            effective.discard(feature)
    return effective


async def for_tenant(db: AsyncSession, tenant_id: Any) -> set[str]:
    """Every feature this brand may use."""
    if not tenant_id:
        return set(ALL_FEATURES)  # no brand in play — nothing to gate
    key = str(tenant_id)
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < TTL_SECONDS:
        return hit[1]
    try:
        effective = await _read(db, key)
    except Exception as exc:  # never let this fail a request
        logger.warning("entitlements lookup failed for %s: %s", key, exc)
        return set(ALL_FEATURES)
    _cache[key] = (time.monotonic(), effective)
    return effective


async def enabled(db: AsyncSession, tenant_id: Any, feature: str) -> bool:
    return feature in await for_tenant(db, tenant_id)


async def detail(db: AsyncSession, tenant_id: Any) -> list[dict[str, Any]]:
    """Every feature, what the plan says, what was overridden, and the result.

    This is what the platform console shows, so it has to be able to tell
    "on because the plan includes it" from "on because we turned it on".
    """
    from app.core.features import FEATURES

    plan = (await db.execute(
        text("SELECT plan FROM tenants WHERE id = CAST(:t AS uuid)"), {"t": str(tenant_id)}
    )).scalar()
    defaults = plan_defaults(plan)
    overrides = {
        feature: bool(is_enabled)
        for feature, is_enabled in (await db.execute(
            text("SELECT feature, is_enabled FROM tenant_feature_flags WHERE tenant_id = CAST(:t AS uuid)"),
            {"t": str(tenant_id)},
        )).all()
    }
    rows = []
    for key, label, group in FEATURES:
        in_plan = key in defaults
        override = overrides.get(key)
        rows.append({
            "feature": key,
            "label": label,
            "group": group,
            "in_plan": in_plan,
            "override": override,                       # True / False / None
            "enabled": in_plan if override is None else override,
        })
    return {"plan": plan or "starter", "features": rows}
