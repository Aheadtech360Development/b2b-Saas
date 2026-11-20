"""Product cards on the grids (services/theme_data), as the dev fix list found
them wrong (2026-11-20):

* Item 5: a made-to-order product sells from its base price (Pricing and
  options), not from variants it kept from a CSV import: Window Decal $8,
  not the old $12.
* Item 12: "Sale" only for a price below the shop's own compare-at. A
  compare-at that is the supplier's suggested retail price (the same as the
  variant's MSRP, as a supplier import fills both) is not a sale.
No database.
"""
from types import SimpleNamespace as NS

from app.services import theme_data


def variant(price, compare=None, msrp=None, status="active"):
    return NS(retail_price=price, compare_price=compare, msrp=msrp, status=status)


def product(variants=(), mode="variant", base=None, name="Window Decal"):
    return NS(name=name, slug=name.lower().replace(" ", "-"), pricing_mode=mode, base_price=base,
              variants=list(variants), images=[], short_description="")


def test_a_made_to_order_product_sells_from_its_base_price():
    p = product([variant(12)], mode="configurable", base=8)
    assert theme_data.selling_prices(p) == [8.0]
    assert theme_data._product_card(p)["price"] == "From $8.00"


def test_a_stocked_product_sells_from_its_cheapest_variant():
    p = product([variant(3.10), variant(4.50), variant(1, status="archived")])
    assert theme_data._product_card(p)["price"] == "From $3.10"


def test_a_suppliers_suggested_retail_price_is_not_a_sale():
    supplier = product([variant(3.10, compare=6.24, msrp=6.24)])
    assert theme_data._product_card(supplier)["badge"] == ""


def test_the_shops_own_compare_at_price_is_a_sale():
    own = product([variant(20, compare=25)])
    assert theme_data._product_card(own)["badge"] == "Sale"
    marked_down = product([variant(5, compare=8, msrp=6.24)])
    assert theme_data._product_card(marked_down)["badge"] == "Sale"
    no_saving = product([variant(20, compare=18)])
    assert theme_data._product_card(no_saving)["badge"] == ""


# ── Item 14: sold by quote ───────────────────────────────────────────────────

def test_a_quote_only_product_shows_no_price_and_no_sale():
    p = product([variant(12, compare=20)])
    p.quote_only = True
    card = theme_data._product_card(p)
    assert card["price"] == "Request a quote" and card["badge"] == ""


def test_a_quote_only_product_is_not_out_of_stock_or_unpriced_in_the_admin():
    from app.services.product_catalog import Facts, attention, price_from, stock

    f = Facts(kind="stocked", status="active", images=1, variants=0, stock=0, quote_only=True)
    assert price_from(f) is None
    assert stock(f) == {"label": "Quote only", "tone": ""}
    assert attention(f) == []
