"""Turning a collection's rules into a query.

An automatic collection stores a question, not an answer: "everything tagged
summer under $30". The rules become SQL when the collection is read, so a
product that gets a new tag or a lower price joins or leaves the moment it is
saved. There is nothing to synchronise and no membership table that can drift
away from the products it claims to describe — which is the failure mode of
every design that materialises this.

A rule is `{field, operator, value}`. Both sides are checked against the
catalogue below before anything is built: a field or operator that is not in
these tables never reaches the database, so a crafted rule cannot become a
query of its own.

Price and stock live on variants, not products, so those rules ask whether the
product *has a variant* that matches. That is what a person means by "under
$30" about a product with five sizes.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import Numeric, String, cast, exists, func, or_, select

from app.models.inventory import InventoryRecord
from app.models.product import Product, ProductVariant


class RuleError(ValueError):
    """A rule the engine will not build a query from."""


# What a rule may ask about. `kind` decides which operators apply and how the
# value is read.
FIELDS: dict[str, dict[str, Any]] = {
    "title":            {"label": "Product title",   "kind": "text"},
    "description":      {"label": "Description",     "kind": "text"},
    "product_type":     {"label": "Product type",    "kind": "text"},
    "vendor":           {"label": "Vendor",          "kind": "text"},
    "tag":              {"label": "Tag",             "kind": "tag"},
    "sku":              {"label": "Variant SKU",     "kind": "variant_text"},
    "variant_title":    {"label": "Variant (colour / size)", "kind": "variant_text"},
    "price":            {"label": "Price",           "kind": "money"},
    "compare_price":    {"label": "Compare-at price", "kind": "money"},
    "cost":             {"label": "Cost per item",   "kind": "money"},
    "weight":           {"label": "Weight (grams)",  "kind": "number"},
    "inventory_stock":  {"label": "Stock on hand",   "kind": "stock"},
    "status":           {"label": "Status",          "kind": "choice",
                         "choices": ["draft", "active", "archived"]},
    "gender":           {"label": "Gender",          "kind": "text"},
    "fabric":           {"label": "Fabric",          "kind": "text"},
    "supplier":         {"label": "Supplier",        "kind": "text"},
}

TEXT_OPERATORS = (
    "equals", "not_equals", "contains", "not_contains",
    "starts_with", "ends_with", "is_set", "is_not_set",
)
NUMBER_OPERATORS = (
    "equals", "not_equals", "greater_than", "less_than",
    "greater_or_equal", "less_or_equal", "is_set", "is_not_set",
)
CHOICE_OPERATORS = ("equals", "not_equals")
TAG_OPERATORS = ("equals", "not_equals", "contains", "not_contains")

OPERATORS_FOR_KIND: dict[str, tuple[str, ...]] = {
    "text": TEXT_OPERATORS,
    "variant_text": TEXT_OPERATORS,
    "tag": TAG_OPERATORS,
    "money": NUMBER_OPERATORS,
    "number": NUMBER_OPERATORS,
    "stock": NUMBER_OPERATORS,
    "choice": CHOICE_OPERATORS,
}

OPERATOR_LABELS: dict[str, str] = {
    "equals": "is", "not_equals": "is not",
    "contains": "contains", "not_contains": "does not contain",
    "starts_with": "starts with", "ends_with": "ends with",
    "greater_than": "is more than", "less_than": "is less than",
    "greater_or_equal": "is at least", "less_or_equal": "is at most",
    "is_set": "is set", "is_not_set": "is empty",
}

# Operators that ignore the value, so an empty one is not a mistake.
VALUELESS = {"is_set", "is_not_set"}

# A collection nobody could have meant. Guards the preview and the storefront
# from a rule set built to be expensive.
MAX_RULES = 25


def catalogue() -> dict:
    """What the rule builder offers — fields, and the operators each allows."""
    return {
        "fields": [
            {
                "key": key,
                "label": meta["label"],
                "kind": meta["kind"],
                "choices": meta.get("choices", []),
                "operators": [
                    {"key": op, "label": OPERATOR_LABELS[op]}
                    for op in OPERATORS_FOR_KIND[meta["kind"]]
                ],
            }
            for key, meta in FIELDS.items()
        ],
        "match": [
            {"key": "all", "label": "Products must match all conditions"},
            {"key": "any", "label": "Products may match any condition"},
        ],
        "max_rules": MAX_RULES,
    }


def _number(value: Any) -> Decimal:
    try:
        return Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, ValueError, AttributeError):
        raise RuleError(f'"{value}" is not a number.')


def validate(rules: Any, rules_match: str = "all") -> list[dict]:
    """Check a rule set and return it cleaned.

    Refuses rather than drops: a rule silently thrown away would look like a
    condition that had been set, and the collection would quietly hold more
    than the admin thinks it does.
    """
    if not isinstance(rules, list):
        raise RuleError("Conditions must be a list.")
    if len(rules) > MAX_RULES:
        raise RuleError(f"That is more than {MAX_RULES} conditions on one collection.")
    if rules_match not in ("all", "any"):
        raise RuleError('Conditions are combined with "all" or "any".')

    cleaned: list[dict] = []
    for rule in rules:
        if not isinstance(rule, dict):
            raise RuleError("Each condition must name a field, an operator and a value.")
        field = str(rule.get("field") or "").strip()
        operator = str(rule.get("operator") or "").strip()
        value = rule.get("value")

        meta = FIELDS.get(field)
        if meta is None:
            raise RuleError(f'"{field}" is not something a condition can check.')
        allowed = OPERATORS_FOR_KIND[meta["kind"]]
        if operator not in allowed:
            raise RuleError(
                f'"{OPERATOR_LABELS.get(operator, operator)}" does not apply to '
                f'{meta["label"].lower()}.'
            )

        if operator in VALUELESS:
            value = None
        else:
            if value is None or (isinstance(value, str) and not value.strip()):
                raise RuleError(f'{meta["label"]} {OPERATOR_LABELS[operator]} … needs a value.')
            if meta["kind"] in ("money", "number", "stock"):
                value = str(_number(value))
            elif meta["kind"] == "choice":
                value = str(value).strip().lower()
                if value not in meta.get("choices", []):
                    raise RuleError(
                        f'{meta["label"]} is one of: {", ".join(meta["choices"])}.'
                    )
            else:
                value = str(value).strip()[:255]

        cleaned.append({"field": field, "operator": operator, "value": value})
    return cleaned


def describe(rule: dict) -> str:
    """One rule in words — "Price is less than 30"."""
    meta = FIELDS.get(rule.get("field", ""), {})
    label = meta.get("label", rule.get("field", ""))
    operator = OPERATOR_LABELS.get(rule.get("operator", ""), rule.get("operator", ""))
    value = rule.get("value")
    return f"{label} {operator}" + (f" {value}" if value not in (None, "") else "")


# ── Building the query ───────────────────────────────────────────────────────

def _text_condition(column, operator: str, value: Any):
    """Case-insensitive text matching, which is what an admin expects."""
    if operator == "is_set":
        return column.isnot(None) & (func.trim(column) != "")
    if operator == "is_not_set":
        return column.is_(None) | (func.trim(column) == "")

    text = str(value)
    if operator == "equals":
        return func.lower(column) == text.lower()
    if operator == "not_equals":
        return (func.lower(column) != text.lower()) | column.is_(None)
    if operator == "contains":
        return column.ilike(f"%{_escape(text)}%")
    if operator == "not_contains":
        return ~column.ilike(f"%{_escape(text)}%") | column.is_(None)
    if operator == "starts_with":
        return column.ilike(f"{_escape(text)}%")
    if operator == "ends_with":
        return column.ilike(f"%{_escape(text)}")
    raise RuleError(f'"{operator}" is not a text condition.')


def _escape(value: str) -> str:
    """A literal % or _ in the value must match itself, not anything."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _number_condition(column, operator: str, value: Any):
    if operator == "is_set":
        return column.isnot(None)
    if operator == "is_not_set":
        return column.is_(None)
    number = _number(value)
    return {
        "equals": column == number,
        "not_equals": column != number,
        "greater_than": column > number,
        "less_than": column < number,
        "greater_or_equal": column >= number,
        "less_or_equal": column <= number,
    }[operator]


def _variant_exists(condition):
    """A product matches when one of its variants does.

    "Under $30" about a product with five sizes means one of them is, which is
    also what the storefront shows as the product's price.
    """
    return exists(
        select(ProductVariant.id)
        .where(ProductVariant.product_id == Product.id, condition)
        .correlate(Product)
    )


def _rule_condition(rule: dict):
    field, operator, value = rule["field"], rule["operator"], rule.get("value")
    meta = FIELDS[field]
    kind = meta["kind"]

    if kind in ("text", "choice"):
        column = {
            "title": Product.name,
            "description": Product.description,
            "product_type": Product.product_type,
            "vendor": Product.vendor,
            "status": cast(Product.status, String),
            "gender": Product.gender,
            "fabric": Product.fabric,
            "supplier": Product.supplier,
        }[field]
        return _text_condition(column, operator, value)

    if kind == "tag":
        # tags is a text array. "contains" asks whether any tag contains the
        # text; "equals" asks whether one of them is exactly it.
        if operator in ("equals", "not_equals"):
            has = Product.tags.any(str(value))
            return has if operator == "equals" else ~has | Product.tags.is_(None)
        pattern = f"%{_escape(str(value))}%"
        has_like = exists(
            select(1).select_from(func.unnest(Product.tags).alias("t"))
            .where(func.lower(func.trim(func.cast(func.unnest(Product.tags), String)))
                   .ilike(pattern.lower()))
        )
        # Simpler and index-friendly: match the array rendered as text.
        rendered = cast(Product.tags, String)
        if operator == "contains":
            return rendered.ilike(pattern)
        return ~rendered.ilike(pattern) | Product.tags.is_(None)

    if kind == "variant_text":
        column = ProductVariant.sku if field == "sku" else func.concat(
            func.coalesce(ProductVariant.color, ""), " ",
            func.coalesce(ProductVariant.size, ""),
        )
        return _variant_exists(_text_condition(column, operator, value))

    if kind == "money":
        column = {
            "price": ProductVariant.retail_price,
            "compare_price": ProductVariant.compare_price,
            "cost": ProductVariant.cost_per_item,
        }[field]
        # A configurable product has no variants; its base price is the one a
        # buyer sees, so a price rule has to consider it too or those products
        # silently fall out of every price-based collection.
        variant_match = _variant_exists(_number_condition(column, operator, value))
        if field == "price":
            base = _number_condition(cast(Product.base_price, Numeric(12, 4)), operator, value)
            return or_(variant_match, base)
        return variant_match

    if kind == "number":
        return _variant_exists(_number_condition(ProductVariant.weight_grams, operator, value))

    if kind == "stock":
        if operator in ("is_set", "is_not_set"):
            has_any = exists(
                select(InventoryRecord.id)
                .join(ProductVariant, ProductVariant.id == InventoryRecord.variant_id)
                .where(ProductVariant.product_id == Product.id)
                .correlate(Product)
            )
            return has_any if operator == "is_set" else ~has_any
        number = _number(value)
        # Summed across warehouses: "stock under 10" is about the product, not
        # about each shelf it sits on.
        total = (
            select(func.coalesce(func.sum(InventoryRecord.quantity), 0))
            .join(ProductVariant, ProductVariant.id == InventoryRecord.variant_id)
            .where(ProductVariant.product_id == Product.id)
            .correlate(Product)
            .scalar_subquery()
        )
        return {
            "equals": total == number,
            "not_equals": total != number,
            "greater_than": total > number,
            "less_than": total < number,
            "greater_or_equal": total >= number,
            "less_or_equal": total <= number,
        }[operator]

    raise RuleError(f'"{field}" cannot be matched.')


def build_condition(rules: list[dict], rules_match: str = "all"):
    """One SQLAlchemy condition for a whole rule set, or None for no rules.

    None means "no rules", which the caller must treat as *nothing matches*
    rather than *everything does*: an automatic collection with no conditions
    is unfinished, and quietly putting the entire catalogue in it is the worst
    possible reading of that.
    """
    from sqlalchemy import and_

    if not rules:
        return None
    conditions = [_rule_condition(rule) for rule in rules]
    return and_(*conditions) if rules_match == "all" else or_(*conditions)
