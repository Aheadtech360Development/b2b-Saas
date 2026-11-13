"""Review sources (services/review_sources): Judge.me, Google business, Yelp and
the review rules, against pretend services. Judge.me and Google answer through
an httpx MockTransport shaped like their API references (judge.me/api/docs.yaml,
Places API (New)); nothing real is called and no database is needed.
"""
import asyncio
import re
from pathlib import Path

import httpx
import pytest

from app.core.config import settings
from app.core.features import feature_for_path
from app.core.tenant_settings import TENANT_SCOPED_KEYS
from app.services.review_sources import google_place, judgeme, rules, store, yelp


def run(coro):
    return asyncio.run(coro)


# ── Judge.me ─────────────────────────────────────────────────────────────────

def review(i, **over):
    base = {
        "id": i, "title": f"Title {i}", "body": f"Great shirt number {i}", "rating": 5,
        "product_external_id": 111, "product_title": "Heavy Tee", "product_handle": "heavy-tee",
        "reviewer": {"id": 9, "email": "jane@example.com", "name": "Jane Smith"},
        "source": "email", "curated": "ok", "hidden": False, "verified": "buyer",
        "created_at": "2025-03-04T10:00:00Z", "pictures": [],
    }
    base.update(over)
    return base


@pytest.mark.parametrize("raw,want", [
    ("my-shop", "my-shop.myshopify.com"),
    ("My-Shop.myshopify.com", "my-shop.myshopify.com"),
    ("https://my-shop.myshopify.com/admin/apps", "my-shop.myshopify.com"),
    ("shop.example.com", "shop.example.com"),
])
def test_the_shop_domain_is_read_the_way_admins_paste_it(raw, want):
    assert judgeme.clean_domain(raw) == want


@pytest.mark.parametrize("raw", ["", "  ", "not a domain!", "javascript:alert(1)"])
def test_a_shop_domain_that_is_not_one_is_refused(raw):
    with pytest.raises(judgeme.JudgeMeError):
        judgeme.clean_domain(raw)


def test_a_token_that_cannot_be_one_is_refused():
    for bad in ("", "short", "has spaces in it"):
        with pytest.raises(judgeme.JudgeMeError):
            judgeme.clean_token(bad)
    assert judgeme.clean_token("  abcdefgh12345  ") == "abcdefgh12345"


def test_a_reviewer_shows_as_first_name_and_initial_never_an_email():
    assert judgeme.short_name("Jane Smith") == "Jane S."
    assert judgeme.short_name("Jane van der Berg") == "Jane B."
    assert judgeme.short_name("Prince") == "Prince"
    assert judgeme.short_name("jane@example.com") == "A customer"
    assert judgeme.short_name("") == "A customer"


def test_verified_follows_judgeme_own_list():
    for status in ("confirmed-buyer", "buyer", "verified-purchase", "semi-verified-purchase", "admin"):
        assert judgeme.normalise(review(1, verified=status))["is_verified"] is True
    for status in ("nothing", "not-yet", "unconfirmed-buyer", None):
        assert judgeme.normalise(review(1, verified=status))["is_verified"] is False


def test_a_review_is_plain_text_and_a_star_only_one_says_so():
    row = judgeme.normalise(review(1, body="<p>Soft &amp; <b>thick</b></p>", title="  "))
    assert row["body"] == "Soft & thick"
    assert row["title"] is None
    assert judgeme.normalise(review(2, body="", rating=4))["body"] == "Rated 4 out of 5 without a written review."
    assert judgeme.normalise(review(3, rating=0)) is None
    assert judgeme.normalise(review(4, rating="x")) is None
    assert judgeme.normalise(review(None)) is None


def test_the_first_published_https_photo_is_kept():
    pictures = [
        {"hidden": True, "urls": {"huge": "https://img/hidden.jpg"}},
        {"hidden": False, "urls": {"huge": "http://img/plain.jpg", "small": "https://img/small.jpg"}},
    ]
    assert judgeme.normalise(review(1, pictures=pictures))["image_url"] == "https://img/small.jpg"
    assert judgeme.normalise(review(2, pictures=None))["image_url"] is None


def test_a_store_review_has_no_product():
    assert judgeme.is_store_review(review(1, product_handle=None, product_external_id=None))
    assert judgeme.is_store_review(review(1, product_handle="", product_external_id=-1))
    assert not judgeme.is_store_review(review(1))


def test_published_means_curated_ok_and_not_archived():
    assert judgeme.published(review(1))
    assert not judgeme.published(review(1, curated="spam"))
    assert not judgeme.published(review(1, curated="not-yet"))
    assert not judgeme.published(review(1, hidden=True))


def judgeme_transport(rows, *, per_page=100, status=200, repeat=False, seen=None):
    def answer(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        if status != 200:
            return httpx.Response(status, json={"error": "Failed to authenticate. Shop domain or Api Token is wrong"})
        if request.url.path.endswith("/shops/info"):
            return httpx.Response(200, json={"shop": {"name": "Heavy Tees", "platform": "shopify", "plan": "awesome"}})
        page = int(request.url.params.get("page", 1))
        if repeat:
            page = 1
        start = (page - 1) * per_page
        return httpx.Response(200, json={"current_page": page, "per_page": per_page,
                                         "reviews": rows[start:start + per_page]})
    return httpx.MockTransport(answer)


def test_every_page_is_read_and_the_token_goes_in_a_header():
    rows = [review(i) for i in range(1, 104)]
    seen: list[httpx.Request] = []
    got = run(judgeme.fetch_reviews("s.myshopify.com", "secret-token-1", transport=judgeme_transport(rows, seen=seen)))
    assert len(got["reviews"]) == 103 and got["complete"] is True
    assert len(seen) == 2
    for request in seen:
        assert request.headers["X-Api-Token"] == "secret-token-1"
        assert "secret-token-1" not in str(request.url)
        assert request.url.params["shop_domain"] == "s.myshopify.com"
        assert request.url.params["per_page"] == "100"


def test_paging_that_does_not_move_is_never_taken_as_the_whole_list():
    rows = [review(i) for i in range(1, 101)]
    got = run(judgeme.fetch_reviews("s.myshopify.com", "secret-token-1",
                                    transport=judgeme_transport(rows, repeat=True)))
    assert len(got["reviews"]) == 100
    assert got["complete"] is False


def test_judgeme_refusing_the_token_says_so_in_their_words():
    with pytest.raises(judgeme.JudgeMeError) as err:
        run(judgeme.shop_info("s.myshopify.com", "wrong-token", transport=judgeme_transport([], status=401)))
    assert "Shop domain or Api Token is wrong" in str(err.value)
    assert "private token" in str(err.value)


def test_shop_info_names_the_shop():
    info = run(judgeme.shop_info("s.myshopify.com", "secret-token-1", transport=judgeme_transport([])))
    assert info["name"] == "Heavy Tees"


def test_a_sync_is_due_after_six_hours_and_only_when_connected():
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    on = {"shop_domain": "s.myshopify.com", "api_token": "t" * 10}
    assert judgeme.due(on, now.timestamp())
    assert not judgeme.due({**on, "last_attempt_at": (now - timedelta(hours=5)).isoformat()}, now.timestamp())
    assert judgeme.due({**on, "last_attempt_at": (now - timedelta(hours=7)).isoformat()}, now.timestamp())
    assert not judgeme.due({"shop_domain": "s.myshopify.com"}, now.timestamp())


# ── Yelp ─────────────────────────────────────────────────────────────────────

# Yelp's own embed code, as Yelp's engineering blog shows it.
EMBED = (
    '<span class="yelp-review" data-review-id="QDHdkqBtpPonxjHrzeviNA" data-hostname="www.yelp.com">Read '
    '<a href="https://www.yelp.com/user_details?userid=o84KZeqgy0YGLmz5I9P-pg" rel="nofollow">Krsna V.</a>’s '
    '<a href="https://www.yelp.com/biz/badlands-national-park-interior?hrid=QDHdkqBtpPonxjHrzeviNA" rel="nofollow">review</a> of '
    '<a href="https://www.yelp.com/biz/DMpJYJ0uTQHdDD5xbLWFOA" rel="nofollow">Badlands National Park</a> on '
    '<a href="https://www.yelp.com" rel="nofollow">Yelp</a>'
    '<script async="async" src="https://www.yelp.com/embed/widgets.js" type="text/javascript"></script></span>'
)


def test_yelp_embed_code_becomes_checked_values_only():
    r = yelp.parse_review(EMBED)
    assert r == {
        "id": "QDHdkqBtpPonxjHrzeviNA",
        "alias": "badlands-national-park-interior",
        "author": "Krsna V.",
        "author_url": "https://www.yelp.com/user_details?userid=o84KZeqgy0YGLmz5I9P-pg",
        "review_url": "https://www.yelp.com/biz/badlands-national-park-interior?hrid=QDHdkqBtpPonxjHrzeviNA",
        "business": "Badlands National Park",
    }


def test_a_review_link_works_too():
    r = yelp.parse_review("https://www.yelp.com/biz/kellys-cove-san-francisco-2?hrid=-rXt5NDZwaIOkjHC3oxSEg")
    assert r["id"] == "-rXt5NDZwaIOkjHC3oxSEg" and r["alias"] == "kellys-cove-san-francisco-2"


@pytest.mark.parametrize("bad", [
    "", "hello", "https://evil.example/biz/x?hrid=QDHdkqBtpPonxjHrzeviNA",
    '<span data-review-id="QDHdkqBtpPonxjHrzeviNA"><a href="javascript:alert(1)">x</a></span>',
    '<span data-review-id="bad id!"><a href="https://www.yelp.com/biz/a?hrid=bad">x</a></span>',
])
def test_anything_else_is_refused(bad):
    with pytest.raises(yelp.YelpError):
        yelp.parse_review(bad)


def test_only_the_shops_own_business_reviews_are_kept():
    page = "https://www.yelp.com/biz/badlands-national-park-interior"
    out = yelp.clean(page, [EMBED])
    assert out["url"] == page and [r["id"] for r in out["reviews"]] == ["QDHdkqBtpPonxjHrzeviNA"]
    with pytest.raises(yelp.YelpError):
        yelp.clean("https://www.yelp.com/biz/some-other-shop", [EMBED])


def test_the_page_comes_from_the_first_review_and_duplicates_are_dropped():
    out = yelp.clean("", [EMBED, EMBED])
    assert out["url"] == "https://www.yelp.com/biz/badlands-national-park-interior"
    assert len(out["reviews"]) == 1


def test_kept_reviews_stay_and_the_limit_holds():
    first = yelp.clean("", [EMBED])["reviews"]
    again = yelp.clean("", [], kept=first)
    assert again["reviews"] == first
    many = [dict(first[0], id=f"AAAAAAAAAA{i:02d}") for i in range(yelp.MAX_REVIEWS + 1)]
    with pytest.raises(yelp.YelpError):
        yelp.clean("", [], kept=many)


@pytest.mark.parametrize("raw,want", [
    ("https://www.yelp.com/biz/my-shop-brooklyn", "https://www.yelp.com/biz/my-shop-brooklyn"),
    ("yelp.com/biz/my-shop-brooklyn?osq=tees", "https://www.yelp.com/biz/my-shop-brooklyn"),
    ("https://m.yelp.com/biz/my-shop-brooklyn/", "https://www.yelp.com/biz/my-shop-brooklyn"),
])
def test_the_yelp_page_link_is_made_canonical(raw, want):
    assert yelp.clean_page(raw)["url"] == want


def test_a_page_that_is_not_yelp_is_refused():
    for bad in ("https://www.google.com/biz/x", "https://www.yelp.com/search?q=x", "ftp://www.yelp.com/biz/x"):
        with pytest.raises(yelp.YelpError):
            yelp.clean_page(bad)


# ── Google business ──────────────────────────────────────────────────────────

PLACE = {
    "id": "ChIJN1t_tDeuEmsRUsoyG83frY4",
    "displayName": {"text": "Heavy Tees", "languageCode": "en"},
    "formattedAddress": "1 Main St, Austin, TX",
    "rating": 4.7, "userRatingCount": 212,
    "googleMapsUri": "https://maps.google.com/?cid=1",
    "reviews": [
        {"rating": 5, "text": {"text": "Best tees.", "languageCode": "en"},
         "authorAttribution": {"displayName": "Sam K", "uri": "https://www.google.com/maps/contrib/1",
                               "photoUri": "https://lh3.googleusercontent.com/a/x"},
         "relativePublishTimeDescription": "a month ago", "publishTime": "2025-01-01T00:00:00Z",
         "flagContentUri": "https://www.google.com/local/review/rap/report?x=1",
         "googleMapsUri": "https://www.google.com/maps/reviews/1"},
        {"rating": 9, "text": {"text": "not a rating"}},
        {"rating": 3, "originalText": {"text": "Okay."}, "authorAttribution": {"uri": "javascript:alert(1)"}},
    ],
}


def test_google_answer_keeps_what_google_requires_shown():
    out = google_place.shape(PLACE)
    assert out["name"] == "Heavy Tees" and out["rating"] == 4.7 and out["total"] == 212
    assert len(out["reviews"]) == 2
    first, second = out["reviews"]
    assert first["author"] == "Sam K" and first["author_url"].startswith("https://")
    assert first["report_url"] and first["url"]
    assert second["text"] == "Okay." and second["author"] == "A Google user" and second["author_url"] is None


@pytest.fixture
def places_key(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_PLACES_API_KEY", "test-places-key", raising=False)


def test_search_sends_the_key_and_a_field_mask(places_key):
    seen = []

    def answer(request):
        seen.append(request)
        return httpx.Response(200, json={"places": [PLACE, {"id": "bad id"}]})

    found = run(google_place.search("Heavy Tees Austin", transport=httpx.MockTransport(answer)))
    assert [p["place_id"] for p in found] == [PLACE["id"]]
    assert seen[0].headers["X-Goog-Api-Key"] == "test-places-key"
    assert "places.rating" in seen[0].headers["X-Goog-FieldMask"]


def test_a_refused_key_is_explained_and_the_shop_page_shows_nothing(places_key):
    def answer(request):
        return httpx.Response(403, json={"error": {"status": "PERMISSION_DENIED"}})

    with pytest.raises(google_place.GooglePlaceError) as err:
        run(google_place.details(PLACE["id"], use_cache=False, transport=httpx.MockTransport(answer)))
    assert "Places API" in str(err.value)


def test_without_a_key_google_search_is_off(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_PLACES_API_KEY", "", raising=False)
    assert google_place.configured() is False
    assert run(google_place.for_shop(PLACE["id"])) is None
    with pytest.raises(google_place.GooglePlaceError):
        run(google_place.search("Heavy Tees"))


def test_a_place_id_is_checked_before_google_is_asked(places_key):
    with pytest.raises(google_place.GooglePlaceError):
        run(google_place.details("../../etc", use_cache=False))


# ── Rules and the stored setup ───────────────────────────────────────────────

def test_who_may_write_a_review():
    anyone = {"who": "signed_in", "hold": False}
    buyers = {"who": "buyers", "hold": False}
    assert rules.refusal(anyone, signed_in=False, is_buyer=False) == "Sign in to write a review."
    assert rules.refusal(anyone, signed_in=True, is_buyer=False) is None
    assert rules.refusal(buyers, signed_in=True, is_buyer=False).startswith("Only customers who bought")
    assert rules.refusal(buyers, signed_in=True, is_buyer=True) is None


def test_the_judgeme_token_never_reaches_the_browser():
    view = store.public_view({"rules": store.DEFAULT["rules"],
                              "judgeme": {"shop_domain": "s.myshopify.com", "api_token": "secret-token-1234"},
                              "google_place": {}, "yelp": {}})
    assert "api_token" not in view["judgeme"]
    assert view["judgeme"]["connected"] is True
    assert view["judgeme"]["token_hint"] == "••••1234"
    assert "secret-token-1234" not in repr(view)


def test_each_brand_keeps_its_own_setup():
    assert store.KEY in TENANT_SCOPED_KEYS
    assert "inventory_sync" in TENANT_SCOPED_KEYS


def test_every_per_brand_settings_key_is_kept_per_brand():
    """A service that saves its setup with a tenant id must use a key that is
    namespaced per brand; otherwise every brand reads the same row. The
    inventory sync was missing from the list for its first two releases."""
    root = Path(__file__).resolve().parents[1] / "app" / "services"
    missing = []
    for path in root.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        if "set_setting(" not in text or "tenant_id" not in text:
            continue
        for name, value in re.findall(r'^(\w*KEY)\s*=\s*"([a-z_]+)"', text, flags=re.M):
            if re.search(rf"set_setting\(\s*\w+\s*,\s*{name}\b", text) and value not in TENANT_SCOPED_KEYS:
                missing.append(f"{path.name}:{name}={value}")
    assert not missing, missing


def test_review_sources_are_behind_reviews_and_admin_only():
    from app.api.v1.admin.review_sources import router
    from app.core.database import get_db
    from app.middleware.auth_middleware import require_admin

    assert feature_for_path("/api/v1/admin/review-sources/judgeme") == "reviews"
    for route in router.routes:
        calls = [d.call for d in route.dependant.dependencies]
        assert require_admin in calls and get_db in calls, route.path
