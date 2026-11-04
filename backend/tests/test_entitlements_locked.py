"""Which plan a locked screen names (api/v1/admin/entitlements.locked_features).

A Retail shop's Gang sheet setup and Suppliers tabs say "Included from the
Starter plan". A feature the shop's own plan includes but the platform
switched off names no plan: upgrading would not bring it back.
"""
from app.api.v1.admin.entitlements import locked_features
from app.core.features import plan_defaults


def _upgrade(locked: list[dict], key: str) -> str | None:
    return next(item["upgrade_to"] for item in locked if item["feature"] == key)


def test_retail_names_the_plan_that_includes_each_locked_tool():
    locked = locked_features(plan_defaults("retail"), "retail")
    assert _upgrade(locked, "gang_sheet") == "Starter"
    assert _upgrade(locked, "supplier_catalog") == "Starter"
    assert _upgrade(locked, "wholesale_accounts") == "Wholesale"
    assert _upgrade(locked, "mobile_app") == "Scale"
    assert _upgrade(locked, "gang_sheet_ai") is None  # no plan sells it


def test_a_feature_switched_off_on_its_own_plan_names_no_plan():
    have = plan_defaults("starter") - {"gang_sheet"}
    assert _upgrade(locked_features(have, "starter"), "gang_sheet") is None
    # Not sent "down" to Retail, the cheapest plan with reviews, either.
    have = plan_defaults("wholesale") - {"reviews"}
    assert _upgrade(locked_features(have, "wholesale"), "reviews") is None


def test_only_what_the_shop_lacks_is_listed():
    have = plan_defaults("scale")
    locked = locked_features(have, "scale")
    assert [item["feature"] for item in locked] == ["gang_sheet_ai"]
