"""The print queue as a section of its own, and the Production role that has
it and nothing else. Every rule is asked of `can_access`, the one function the
middleware asks. No database or network."""
from app.core import permissions as p

BOARD = "/api/v1/admin/production"
JOB = "/api/v1/admin/gang-sheets/orders/5f0c/status"
ORDER = "/api/v1/admin/orders/1036"
SETUP = "/api/v1/admin/gang-sheets/sizes"          # mapped to nothing, as before


def test_roles_that_worked_the_queue_still_do():
    # Before the section existed its paths were open to every fixed role.
    for role in ("tenant_manager", "tenant_editor", "tenant_fulfillment"):
        assert p.can_access(role, BOARD, "GET")
        assert p.can_access(role, JOB, "PATCH"), role
    assert p.can_access("tenant_viewer", BOARD, "GET")
    assert not p.can_access("tenant_viewer", JOB, "PATCH")
    assert p.can_access("tenant_admin", JOB, "PATCH")


def test_production_works_the_queue_and_looks_at_orders():
    role = "tenant_production"
    assert p.can_access(role, BOARD, "GET")
    assert p.can_access(role, JOB, "PATCH")
    assert p.can_access(role, ORDER, "GET")
    assert not p.can_access(role, ORDER, "PATCH")
    assert not p.can_access(role, ORDER + "/refund", "POST")


def test_production_has_nothing_else():
    role = "tenant_production"
    for path in ("/api/v1/admin/products", "/api/v1/admin/customers", "/api/v1/admin/discounts",
                 "/api/v1/admin/settings", "/api/v1/admin/users", "/api/v1/admin/billing",
                 "/api/v1/admin/reports/overview", "/api/v1/admin/inventory/board"):
        assert not p.can_access(role, path, "GET"), path
        assert not p.can_access(role, path, "POST"), path
    # A path nobody has mapped is look-only for it, as for a custom role.
    assert p.can_access(role, SETUP, "GET")
    assert not p.can_access(role, SETUP, "POST")


def test_what_the_browser_is_told_matches():
    assert p.permissions_for("tenant_production") == {"production": "write", "orders": "read"}
    assert p.scopes_for_role("tenant_production") == ["orders", "production"]
    assert p.permissions_for("tenant_manager")["production"] == "write"
    assert p.permissions_for("tenant_viewer")["production"] == "read"
    assert p.ROLE_LABELS["tenant_production"] == "Production"


def test_a_custom_role_saved_before_the_section_still_looks_at_the_queue():
    old = {"orders": "write"}                      # no "production": it did not exist
    assert p.can_access("tenant_custom", BOARD, "GET", scopes=old)
    assert not p.can_access("tenant_custom", JOB, "PATCH", scopes=old)
    # Granted by name, it can work a job; granted read, it only looks.
    assert p.can_access("tenant_custom", JOB, "PATCH", scopes={"production": "write"})
    assert not p.can_access("tenant_custom", JOB, "PATCH", scopes={"production": "read"})
    assert p.normalise_scopes({"production": "write"}) == {"production": "write"}
    # Any other section it does not name stays closed.
    assert not p.can_access("tenant_custom", "/api/v1/admin/products", "GET", scopes=old)


def test_a_place_reads_as_edit_view_part_or_none():
    assert p.area_level({"orders": "write"}, ("orders",)) == "edit"
    assert p.area_level({"orders": "read"}, ("orders",)) == "view"
    assert p.area_level({}, ("orders",)) == "none"
    assert p.area_level({"products": "write", "collections": "write"}, ("products", "collections", "inventory")) == "part"
    assert p.area_level({"products": "read"}, ("products", "collections", "inventory")) == "view"
    # A report is read: nothing in it can be changed, whatever the level says.
    assert p.area_level({"analytics": "write"}, ("analytics",), look_only=True) == "view"


def test_the_table_is_the_rules():
    table = p.role_table([("7", "Front desk", {"orders": "read", "customers": "write"})])
    assert [r["label"] for r in table["roles"]] == ["Administrator", "Manager", "Editor", "Order Manager", "Viewer", "Production", "Front desk"]
    assert [r["fixed"] for r in table["roles"]][-2:] == [True, False]
    area = {a["key"]: {k: v["level"] for k, v in a["levels"].items()} for a in table["areas"]}
    assert area["production"]["tenant_production"] == "edit"
    assert area["orders"]["tenant_production"] == "view"
    assert area["products"]["tenant_production"] == "none"
    assert area["settings"]["tenant_admin"] == "edit" and area["settings"]["tenant_manager"] == "none"
    assert area["reports"]["tenant_admin"] == "view"
    assert area["products"]["tenant_editor"] == "part"      # products and collections, not inventory
    assert area["orders"]["tenant_viewer"] == "view"
    assert area["customers"]["custom:7"] == "edit" and area["orders"]["custom:7"] == "view"
    # Each cell says what it is made of.
    assert table["areas"][2]["levels"]["tenant_editor"]["sections"] == {"products": "write", "collections": "write", "inventory": None}


def test_every_staff_role_is_let_into_the_admin_at_sign_in():
    # Sign-in decides who reaches the admin from two lists of its own. A role
    # the rules know and those lists do not signs in and is refused everything.
    from app.services import auth_service, tenant_auth_service

    for role in p.ROLE_LABELS:
        assert role in auth_service._CONSOLE_ROLES, role
        assert role in tenant_auth_service._ADMIN_PANEL_ROLES, role
