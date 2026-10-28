"""The Retail plan (specs/003-retail-launch, package 1): what it costs and
limits, what it leaves out, and that it is not offered before launch."""
from app.core import billing_plans as bp
from app.core.features import PLAN_FEATURES, feature_for_path, plan_defaults


def test_retail_is_79_a_month_with_its_limits_and_no_gang_sheet_commission():
    p = bp.get_plan("retail")
    assert (p["amount_cents"], p["interval"], p["commission_bps"]) == (7900, "month", 0)
    # Two staff accounts, the owner included (owner, 2026-10-28).
    assert p["limits"] == {"orders_per_month": 200, "staff_accounts": 2, "custom_domains": 1}
    assert p["lookup_key"] == "printcopilot_retail_monthly"
    assert bp.is_valid_plan("retail") and bp.effective_plan("retail") == "retail"
    assert bp.plan_summary("retail")["known"] is True


def test_only_retail_enforces_its_limits():
    # The print plans' limits stay information until the manager says (owner, 2026-10-28).
    assert [k for k in bp.PLAN_ORDER if bp.BILLING_PLANS[k].get("enforce_limits")] == ["retail"]


def test_retail_is_not_offered_until_its_pages_launch():
    assert [p["key"] for p in bp.public_pricing_table()] == ["starter", "wholesale", "scale"]
    # ...but the platform console can still put a test shop on it.
    assert "retail" in bp.BILLING_PLANS and bp.PLAN_ORDER[0] == "retail"


def test_retail_leaves_out_print_wholesale_and_scale_only_tools():
    retail = plan_defaults("retail")
    for key in ("gang_sheet", "gang_sheet_ai", "supplier_catalog", "wholesale_accounts", "customer_tiers",
                "matrix_ordering", "quick_buy", "net_terms", "invoices", "mobile_app"):
        assert key not in retail, key
    for key in ("orders", "products", "customers", "discounts", "reviews", "storefront_theme", "returns",
                "messages", "ai_agent", "staff_accounts", "abandoned_checkouts", "shipping_labels"):
        assert key in retail, key
    # Starter is what it was: Retail is Starter without the print tools.
    assert PLAN_FEATURES["starter"] - retail == {"gang_sheet", "supplier_catalog"}


def test_the_left_out_tools_routes_are_closed_and_the_rest_open():
    retail = plan_defaults("retail")
    closed = {
        "/api/v1/admin/gang-sheets/sizes": False,
        "/api/v1/admin/supplier-catalog/styles": False,
        "/api/v1/admin/suppliers/ss/products": False,
        "/api/v1/admin/wholesale-applications": False,
        "/api/v1/admin/companies/123": False,
        "/api/v1/account/invoices": False,
        "/api/v1/gang-sheets/designs": True,
        "/api/v1/register-wholesale": True,
        "/api/v1/quick-order/lines": True,
    }
    for path, public in closed.items():
        assert feature_for_path(path, public=public) not in retail, path
    open_ = {"/api/v1/admin/discounts": False, "/api/v1/admin/returns": False,
             "/api/v1/admin/reviews": False, "/api/v1/copilot/chat": True}
    for path, public in open_.items():
        assert feature_for_path(path, public=public) in retail, path
