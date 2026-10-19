"""Purchase orders (design 37): the SKU search and changing a draft. The
routes were walked against the local API (session scratchpad, last3_walk.py)."""
from app.api.v1.admin.purchase_orders import router


def test_the_sku_search_is_matched_before_a_purchase_order_id():
    paths = [r.path for r in router.routes]
    # "/variants" would otherwise be read as a purchase order's id and refused.
    assert paths.index("/variants") < paths.index("/{po_id}")


def test_a_draft_can_be_changed_by_put():
    assert any(r.path == "/{po_id}" and "PUT" in r.methods for r in router.routes)
