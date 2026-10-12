"""The order list's filters, which its CSV export reads too.

One function builds the query for both, so "Export" hands over the rows that
are on the screen. What is tested here is that function, compiled to SQL and
read. No database.
"""
import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from app.api.v1.admin.orders import _filtered_orders


def _compiled(**filters):
    return _filtered_orders(**filters).compile(dialect=postgresql.dialect())


def _sql(**filters) -> str:
    return " ".join(str(_compiled(**filters)).split())


def _values(**filters) -> list:
    out = []
    for v in _compiled(**filters).params.values():
        out.extend(v if isinstance(v, (list, tuple)) else [v])
    return out


def test_no_filter_is_every_order_guests_included():
    sql = _sql()
    # A LEFT JOIN: an order with no company (a guest's) is still in the list.
    assert "LEFT OUTER JOIN companies" in sql
    assert "WHERE" not in sql


def test_search_looks_at_the_number_the_po_and_who_it_is_for():
    sql = _sql(q="  north ")
    for column in ("orders.order_number", "orders.po_number", "orders.guest_email", "orders.guest_name", "companies.name"):
        assert f"{column} ILIKE" in sql, column
    assert "%north%" in _values(q="  north ")
    # Spaces alone are not a search.
    assert "ILIKE" not in _sql(q="   ")


def test_unpaid_is_everything_not_settled():
    assert "orders.payment_status NOT IN" in _sql(payment="unpaid")
    assert set(_values(payment="unpaid")) == {"paid", "refunded"}
    assert "orders.payment_status =" in _sql(payment="paid") and _values(payment="paid") == ["paid"]
    assert _values(payment="refunded") == ["refunded"]
    # Anything else is no filter, not an error.
    assert "WHERE" not in _sql(payment="whatever")


def test_method_splits_pickups_from_parcels():
    assert "orders.shipping_method =" in _sql(method="pickup") and "will_call" in _values(method="pickup")
    ship = _sql(method="ship")
    # An order with no method recorded ships: it is not a pickup.
    assert "coalesce(orders.shipping_method" in ship and "!=" in ship


def test_a_queue_is_the_same_slice_home_counts():
    assert "DRAFT-%" in _values(queue="to_ship")
    assert "orders.shipped_at IS NULL" in _sql(queue="to_ship")
    with pytest.raises(HTTPException) as refused:
        _filtered_orders(queue="nonsense")
    assert refused.value.status_code == 400


def test_filters_add_up():
    sql = _sql(queue="all", payment="unpaid", method="ship", q="1043")
    assert sql.count(" AND ") >= 3
    assert "ILIKE" in sql and "NOT IN" in sql and "coalesce" in sql


def test_drafts_and_one_customer():
    assert "DRAFT-%" in _values(drafts_only=True) and "orders.order_number LIKE" in _sql(drafts_only=True)
    assert "orders.company_id =" in _sql(company_id="3f2b0c7e-0000-4000-8000-000000000001")
