"""Inventory (services/stock_view.py): what each SKU's numbers mean, and that
every part of the query is held to the shop asking. The query itself was run
on the local demo shop."""
import inspect

from app.services import stock_view as sv


def test_a_counted_sku_is_sold_out_at_zero_and_low_at_or_under_the_line():
    # Count stock on (products.track_inventory): at 0 it is sold out.
    assert sv.state(0, 10) == "zero" and sv.state(-2, 10) == "zero"
    assert sv.state(10, 10) == "low" and sv.state(1, 10) == "low"
    assert sv.state(11, 10) == "in"


def test_a_sku_not_counted_sells_without_a_limit_whatever_its_number():
    assert sv.state(0, 10, counted=False) == "free" and sv.state(50, 10, counted=False) == "free"
    assert "track_inventory" in sv._SKUS
    assert "(:stock = 'zero' AND counted AND available <= 0)" in sv._WHERE


def test_on_hand_is_what_is_left_to_sell_and_what_open_orders_hold():
    m = {"id": "v1", "product_id": "p1", "product_name": "Tee", "slug": "tee", "sku": "T-1",
         "color": "Black", "size": "M", "available": 7, "reserved": 3, "threshold": 10, "counted": True}
    row = sv._row(m, by_warehouse=False)
    assert (row["available"], row["reserved"], row["on_hand"], row["state"], row["counted"]) == (7, 3, 10, "low", True)
    # Open orders are not kept per warehouse: one warehouse's view does not split them.
    one = sv._row(m, by_warehouse=True)
    assert (one["reserved"], one["on_hand"]) == (None, 7)


def test_only_stocked_products_and_real_orders_count():
    assert "pricing_mode, 'variant') = 'variant'" in sv._SKUS and "gang_sheet_enabled" in sv._SKUS
    assert "NOT LIKE 'DRAFT-%'" in sv._SKUS and "'archived'" in sv._SKUS
    assert sv.OPEN_ORDER == "('pending', 'confirmed', 'processing', 'ready_for_pickup')"


def test_unknown_filters_fall_back():
    p = sv._params("t", "  tee ", None, None, "everything")
    assert (p["q"], p["like"], p["stock"], p["product"], p["wh"]) == ("tee", "%tee%", "all", "", "")


def test_every_query_names_the_shop():
    assert sv._SKUS.count("tenant_id = CAST(:t AS uuid)") >= 4
    for fn in (sv.incoming, sv.history):
        assert "tenant_id = CAST(:t AS uuid)" in inspect.getsource(fn), fn.__name__


def test_sizes_are_listed_on_the_size_chart():
    rows = [{"product_name": "Tee", "color": "Black", "size": s, "sku": f"T-{s}"} for s in ["XL", "S", "L", "XS", "M"]]
    rows.append({"product_name": "Tee", "color": "Ash", "size": "L", "sku": "A-L"})
    assert [(r["color"], r["size"]) for r in sv._in_order(rows)] == [
        ("Ash", "L"), ("Black", "XS"), ("Black", "S"), ("Black", "M"), ("Black", "L"), ("Black", "XL")]
