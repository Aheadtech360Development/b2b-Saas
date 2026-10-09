"""Home's numbers and the order list behind their buttons.

The promise is that "3 paid orders to ship" opens three orders. It is kept by
both sides reading one definition (services/order_queues), so what is tested
here is that definition and the wording built on it. No database: the queues
are compiled to SQL and read.
"""
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.models.order import Order
from app.services import admin_home, order_queues


def _compiled(name: str):
    return select(Order.id).where(*order_queues.conditions(name)).compile(dialect=postgresql.dialect())


def _sql(name: str) -> str:
    return " ".join(str(_compiled(name)).split())


def _values(name: str) -> list:
    out = []
    for v in _compiled(name).params.values():
        out.extend(v if isinstance(v, (list, tuple)) else [v])
    return out


def test_a_queue_nobody_defined_is_not_a_queue():
    assert order_queues.conditions("nonsense") is None
    assert order_queues.conditions("") is None


def test_no_queue_counts_a_draft():
    for name in order_queues.QUEUES:
        assert "DRAFT-%" in _values(name), name
        assert "orders.order_number NOT LIKE" in _sql(name), name


def test_the_ship_queue_is_paid_not_shipped_and_not_a_pickup():
    sql, values = _sql("to_ship"), _values("to_ship")
    assert "orders.payment_status =" in sql and "paid" in values
    assert "orders.shipped_at IS NULL" in sql
    assert "coalesce(orders.shipping_method" in sql and "will_call" in values
    for status in ("pending", "confirmed", "processing"):
        assert status in values
    assert "shipped" not in values


def test_late_is_the_ship_queue_with_an_age():
    assert _sql("late").startswith(_sql("to_ship"))
    assert "orders.created_at <" in _sql("late")
    assert "orders.created_at <" not in _sql("to_ship")


def test_pickups_are_will_call_orders_the_shop_has_accepted():
    sql, values = _sql("pickups"), _values("pickups")
    assert "orders.shipping_method =" in sql and "will_call" in values
    assert "ready_for_pickup" in values and "pending" not in values


def test_unpaid_keeps_delivered_orders_and_counts_what_is_left():
    sql, values = _sql("unpaid"), _values("unpaid")
    assert "orders.total - coalesce(orders.amount_paid" in sql
    assert "delivered" not in values          # not excluded: on terms, delivery comes before payment
    assert "cancelled" in values and "refunded" in values


def test_in_production_and_ready_split_the_accepted_orders_on_their_print_jobs():
    production, ready = _sql("production"), _sql("ready")
    # Both look at the order's own print jobs.
    assert "gang_sheet_orders.order_id = orders.id" in production
    assert "gang_sheet_orders.order_id = orders.id" in ready
    # Ready also takes an order packed for the counter; production does not.
    assert "ready_for_pickup" in _values("ready")
    assert "ready_for_pickup" not in _values("production")
    assert "completed" in _values("ready") and "completed" in _values("production")


def test_every_button_home_can_show_opens_a_queue_that_exists():
    for key, _label in admin_home.PIPELINE:
        assert key == "artwork" or key in order_queues.QUEUES, key
    for key in ("to_ship", "new", "pickups", "unpaid", "late"):
        assert key in order_queues.QUEUES


def test_each_thing_to_do_has_its_four_wordings_and_a_place_in_the_order():
    for key, words in admin_home.NEEDS.items():
        assert len(words) == 4 and all(words), key
    # What a customer has paid for comes before the shop's own upkeep.
    assert admin_home.ORDER["to_ship"] < admin_home.ORDER["print_jobs_review"] < admin_home.ORDER["new"]
    assert admin_home.ORDER["new"] < admin_home.ORDER["low_stock"]


def test_a_few_are_named_and_the_rest_counted():
    assert admin_home._listed([], 0) == ""
    assert admin_home._listed(["1043"], 1) == "1043"
    assert admin_home._listed(["1043", "1042"], 2) == "1043 and 1042"
    assert admin_home._listed(["1043", "1042"], 7) == "1043, 1042 and 5 more"
    # Asked for two and only one came back: no "and 0 more".
    assert admin_home._listed(["1043"], 3) == "1043"


def test_waiting_is_told_in_hours_and_then_in_days():
    assert admin_home._waited(0.2) == "less than an hour"
    assert admin_home._waited(1.2) == "1 hour"
    assert admin_home._waited(5.4) == "5 hours"
    assert admin_home._waited(35) == "35 hours"
    assert admin_home._waited(50) == "2 days"
