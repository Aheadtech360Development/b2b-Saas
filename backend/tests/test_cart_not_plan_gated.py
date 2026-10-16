"""A signed-in shopper's "Add to cart" is not a wholesale-plan feature.

/api/v1/cart/add-matrix is the storefront's ordinary add to cart for every
product with sizes or colours, one item or many, and the hand-over of a guest's
cart at sign-in. It was gated behind the "matrix ordering grid", so at a
Starter shop a signed-in buyer got a 403 for a blank tee, read as "sign in
again", while a guest bought the same tee.
"""
from app.core.features import feature_for_path


def test_add_to_cart_needs_no_plan_feature():
    assert feature_for_path("/api/v1/cart/add-matrix") is None
    assert feature_for_path("/api/v1/cart/add-matrix", public=True) is None


def test_the_wholesale_buyer_paths_stay_gated():
    assert feature_for_path("/api/v1/account/net30-status", public=True) == "net_terms"
    assert feature_for_path("/api/v1/account/invoices", public=True) == "invoices"
