"""Per-tenant overrides for the (globally-keyed) `settings` table.

The `settings` table has a globally-unique `key`, so it can't hold one row per
tenant for the same key without a schema migration. To make a handful of keys
tenant-specific *without* that migration (and without any risk to the existing
global rows), we store a brand's override under a namespaced key:

    "standard_shipping"          → platform-wide default  (tenant_id NULL era)
    "standard_shipping@<tid>"    → brand <tid>'s own value

Reads prefer the brand's namespaced row and fall back to the plain global row,
so a brand that has never saved its own config keeps the exact current behaviour.
The '@' separator never appears in a real settings key.

Only the keys in TENANT_SCOPED_KEYS are namespaced; everything else stays global.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import get_current_tenant_id
from app.models.system import Settings

# Keys each brand configures for itself. Kept intentionally narrow (shipping
# only) so the blast radius stays small — other settings remain global.
TENANT_SCOPED_KEYS: frozenset[str] = frozenset({
    "standard_shipping",
    "standard_shipping_method",
    "ship_from",  # brand's own warehouse / ship-from address (JSON)
})

_SEP = "@"


def scoped_key(key: str, tenant_id: uuid.UUID | str | None) -> str:
    """Namespaced key for a brand, or the plain key when there's no tenant."""
    if tenant_id and key in TENANT_SCOPED_KEYS:
        return f"{key}{_SEP}{tenant_id}"
    return key


def is_scoped_row(row_key: str) -> bool:
    """True for a per-tenant namespaced row (e.g. 'standard_shipping@<uuid>')."""
    return _SEP in row_key


async def get_setting(
    db: AsyncSession,
    key: str,
    *,
    tenant_id: uuid.UUID | str | None = None,
    default: str | None = None,
) -> str | None:
    """Return a settings value for the current brand, falling back to global.

    Never raises for a missing row; returns `default` instead.
    """
    tid = tenant_id if tenant_id is not None else get_current_tenant_id()

    if tid and key in TENANT_SCOPED_KEYS:
        row = (await db.execute(
            select(Settings).where(Settings.key == scoped_key(key, tid))
        )).scalar_one_or_none()
        if row is not None:
            return row.value

    row = (await db.execute(
        select(Settings).where(Settings.key == key)
    )).scalar_one_or_none()
    return row.value if row is not None else default
