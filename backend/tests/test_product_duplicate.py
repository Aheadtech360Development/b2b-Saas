"""Products → a product → Duplicate (services/product_duplicate): the pieces
that decide what the copy is called and how its rows point at each other.
The whole copy is walked against a real database before release."""
import uuid

from app.models.product import Product, ProductVariant
from app.services import product_duplicate as dup
from app.services.combinations import combo_key, parse_key


def test_the_copy_is_offered_shopifys_name():
    assert dup.copy_title("Gildan 5000") == "Copy of Gildan 5000"
    assert len(dup.copy_title("x" * 300)) == 255


def test_each_variant_gets_a_sku_the_shop_does_not_use_yet():
    taken = {"G5000-BLK-M", "G5000-BLK-M-COPY"}
    assert dup.copy_sku("G5000-BLK-M", taken) == "G5000-BLK-M-COPY2"
    assert dup.copy_sku("G5000-BLK-M", taken) == "G5000-BLK-M-COPY3"
    assert dup.copy_sku("G5000-WHT-M", taken) == "G5000-WHT-M-COPY"
    long = dup.copy_sku("A" * 100, set())
    assert len(long) == 100 and long.endswith("-COPY")


def test_a_price_grid_key_points_at_the_copys_own_choices():
    o1, o2, v1, v2 = (str(uuid.uuid4()) for _ in range(4))
    n1, n2, w1, w2 = (str(uuid.uuid4()) for _ in range(4))
    key = combo_key([(o1, v1), (o2, v2)])
    new = dup.remap_key(key, {v1: w1, v2: w2}, {o1: n1, o2: n2})
    assert sorted(parse_key(new)) == sorted([(n1, w1), (n2, w2)])
    assert new == combo_key([(n2, w2), (n1, w1)])


def test_every_field_of_the_product_is_copied_but_its_identity():
    p = Product(name="Tee", slug="tee", status="active", supplier="ss", supplier_ref="5000",
                description="<p>Soft</p>", metafields={"a": [1]}, tags=["x"], track_inventory=True)
    p.id = uuid.uuid4()
    fields = dup._fields(p, {"name", "slug", "status", "supplier", "supplier_ref"})
    assert {"id", "name", "slug", "status", "supplier", "supplier_ref", "search_vector",
            "created_at", "updated_at"}.isdisjoint(fields)
    assert fields["description"] == "<p>Soft</p>" and fields["track_inventory"] is True
    # Its own copy of a JSON value, never the original's object.
    assert fields["metafields"] == {"a": [1]} and fields["metafields"] is not p.metafields
    for col in ("pricing_mode", "base_price", "gang_sheet_type", "designer_config", "bulk_order",
                "template_id", "theme_page", "size_chart_data", "print_guide", "vendor", "product_type"):
        assert col in fields, col


def test_a_variant_keeps_its_prices_but_not_its_sku_or_accounting_link():
    v = ProductVariant(sku="S-1", color="Black", size="M", retail_price=9.5, cost_per_item=3,
                       status="active", qb_item_id="QB-9")
    fields = dup._fields(v, {"product_id", "sku", "qb_item_id"})
    assert "sku" not in fields and "qb_item_id" not in fields and "id" not in fields
    assert fields["retail_price"] == 9.5 and fields["color"] == "Black" and fields["size"] == "M"
