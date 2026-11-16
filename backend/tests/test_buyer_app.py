"""The branded buyer app, sold on Scale (owner's yes, 2026-11-16): the
console's code and QR are Scale only, the code lookup turns away a shop
without the app (and says where to order instead), and the QR opens
printcopilot.co/get-app with the code.
"""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1 import storefront
from app.core.features import PLAN_FEATURES, feature_for_path
from app.services import shop_code


def run(coro):
    return asyncio.run(coro)


def test_only_scale_has_the_buyer_app():
    assert "mobile_app" in PLAN_FEATURES["scale"]
    for plan in ("retail", "starter", "wholesale"):
        assert "mobile_app" not in PLAN_FEATURES[plan]


def test_the_code_screen_needs_the_buyer_app_and_the_rest_of_storefront_does_not():
    assert feature_for_path("/api/v1/admin/storefront/shop-code") == "mobile_app"
    assert feature_for_path("/api/v1/admin/storefront/shop-code/rotate") == "mobile_app"
    assert feature_for_path("/api/v1/admin/storefront") == "storefront_theme"
    assert feature_for_path("/api/v1/admin/storefront/settings") == "storefront_theme"


def test_the_card_carries_the_link_and_the_qr_square(monkeypatch):
    monkeypatch.setattr(shop_code, "get_app_link", lambda code: f"https://printcopilot.co/get-app?code={code}")
    card = shop_code.card("ABC234")
    assert card["code"] == "ABC234"
    assert card["link"] == "https://printcopilot.co/get-app?code=ABC234"
    assert card["qr_svg"].startswith("data:image/svg+xml")
    assert card["qr_png"].startswith("data:image/png")
    assert "app_store_url" in card and "play_store_url" in card
    assert shop_code.card(None)["qr_svg"] is None


def request():
    return SimpleNamespace(client=SimpleNamespace(host="1.2.3.4"), headers={}, state=SimpleNamespace(tenant_slug=None))


@pytest.fixture
def lookup(monkeypatch):
    async def none(*a, **k):
        return None

    import app.core.rate_limit as rl
    monkeypatch.setattr(rl, "enforce_rate_limit", none)

    def answer(found):
        async def resolve(db, code):
            return found
        monkeypatch.setattr(shop_code, "resolve", resolve)
    return answer


SHOP = {"slug": "innterflow", "name": "Innterflow", "logo_url": None, "primary_color": "#111318",
        "url": "https://innterflow.printcopilot.co/", "wholesale_signup": True}


def test_a_shop_without_the_app_is_turned_away_with_its_website(lookup):
    lookup({**SHOP, "buyer_app": False})
    with pytest.raises(HTTPException) as e:
        run(storefront.shop_by_code("ABC234", request(), None))
    assert e.value.status_code == 403
    assert e.value.detail["code"] == "not_on_app"
    assert e.value.detail["url"] == "https://innterflow.printcopilot.co/"
    assert "Innterflow is not on the PrintCoPilot app" in e.value.detail["message"]


def test_a_scale_shop_is_found_with_the_store_links(lookup):
    lookup({**SHOP, "buyer_app": True})
    out = run(storefront.shop_by_code("ABC234", request(), None))
    assert out["slug"] == "innterflow" and out["buyer_app"] is True
    assert "app_store_url" in out and "play_store_url" in out


def test_an_unknown_code_is_still_not_found(lookup):
    lookup(None)
    with pytest.raises(HTTPException) as e:
        run(storefront.shop_by_code("ZZZZZZ", request(), None))
    assert e.value.status_code == 404
