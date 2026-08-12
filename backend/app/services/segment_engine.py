"""The reusable customer filter engine.

Turns a JSON condition tree into a SQLAlchemy query over companies (joined to
their metrics). This is the single evaluation path — preview, saved segments,
and any future feature (notifications, marketing, exports, automations) all call
`build_query`, so a saved segment and its live preview can never diverge.

Condition tree
--------------
    group = {"op": "and" | "or", "conditions": [ group | condition, ... ]}
    condition = {"field": <field>, "operator": <op>, "value": <value>}

Groups nest arbitrarily, mixing AND / OR. An empty tree matches everyone.

Fields resolve to a column on Company or CustomerMetrics via FIELDS; each field
has a type that decides which operators are legal. Unknown field/operator raises
ValueError (callers surface a 400) rather than silently matching nothing.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.sql.elements import ColumnElement

from app.models.company import Company
from app.models.segment import CustomerMetrics


def _num(col: ColumnElement) -> ColumnElement:
    """Treat a missing metric (company with no orders yet) as 0."""
    return func.coalesce(col, 0)


# field name → (column expression factory, value type)
FIELDS: dict[str, dict[str, Any]] = {
    "total_spend":           {"expr": lambda: _num(CustomerMetrics.total_spend),           "type": "number"},
    "order_count":           {"expr": lambda: _num(CustomerMetrics.order_count),            "type": "number"},
    "aov":                   {"expr": lambda: _num(CustomerMetrics.aov),                    "type": "number"},
    "paid_order_count":      {"expr": lambda: _num(CustomerMetrics.paid_order_count),       "type": "number"},
    "refunded_order_count":  {"expr": lambda: _num(CustomerMetrics.refunded_order_count),   "type": "number"},
    "refunded_amount":       {"expr": lambda: _num(CustomerMetrics.refunded_amount),        "type": "number"},
    "cancelled_order_count": {"expr": lambda: _num(CustomerMetrics.cancelled_order_count),  "type": "number"},
    "first_order_date":      {"expr": lambda: CustomerMetrics.first_order_at,               "type": "datetime"},
    "last_order_date":       {"expr": lambda: CustomerMetrics.last_order_at,                "type": "datetime"},
    "tags":                  {"expr": lambda: Company.tags,                                 "type": "json_array"},
    "customer_tier":         {"expr": lambda: Company.pricing_tier_id,                      "type": "id"},
    "tax_exempt":            {"expr": lambda: Company.tax_exempt,                           "type": "bool"},
    "status":                {"expr": lambda: Company.status,                               "type": "string"},
    "country":               {"expr": lambda: Company.country,                              "type": "string"},
    "state":                 {"expr": lambda: Company.state_province,                       "type": "string"},
    "city":                  {"expr": lambda: Company.city,                                 "type": "string"},
    "zip":                   {"expr": lambda: Company.postal_code,                          "type": "string"},
    "products_purchased":    {"expr": lambda: CustomerMetrics.purchased_product_ids,        "type": "json_array"},
    "categories_purchased":  {"expr": lambda: CustomerMetrics.purchased_category_ids,       "type": "json_array"},
}

OPERATORS: dict[str, list[str]] = {
    "number":     ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_set", "is_not_set"],
    "datetime":   ["within_last_days", "before", "after", "on_or_before", "on_or_after", "between", "is_set", "is_not_set"],
    "string":     ["eq", "neq", "contains", "not_contains", "starts_with", "in", "not_in", "is_set", "is_not_set"],
    "bool":       ["eq"],
    "id":         ["eq", "neq", "in", "not_in", "is_set", "is_not_set"],
    "json_array": ["contains", "not_contains", "contains_any", "contains_all", "is_set", "is_not_set"],
}


def _has(col: ColumnElement, is_string: bool) -> ColumnElement:
    return and_(col.isnot(None), col != "") if is_string else col.isnot(None)


def _jsonb_has(col: ColumnElement, value: Any) -> ColumnElement:
    # JSONB array containment: col @> [value]
    return col.op("@>")(func.jsonb_build_array(value))


def _dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


def _leaf(field: str, operator: str, value: Any) -> ColumnElement:
    spec = FIELDS.get(field)
    if not spec:
        raise ValueError(f"Unknown segment field: {field}")
    ftype: str = spec["type"]
    if operator not in OPERATORS[ftype]:
        raise ValueError(f"Operator '{operator}' is not valid for field '{field}'")
    col = spec["expr"]()

    if operator == "is_set":
        return _has(col, ftype == "string")
    if operator == "is_not_set":
        return ~_has(col, ftype == "string")

    if ftype == "number":
        if operator == "between":
            return col.between(float(value[0]), float(value[1]))
        v = float(value)
        return {"eq": col == v, "neq": col != v, "gt": col > v, "gte": col >= v, "lt": col < v, "lte": col <= v}[operator]

    if ftype == "datetime":
        if operator == "within_last_days":
            return and_(col.isnot(None), col >= func.now() - func.make_interval(0, 0, 0, int(value)))
        if operator == "between":
            return col.between(_dt(value[0]), _dt(value[1]))
        return {"before": col < _dt(value), "after": col > _dt(value),
                "on_or_before": col <= _dt(value), "on_or_after": col >= _dt(value)}[operator]

    if ftype == "string":
        if operator == "in":
            return col.in_(list(value))
        if operator == "not_in":
            return ~col.in_(list(value))
        sval = str(value)
        return {"eq": col == sval, "neq": col != sval,
                "contains": col.ilike(f"%{sval}%"), "not_contains": ~col.ilike(f"%{sval}%"),
                "starts_with": col.ilike(f"{sval}%")}[operator]

    if ftype == "bool":
        truthy = value in (True, "true", "True", 1, "1")
        return col.is_(True) if truthy else or_(col.is_(False), col.is_(None))

    if ftype == "id":
        def _u(x: Any) -> uuid.UUID:
            return x if isinstance(x, uuid.UUID) else uuid.UUID(str(x))
        if operator == "in":
            return col.in_([_u(x) for x in value])
        if operator == "not_in":
            return ~col.in_([_u(x) for x in value])
        return {"eq": col == _u(value), "neq": col != _u(value)}[operator]

    if ftype == "json_array":
        if operator == "contains":
            return _jsonb_has(col, value)
        if operator == "not_contains":
            return ~_jsonb_has(col, value)
        if operator == "contains_any":
            return or_(*[_jsonb_has(col, v) for v in value]) if value else _FALSE()
        if operator == "contains_all":
            return and_(*[_jsonb_has(col, v) for v in value]) if value else _TRUE()

    raise ValueError(f"Unhandled operator '{operator}' for field '{field}'")


def _TRUE() -> ColumnElement:
    return func.true()


def _FALSE() -> ColumnElement:
    return func.false()


def _build(node: dict) -> ColumnElement | None:
    if node is None:
        return None
    if "conditions" in node:
        parts = [p for p in (_build(c) for c in node.get("conditions", [])) if p is not None]
        if not parts:
            return None
        return or_(*parts) if node.get("op", "and") == "or" else and_(*parts)
    return _leaf(node["field"], node["operator"], node.get("value"))


def build_condition(definition: dict | None) -> ColumnElement | None:
    """The reusable core: a condition tree → a boolean SQL expression (or None
    for 'match everyone'). Any feature can AND this into its own query."""
    if not definition:
        return None
    return _build(definition)


def build_query(definition: dict | None) -> Select:
    """Companies matching the definition, as `select(Company.id)`. Callers add
    counts, sampling, pagination, or join more data on top. Tenant scoping is
    applied automatically by the ORM event layer."""
    stmt = (
        select(Company.id)
        .select_from(Company)
        .outerjoin(CustomerMetrics, CustomerMetrics.company_id == Company.id)
    )
    cond = build_condition(definition)
    if cond is not None:
        stmt = stmt.where(cond)
    return stmt


async def count_matches(db, definition: dict | None) -> int:
    ids = build_query(definition).subquery()
    return int((await db.execute(select(func.count()).select_from(ids))).scalar() or 0)


async def sample_matches(db, definition: dict | None, limit: int = 25, offset: int = 0):
    """Matching companies with the fields the UI shows, newest first."""
    match_ids = build_query(definition).subquery()
    rows = (await db.execute(
        select(
            Company.id, Company.name, Company.company_email, Company.city,
            Company.state_province, Company.country, Company.status,
            CustomerMetrics.total_spend, CustomerMetrics.order_count, CustomerMetrics.last_order_at,
        )
        .join(match_ids, match_ids.c.id == Company.id)
        .outerjoin(CustomerMetrics, CustomerMetrics.company_id == Company.id)
        .order_by(func.coalesce(CustomerMetrics.total_spend, 0).desc(), Company.name)
        .limit(limit).offset(offset)
    )).all()
    return [
        {
            "id": str(r.id), "name": r.name, "email": r.company_email,
            "city": r.city, "state": r.state_province, "country": r.country, "status": r.status,
            "total_spend": float(r.total_spend or 0), "order_count": int(r.order_count or 0),
            "last_order_at": r.last_order_at.isoformat() if r.last_order_at else None,
        }
        for r in rows
    ]
