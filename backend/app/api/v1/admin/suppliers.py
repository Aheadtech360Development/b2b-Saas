"""Admin: Manage Suppliers.

  GET  /admin/suppliers                              every supplier, connected or not
  GET  /admin/suppliers/{id}                         one supplier's setup + last run
  PUT  /admin/suppliers/{id}                         save name, filters, pricing, sync…
  GET  /admin/suppliers/{id}/brands                  brands in the supplier's catalogue
  GET  /admin/suppliers/{id}/catalog                 browse: search + brand, paged
  GET  /admin/suppliers/{id}/import-preview          what the filters select, paged
  GET  /admin/suppliers/{id}/import-preview/count    variant total for the selection
  POST /admin/suppliers/{id}/import                  import everything the filters select
  POST /admin/suppliers/{id}/sync                    sync stock now (?full=1 runs a full sync)
  GET  /admin/suppliers/{id}/job                     progress of the running job
  GET  /admin/suppliers/{id}/locations               store locations + S&S warehouses, for stock mapping
  POST /admin/suppliers/{id}/fields/preview          what Match Fields make of one style
  GET  /admin/suppliers/{id}/payment-profiles        cards saved on the S&S website
  GET  /admin/suppliers/{id}/orders                  orders waiting to be sent + recent POs
  POST /admin/suppliers/{id}/orders/send             send orders to S&S now
  POST /admin/suppliers/{id}/orders/tracking         check S&S for shipments now

Everything here is one brand's: its own credentials, its own filters and
pricing, its own products. It refuses to run without a single brand in scope,
for the same reason the copilot does — tenant scoping steps aside when no brand
is set or a platform admin bypasses it.
"""
from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import NO_TENANT, get_current_tenant_id, is_scoping_bypassed
from app.middleware.auth_middleware import require_admin
from app.services.suppliers import config as cfgmod
from app.services.suppliers import jobs, ss_catalog

router = APIRouter(prefix="/admin/suppliers", tags=["admin", "suppliers"])


async def require_brand() -> None:
    if is_scoping_bypassed() or get_current_tenant_id() in (None, NO_TENANT):
        raise HTTPException(status_code=400, detail="Open suppliers from a store's own admin.")


def _known(supplier: str) -> dict:
    meta = cfgmod.CATALOG.get(supplier)
    if not meta:
        raise HTTPException(status_code=404, detail="Unknown supplier")
    if not meta["available"]:
        raise HTTPException(status_code=409, detail=f"{meta['label']} isn't available yet.")
    return meta


async def _connection(db: AsyncSession, supplier: str) -> dict:
    from app.services.integrations_service import get_connection
    from app.services.ss_activewear_service import country_code

    conn = await get_connection(db, supplier)
    if not conn:
        return {"connected": False, "account": None, "country": "US"}
    acct = str(conn.get("account_number") or "")
    return {"connected": True, "account": ("•" * max(0, len(acct) - 3)) + acct[-3:] if acct else None,
            "country": country_code(conn.get("country"))}


async def _client(db: AsyncSession, supplier: str):
    """The brand's own S&S client — never the platform fallback."""
    from app.services.integrations_service import get_connection
    from app.services.ss_activewear_service import from_connection

    conn = await get_connection(db, supplier)
    if not conn:
        raise HTTPException(status_code=409, detail="Connect your S&S Activewear account first (Edit supplier → Connection).")
    return from_connection(conn)


async def _styles(db: AsyncSession, supplier: str):
    svc = await _client(db, supplier)
    try:
        return svc, await ss_catalog.all_styles(svc)
    except ss_catalog.CatalogUnavailable as exc:
        await svc.close()
        raise HTTPException(status_code=502, detail=str(exc))


async def _imported(db: AsyncSession, style_ids: list[str]) -> set[str]:
    from app.models.product import Product

    if not style_ids:
        return set()
    rows = (await db.execute(select(Product.product_code).where(Product.product_code.in_(style_ids)))).scalars().all()
    return {str(r) for r in rows if r}


def _row(s: dict, *, imported: set[str], stats: dict | None = None, filters: dict | None = None) -> dict:
    out = {**s, "is_imported": s["style_id"] in imported}
    if stats is not None:
        st = stats.get(s["style_id"])
        out.update(variants=st["variants"] if st else None, sizes=st["sizes"] if st else [], colors=st["colors"] if st else None)
    if filters is not None:
        out["in_filters"] = ss_catalog.matches(s, filters)
    return out


def _public(cfg: dict) -> dict:
    return {k: v for k, v in cfg.items()}


# ── List & detail ─────────────────────────────────────────────────────────────

@router.get("")
async def list_suppliers(
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db), __: None = Depends(require_brand),
) -> list[dict]:
    tid = get_current_tenant_id()
    out = []
    for sid, meta in cfgmod.CATALOG.items():
        if not meta["available"]:
            out.append({"id": sid, "label": meta["label"], "available": False, "connected": False})
            continue
        cfg = await cfgmod.load(db, sid)
        conn = await _connection(db, sid)
        out.append({
            "id": sid, "label": meta["label"], "available": True, "name": cfg["name"],
            "connected": conn["connected"], "account": conn["account"],
            "auto_import": cfg["auto_import"], "automatic_sync": cfg["automatic_sync"],
            "last_sync_at": cfg.get("last_sync_at"), "created_at": cfg.get("created_at"),
            "job": await jobs.progress(tid, sid),
        })
    return out


@router.get("/{supplier}")
async def get_supplier(
    supplier: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
    __: None = Depends(require_brand),
) -> dict:
    from app.services.suppliers import mapping

    meta = _known(supplier)
    cfg = await cfgmod.load(db, supplier)
    conn = await _connection(db, supplier)
    return {
        "id": supplier, "label": meta["label"], "config": _public(cfg),
        "connection": conn,
        "job": await jobs.progress(get_current_tenant_id(), supplier),
        "meta": {
            "sources": [{"key": k, "label": lbl, "level": lvl} for k, lbl, lvl in mapping.SOURCES],
            "targets": [{"key": k, "label": lbl, "level": lvl, "kind": kind} for k, lbl, lvl, kind, _ in mapping.TARGETS],
            "default_fields": mapping.DEFAULT_FIELDS,
            "shipping_methods": [{"code": c, "label": lbl} for c, lbl in
                                 cfgmod.SHIPPING_METHODS.get(conn["country"], cfgmod.SHIPPING_METHODS["US"]).items()],
        },
    }


class FilterRule(BaseModel):
    field: Literal["brand", "category", "style", "title"]
    op: Literal["equals", "contains", "not_equals"] = "equals"
    value: str = Field(min_length=1, max_length=200)


class Filters(BaseModel):
    match: Literal["any", "all"] = "any"
    rules: list[FilterRule] = []


class PriceRule(BaseModel):
    id: str | None = None
    scope: Literal["all", "brand", "category", "style"] = "all"
    value: str = ""
    markup_pct: float = 0
    markup_fixed: float = 0
    active: bool = True


class Pricing(BaseModel):
    rules: list[PriceRule] = []
    round_to: float | None = None


class SupplierUpdate(BaseModel):
    """Every part optional: the page saves what changed. The newer sections are
    free-form here and validated by the config module, which owns their rules."""
    name: str | None = Field(None, min_length=1, max_length=80)
    auto_import: bool | None = None
    filters: Filters | None = None
    pricing: Pricing | None = None
    inventory: dict | None = None
    product: dict | None = None
    automatic_sync: dict | None = None
    orders: dict | None = None


@router.put("/{supplier}")
async def update_supplier(
    supplier: str, body: SupplierUpdate, _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db), __: None = Depends(require_brand),
) -> dict:
    from app.services.suppliers import mapping

    _known(supplier)
    cfg = await cfgmod.load(db, supplier)
    try:
        if body.name is not None:
            cfg["name"] = body.name.strip()
        if body.filters is not None:
            cfg["filters"] = cfgmod.clean_filters(body.filters.model_dump())
        if body.pricing is not None:
            cfg["pricing"] = cfgmod.clean_pricing(body.pricing.model_dump())
        if body.inventory is not None:
            cfg["inventory"] = cfgmod.clean_inventory(body.inventory)
        if body.product is not None:
            cfg["product"] = cfgmod.clean_product(body.product)
        if body.automatic_sync is not None:
            cfg["automatic_sync"] = cfgmod.clean_automatic_sync(body.automatic_sync)
        if body.orders is not None:
            country = (await _connection(db, supplier))["country"]
            cfg["orders"] = cfgmod.clean_orders(body.orders, cfg.get("orders"), country)
    except (ValueError, mapping.MappingError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    # The list's Auto import switch and Automatic Sync's "create products" are
    # one setting seen from two places.
    if body.auto_import is not None and body.automatic_sync is None:
        cfg["automatic_sync"]["create"] = "always" if body.auto_import else (
            "never" if cfg["automatic_sync"]["create"] == "always" else cfg["automatic_sync"]["create"])
    cfg["auto_import"] = cfg["automatic_sync"]["create"] == "always"
    cfg = await cfgmod.save(db, supplier, cfg)
    await db.commit()
    return {"config": _public(cfg)}


# ── Catalogue ─────────────────────────────────────────────────────────────────

@router.get("/{supplier}/brands")
async def supplier_brands(
    supplier: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
    __: None = Depends(require_brand),
) -> dict:
    _known(supplier)
    svc, styles = await _styles(db, supplier)
    await svc.close()
    return {"brands": ss_catalog.brands(styles), "categories": sorted({s["category"] for s in styles if s["category"]})}


@router.get("/{supplier}/catalog")
async def browse_catalog(
    supplier: str,
    q: str | None = None,
    brand: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=60)] = 24,
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db), __: None = Depends(require_brand),
) -> dict:
    _known(supplier)
    svc, styles = await _styles(db, supplier)
    await svc.close()
    cfg = await cfgmod.load(db, supplier)
    found = ss_catalog.search(styles, q, brand)
    rows = found[(page - 1) * page_size: page * page_size]
    imported = await _imported(db, [s["style_id"] for s in rows])
    return {
        "items": [_row(s, imported=imported, filters=cfg["filters"]) for s in rows],
        "total": len(found), "page": page, "pages": max(1, -(-len(found) // page_size)),
    }


@router.get("/{supplier}/import-preview")
async def import_preview(
    supplier: str,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 25,
    _: None = Depends(require_admin), db: AsyncSession = Depends(get_db), __: None = Depends(require_brand),
) -> dict:
    """What the saved filters select. Variants and sizes are filled in for this
    page only; the total comes from /import-preview/count, which is slower."""
    _known(supplier)
    cfg = await cfgmod.load(db, supplier)
    svc, styles = await _styles(db, supplier)
    try:
        chosen = [s for s in styles if ss_catalog.matches(s, cfg["filters"])]
        rows = chosen[(page - 1) * page_size: page * page_size]
        stats = await ss_catalog.style_stats(svc, rows)
    finally:
        await svc.close()
    imported_all = await _imported(db, [s["style_id"] for s in chosen])
    return {
        "filters": cfg["filters"],
        "products": len(chosen),
        "already_imported": len(imported_all),
        "items": [_row(s, imported=imported_all, stats=stats) for s in rows],
        "page": page, "pages": max(1, -(-len(chosen) // page_size)),
    }


@router.get("/{supplier}/import-preview/count")
async def import_preview_count(
    supplier: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
    __: None = Depends(require_brand),
) -> dict:
    _known(supplier)
    cfg = await cfgmod.load(db, supplier)
    svc, styles = await _styles(db, supplier)
    try:
        chosen = [s for s in styles if ss_catalog.matches(s, cfg["filters"])]
        if len(chosen) > ss_catalog.COUNT_LIMIT:
            return {"products": len(chosen), "variants": None,
                    "note": f"Too many products to count variants ({len(chosen)}). Narrow the filters to see it."}
        stats = await ss_catalog.style_stats(svc, chosen)
    finally:
        await svc.close()
    counted = [stats[s["style_id"]]["variants"] for s in chosen if s["style_id"] in stats]
    return {"products": len(chosen), "variants": sum(counted),
            "complete": len(counted) == len(chosen)}


# ── Jobs ──────────────────────────────────────────────────────────────────────

async def _start(db: AsyncSession, supplier: str, kind: str) -> dict:
    _known(supplier)
    if not (await _connection(db, supplier))["connected"]:
        raise HTTPException(status_code=409, detail="Connect your S&S Activewear account first (Edit supplier → Connection).")
    try:
        return await jobs.start(get_current_tenant_id(), supplier, kind)
    except jobs.JobBusy as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@router.post("/{supplier}/import")
async def start_import(
    supplier: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
    __: None = Depends(require_brand),
) -> dict:
    cfg = await cfgmod.load(db, supplier)
    if not (cfg.get("filters") or {}).get("rules"):
        raise HTTPException(status_code=400, detail="Set import filters first — without them nothing is selected.")
    return {"job": await _start(db, supplier, "import")}


@router.post("/{supplier}/sync")
async def start_sync(
    supplier: str, full: bool = False, _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db), __: None = Depends(require_brand),
) -> dict:
    return {"job": await _start(db, supplier, "sync" if full else "inventory")}


@router.get("/{supplier}/job")
async def job_status(
    supplier: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
    __: None = Depends(require_brand),
) -> dict:
    _known(supplier)
    return {"job": await jobs.progress(get_current_tenant_id(), supplier)}


# ── Inventory locations ───────────────────────────────────────────────────────

_WAREHOUSE_KEY = "ss:warehouses:v1:{country}"
_US_STATES = {
    "AL": "Alabama", "AZ": "Arizona", "CA": "California", "CO": "Colorado", "FL": "Florida", "GA": "Georgia",
    "IL": "Illinois", "IN": "Indiana", "KS": "Kansas", "KY": "Kentucky", "MA": "Massachusetts", "MI": "Michigan",
    "MN": "Minnesota", "MO": "Missouri", "NC": "North Carolina", "NJ": "New Jersey", "NV": "Nevada",
    "NY": "New York", "OH": "Ohio", "PA": "Pennsylvania", "SC": "South Carolina", "TN": "Tennessee",
    "TX": "Texas", "UT": "Utah", "VA": "Virginia", "WA": "Washington", "WI": "Wisconsin",
}
_CA_PROVINCES = {"AB": "Alberta", "BC": "British Columbia", "ON": "Ontario", "QC": "Quebec", "MB": "Manitoba"}


def _warehouse_label(code: str, country: str) -> str:
    if code == "DS":
        return "Dropshipping"
    names = _CA_PROVINCES if country == "CA" else _US_STATES
    return f"{names[code]} ({code})" if code in names else f"Warehouse {code}"


@router.get("/{supplier}/locations")
async def supplier_locations(
    supplier: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
    __: None = Depends(require_brand),
) -> dict:
    """The brand's store locations, and the S&S warehouses stock can come from.

    S&S has no warehouse list endpoint; the codes are read off live stock for a
    few styles and cached a day per country."""
    import json as _json

    from app.core.redis import redis_get, redis_set
    from app.models.inventory import Warehouse

    _known(supplier)
    stores = (await db.execute(
        select(Warehouse).where(Warehouse.is_active.is_(True)).order_by(Warehouse.created_at)
    )).scalars().all()
    conn = await _connection(db, supplier)
    codes: list[str] = []
    if conn["connected"]:
        key = _WAREHOUSE_KEY.format(country=conn["country"])
        try:
            cached = await redis_get(key)
            codes = _json.loads(cached) if cached else []
        except Exception:
            codes = []
        if not codes:
            svc, styles = await _styles(db, supplier)
            try:
                parts = [s["part_number"] for s in styles[:400:40] if s["part_number"]][:10]
                rows = await svc.fetch_inventory_for_parts(parts) if parts else []
                codes = sorted({str(w.get("warehouseAbbr") or "").upper() for r in rows
                                for w in (r.get("warehouses") or []) if w.get("warehouseAbbr")})
                if codes:
                    await redis_set(key, _json.dumps(codes), expire=24 * 3600)
            except Exception:
                codes = []
            finally:
                await svc.close()
    return {
        "locations": [{"id": str(w.id), "name": w.name, "code": w.code,
                       "city": ", ".join(p for p in (w.city, w.state) if p)} for w in stores],
        "warehouses": [{"code": c, "label": _warehouse_label(c, conn["country"])} for c in codes if c != "DS"],
    }


# ── Match Fields preview ──────────────────────────────────────────────────────

class FieldsPreview(BaseModel):
    fields: list[dict]
    style_id: str | None = None


@router.post("/{supplier}/fields/preview")
async def preview_fields(
    supplier: str, body: FieldsPreview, _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db), __: None = Depends(require_brand),
) -> dict:
    """Run the (unsaved) mappings on a real style: the first one the import
    filters select, or the one asked for."""
    from app.services.suppliers import mapping, ss_products

    _known(supplier)
    try:
        fields = mapping.clean_fields(body.fields)
    except mapping.MappingError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    cfg = await cfgmod.load(db, supplier)
    cfg = {**cfg, "product": {**cfg["product"], "fields": fields}}
    svc, styles = await _styles(db, supplier)
    try:
        style = next((s for s in styles if s["style_id"] == body.style_id), None) if body.style_id else None
        style = style or next((s for s in styles if ss_catalog.matches(s, cfg["filters"])), None) or (styles[0] if styles else None)
        if not style:
            raise HTTPException(status_code=404, detail="No S&S style to preview.")
        rows = await svc.fetch_products_for_parts([style["part_number"]])
    finally:
        await svc.close()
    rows = [r for r in rows if str(r.get("styleID")) == style["style_id"]][:3]
    if not rows:
        raise HTTPException(status_code=502, detail="S&S returned no variants for the preview style.")
    ss = ss_catalog.as_ss(style)
    price_fn = ss_products.pricer(cfg, ss)
    product = mapping.apply(fields, ss, rows[0], level="product", price_fn=price_fn)
    variants = [ss_products._variant_values(fields, ss, r, price_fn) for r in rows]
    return {
        "style": {"style_id": style["style_id"], "name": f"{style['brand']} {style['style_name']}", "image": style["image"]},
        "product": {k: (v[:300] + "…" if isinstance(v, str) and len(v) > 300 else v) for k, v in product.items()},
        "variants": variants,
    }


# ── Orders ────────────────────────────────────────────────────────────────────

@router.get("/{supplier}/payment-profiles")
async def payment_profiles(
    supplier: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
    __: None = Depends(require_brand),
) -> dict:
    _known(supplier)
    svc = await _client(db, supplier)
    try:
        rows = await svc.payment_profiles()
    except Exception as exc:
        code = getattr(getattr(exc, "response", None), "status_code", None)
        raise HTTPException(status_code=502, detail="S&S didn't return saved cards"
                            + (" — this account may not have API ordering enabled." if code in (401, 403, 404) else "."))
    finally:
        await svc.close()
    return {"profiles": [{"id": r.get("profileID"), "type": r.get("profileType"), "name": r.get("name")}
                         for r in rows if r.get("profileID")]}


def _so_out(so, number: str | None) -> dict:
    return {
        "id": str(so.id), "order_id": str(so.order_id), "order_number": number, "status": so.status,
        "test": so.test, "trigger": so.trigger, "po_number": so.po_number,
        "supplier_order_numbers": so.supplier_order_numbers, "error": so.error,
        "tracking_number": so.tracking_number, "carrier": so.carrier,
        "pieces": sum(int(line.get("qty") or 0) for line in (so.lines or [])),
        "created_at": so.created_at.isoformat() if so.created_at else None,
        "shipped_at": so.shipped_at.isoformat() if so.shipped_at else None,
    }


@router.get("/{supplier}/orders")
async def supplier_orders_list(
    supplier: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
    __: None = Depends(require_brand),
) -> dict:
    from app.models.order import Order
    from app.models.supplier import SupplierOrder
    from app.services.suppliers import orders as so_mod

    _known(supplier)
    cfg = await cfgmod.load(db, supplier)
    recent = (await db.execute(
        select(SupplierOrder, Order.order_number).join(Order, Order.id == SupplierOrder.order_id)
        .where(SupplierOrder.supplier == supplier).order_by(SupplierOrder.created_at.desc()).limit(50)
    )).all()
    return {
        "mode": cfg["orders"]["sync"], "since": cfg["orders"].get("since"), "test_mode": cfg["orders"]["test_mode"],
        "waiting": await so_mod.waiting(db, cfg) if cfg["orders"]["sync"] != "disabled" else [],
        "recent": [_so_out(so, num) for so, num in recent],
    }


class SendOrders(BaseModel):
    order_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)


@router.post("/{supplier}/orders/send")
async def send_supplier_orders(
    supplier: str, body: SendOrders, _: None = Depends(require_admin),
    db: AsyncSession = Depends(get_db), __: None = Depends(require_brand),
) -> dict:
    from app.services.suppliers import orders as so_mod

    _known(supplier)
    cfg = await cfgmod.load(db, supplier)
    if cfg["orders"]["sync"] == "disabled":
        raise HTTPException(status_code=409, detail="Order sending is off. Turn it on in Edit Supplier → Order Settings.")
    waiting_ids = {w["order_id"] for w in await so_mod.waiting(db, cfg, limit=400)}
    ids = [i for i in body.order_ids if str(i) in waiting_ids]
    if not ids:
        raise HTTPException(status_code=409, detail="None of these orders can be sent (already sent, or no S&S items).")
    svc = await _client(db, supplier)
    try:
        results = await so_mod.send(db, svc, cfg, ids, trigger="manual")
    finally:
        await svc.close()
    return {"results": results}


@router.post("/{supplier}/orders/tracking")
async def refresh_supplier_tracking(
    supplier: str, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
    __: None = Depends(require_brand),
) -> dict:
    from app.services.suppliers import orders as so_mod

    _known(supplier)
    cfg = await cfgmod.load(db, supplier)
    svc = await _client(db, supplier)
    try:
        shipped = await so_mod.refresh_tracking(db, svc, cfg)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Couldn't read orders from S&S just now. Please try again.")
    finally:
        await svc.close()
    return {"shipped": shipped}

