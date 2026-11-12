"""Inventory sync with AdvancePro (services/inventory_sync), against a pretend
AdvancePro: an httpx MockTransport answering as the spec describes
(advanceware.net/restapibeta/swagger/v1/swagger.json). No real AdvancePro is
called and no database is needed: the client, the numbers and the setup rules.
"""
import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.core.features import PLAN_FEATURES, feature_for_path
from app.services import integrations_service
from app.services.inventory_sync import config as cfgmod
from app.services.inventory_sync.advancepro import AdvanceProError, from_connection
from app.services.inventory_sync.engine import due, message, norm, plan_stock

LOGIN = {"username": "api@brand", "password": "pw"}


def ok_login(token="t1", refresh="r1"):
    return httpx.Response(200, json={"successResonse": {"token": token, "refreshToken": refresh,
                                                         "user": {"companyId": 7, "userName": "api@brand"}},
                                     "failedResponse": None, "twoFactorEnabled": False})


def paged(rows, *, base=1, size=2, ignore_page=False, zero_answers="clamp"):
    """A list endpoint: `rows` in pages of `size`, counting from `base`."""
    def answer(request: httpx.Request) -> httpx.Response:
        page = int(request.url.params.get("page", base))
        if ignore_page:
            return httpx.Response(200, json=rows[:size])
        if base == 1 and page == 0:
            if zero_answers == "clamp":
                page = 1
            elif zero_answers == "400":
                return httpx.Response(400, json={"title": "page must be 1 or more"})
            else:
                return httpx.Response(200, json=[])
        i = page - base
        return httpx.Response(200, json=rows[i * size:(i + 1) * size])
    return answer


def server(routes: dict, calls: list | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append((request.method, request.url.path, dict(request.url.params), request.headers.get("authorization")))
        fn = routes.get((request.method, request.url.path))
        if fn is None:
            return httpx.Response(404)
        return fn(request) if callable(fn) else fn
    return httpx.MockTransport(handler)


def client(routes, calls=None):
    return from_connection(LOGIN, transport=server(routes, calls), cache_tokens=False)


VARIANTS = [{"id": i, "sku": f"SKU-{i}"} for i in range(1, 6)]


# ── Signing in ───────────────────────────────────────────────────────────────
async def test_signs_in_and_reads_with_the_token():
    calls = []
    c = client({("POST", "/restapibeta/api/Authenticate/login"): lambda r: ok_login(),
                ("GET", "/restapibeta/api/warehouses"): paged([{"id": 1, "name": "Main"}, {"id": 2, "name": "East"}])}, calls)
    found = await c.check()
    await c.close()
    assert found["warehouses"] == 2
    body = None
    gets = [x for x in calls if x[0] == "GET"]
    assert gets and all(x[3] == "Bearer t1" for x in gets)


async def test_a_refused_login_says_why():
    c = client({("POST", "/restapibeta/api/Authenticate/login"): httpx.Response(
        401, json={"successResonse": None, "failedResponse": {"error": 1, "errorMessage": "Invalid password"}})})
    with pytest.raises(AdvanceProError, match="Invalid password"):
        await c.login()
    await c.close()


async def test_two_factor_sign_in_is_explained():
    c = client({("POST", "/restapibeta/api/Authenticate/login"): httpx.Response(
        200, json={"successResonse": None, "failedResponse": None, "twoFactorEnabled": True, "twoFactorCodeSent": True})})
    with pytest.raises(AdvanceProError, match="Two-factor"):
        await c.login()
    await c.close()


async def test_a_lapsed_token_is_refreshed_and_the_read_retried():
    state = {"token": "old"}

    def warehouses(request):
        if request.headers["authorization"] != f"Bearer {state['token']}":
            return httpx.Response(401)
        return httpx.Response(200, json=[{"id": 1, "name": "Main"}] if request.url.params.get("page") == "1" else [])

    def refresh(request):
        state["token"] = "new"
        return httpx.Response(200, json={"token": "new", "refreshToken": "r2"})

    c = client({("POST", "/restapibeta/api/Authenticate/login"): lambda r: ok_login(token="old"),
                ("POST", "/restapibeta/api/Authenticate/RefreshToken"): refresh,
                ("GET", "/restapibeta/api/warehouses"): warehouses})
    await c.login()
    state["token"] = "rotated"          # AdvancePro moved on: "old" no longer works
    state_refresh_target = "new"
    rows = await c.warehouses()
    await c.close()
    assert state["token"] == state_refresh_target and [r["id"] for r in rows] == [1]


def test_the_api_address_must_be_https():
    with pytest.raises(AdvanceProError, match="https"):
        from_connection({**LOGIN, "api_url": "http://advanceware.net/restapibeta"}, cache_tokens=False)


# ── Paging (the spec does not say how) ───────────────────────────────────────
@pytest.mark.parametrize("zero", ["clamp", "400", "empty"])
async def test_pages_counted_from_one(zero):
    c = client({("POST", "/restapibeta/api/Authenticate/login"): lambda r: ok_login(),
                ("GET", "/restapibeta/api/variants"): paged(VARIANTS, base=1, size=2, zero_answers=zero)})
    rows = await c.variants()
    await c.close()
    assert [r["id"] for r in rows] == [1, 2, 3, 4, 5]


async def test_pages_counted_from_zero():
    c = client({("POST", "/restapibeta/api/Authenticate/login"): lambda r: ok_login(),
                ("GET", "/restapibeta/api/variants"): paged(VARIANTS, base=0, size=2)})
    rows = await c.variants()
    await c.close()
    assert [r["id"] for r in rows] == [1, 2, 3, 4, 5]


async def test_a_list_that_ignores_page_is_read_once():
    calls = []
    c = client({("POST", "/restapibeta/api/Authenticate/login"): lambda r: ok_login(),
                ("GET", "/restapibeta/api/variants"): paged(VARIANTS, size=3, ignore_page=True)}, calls)
    rows = await c.variants()
    await c.close()
    assert [r["id"] for r in rows] == [1, 2, 3]
    assert len([x for x in calls if x[1].endswith("/variants")]) <= 4


async def test_one_short_page_from_zero():
    c = client({("POST", "/restapibeta/api/Authenticate/login"): lambda r: ok_login(),
                ("GET", "/restapibeta/api/warehouses"): paged([{"id": 9, "name": "Only"}], base=0, size=500)})
    assert [r["id"] for r in await c.warehouses()] == [9]
    await c.close()


async def test_a_list_both_pages_refused_shows_the_reason():
    c = client({("POST", "/restapibeta/api/Authenticate/login"): lambda r: ok_login(),
                ("GET", "/restapibeta/api/warehouseInventory"): httpx.Response(400, json={"title": "bad warehouse"})})
    with pytest.raises(AdvanceProError, match="400"):
        await c.warehouse_inventory()
    await c.close()


# ── The numbers ──────────────────────────────────────────────────────────────
def test_each_location_gets_its_number():
    variants = [{"id": 1, "sku": "TEE-BLK-M"}, {"id": 2, "sku": " tee-wht-m "}, {"id": 3, "sku": "CAP"}, {"id": 4, "sku": ""}]
    inventory = [
        {"variant_id": 1, "warehouse_id": 10, "available_quantity": 7.9},
        {"variant_id": 1, "warehouse_id": 20, "available_quantity": 5},
        {"variant_id": 2, "warehouse_id": 10, "available_quantity": 2},
        {"variant_id": 2, "warehouse_id": 20, "available_quantity": 40, "deleted": True},
    ]
    plan, facts = plan_stock(variants, inventory, {"locA": "all", "locB": "20"}, safety=1)
    assert plan["tee-blk-m"] == {"locA": 11, "locB": 4}      # 7.9 + 5 = 12.9 → 12, less 1; 5 less 1
    assert plan["tee-wht-m"] == {"locA": 1, "locB": 0}       # the deleted row is not stock
    assert plan["cap"] == {"locA": 0, "locB": 0}             # listed, no stock anywhere: none
    assert "" not in plan and facts["shown"]["tee-wht-m"] == "tee-wht-m"


def test_one_sku_on_two_variants_is_added_up():
    plan, facts = plan_stock([{"id": 1, "sku": "A"}, {"id": 2, "sku": "a"}],
                             [{"variant_id": 1, "warehouse_id": 1, "available_quantity": 3},
                              {"variant_id": 2, "warehouse_id": 1, "available_quantity": 4}], {"L": "all"})
    assert plan == {"a": {"L": 7}} and facts["duplicate_skus"] == 1


def test_skus_match_without_case_or_spaces():
    assert norm(" Ab-1 ") == norm("aB-1")


def test_the_run_reads_plainly():
    text = message({"matched": 40, "updated": 3, "created": 2, "not_in_shop": 1, "not_in_advancepro": 4})
    assert text == "40 of your SKUs matched AdvancePro, 5 stock numbers changed, 1 AdvancePro SKU not in your shop, 4 of your sizes not in AdvancePro."


# ── The setup ────────────────────────────────────────────────────────────────
def test_the_setup_is_checked():
    prev = cfgmod.default()
    locs = {"L1", "L2"}
    cfg = cfgmod.clean({"locations": {"L1": "all", "L2": "none"}, "every_minutes": 15, "safety_stock": 2},
                       prev, location_ids=locs, warehouse_ids={"10"})
    assert cfg["locations"] == {"L1": "all"} and cfg["every_minutes"] == 15 and cfg["safety_stock"] == 2
    with pytest.raises(ValueError, match="at least one store location"):
        cfgmod.clean({"active": True}, prev, location_ids=locs, warehouse_ids=None)
    with pytest.raises(ValueError, match="no longer exists"):
        cfgmod.clean({"locations": {"GONE": "all"}}, prev, location_ids=locs, warehouse_ids=None)
    with pytest.raises(ValueError, match="AdvancePro warehouse"):
        cfgmod.clean({"locations": {"L1": "99"}}, prev, location_ids=locs, warehouse_ids={"10"})
    with pytest.raises(ValueError, match="from the list"):
        cfgmod.clean({"every_minutes": 7}, prev, location_ids=locs, warehouse_ids=None)
    # AdvancePro unreadable just now: a warehouse already chosen is kept.
    kept = cfgmod.clean({"locations": {"L1": "99"}}, prev, location_ids=locs, warehouse_ids=None)
    assert kept["locations"] == {"L1": "99"}


def test_a_sync_is_due_after_its_interval():
    now = datetime.now(UTC)
    assert due({"every_minutes": 30}, now)
    assert not due({"every_minutes": 30, "last_run_at": (now - timedelta(minutes=10)).isoformat()}, now)
    assert due({"every_minutes": 30, "last_run_at": (now - timedelta(minutes=31)).isoformat()}, now)


def test_every_route_opens_the_shop_before_asking_for_it():
    """The shop on a request is set by opening its database session (get_db).
    The job route once asked for the shop without it and answered 400, so a
    running sync showed no progress (found on the local end-to-end run)."""
    from app.api.v1.admin.inventory_sync import require_brand, router
    from app.core.database import get_db

    for route in router.routes:
        calls = [d.call for d in route.dependant.dependencies]
        assert require_brand in calls, route.path
        assert get_db in calls and calls.index(get_db) < calls.index(require_brand), route.path


# ── Sold as an add-on, connected like the brand's other accounts ─────────────
def test_it_is_an_add_on_behind_its_own_gate():
    assert feature_for_path("/api/v1/admin/inventory-sync/advancepro/run") == "inventory_sync"
    assert feature_for_path("/api/v1/admin/inventory") == "inventory"
    assert all("inventory_sync" not in feats for feats in PLAN_FEATURES.values())


def test_the_password_never_goes_back_to_the_browser():
    p = integrations_service.PROVIDERS["advancepro"]
    assert p["category"] == "inventory"
    shown = integrations_service.mask("advancepro", {"username": "api@brand", "password": "secret1234"})
    assert shown["password"] == "" and shown["password_hint"] == "••••1234" and shown["username"] == "api@brand"
    assert json.dumps(shown).count("secret1234") == 0
