"""The order page's Conversion summary (services/attribution.journey).

The browser lists every visit (frontend lib/attribution.ts); the server cleans
the list, names where each visit came from, and counts the sessions and days.
"""
from datetime import datetime
from types import SimpleNamespace

from app.services import attribution


def _order(meta=None, *, created="2026-10-27T15:00:00+00:00", **utm):
    fields = {f: None for f in attribution.UTM_FIELDS}
    fields.update(utm)
    return SimpleNamespace(attribution=meta, created_at=datetime.fromisoformat(created), **fields)


def test_the_shopify_example_bing_then_a_return_then_bing():
    sent = {
        "visits": 3,
        "sessions": [
            {"at": "2026-10-23T16:02:00.000Z", "last": "2026-10-23T16:20:00.000Z",
             "referrer": "https://www.bing.com/", "landing_page": "https://ezdtfmaker.com/"},
            {"at": "2026-10-25T10:00:00.000Z", "landing_page": "https://ezdtfmaker.com/products/tee"},
            {"at": "2026-10-27T14:40:00.000Z", "referrer": "https://www.bing.com/",
             "landing_page": "https://ezdtfmaker.com/"},
        ],
    }
    data = attribution.clean(sent)
    order = _order(data["meta"])
    j = attribution.journey(order, order_count=3)

    assert j["order_count"] == 3
    assert j["total_sessions"] == 3
    assert j["days_to_conversion"] == 4
    first, middle, last = j["sessions"]
    assert first["kind"] == "search" and first["short"] == "Bing"
    assert first["text"] == "Visited your store from an organic search result on Bing"
    assert first["landing_page"] == "https://ezdtfmaker.com/"
    assert first["utm"] == {}
    assert middle["kind"] == "direct"
    assert last["short"] == "Bing"


def test_each_source_is_named_as_a_brand_reads_it():
    cases = [
        ({}, "direct", "a direct visit"),
        ({"referrer": "https://www.google.com/"}, "search", "Google"),
        ({"referrer": "https://www.google.co.uk/"}, "search", "Google"),
        ({"referrer": "https://duckduckgo.com/"}, "search", "DuckDuckGo"),
        ({"referrer": "https://mail.google.com/"}, "email", "an email (Gmail)"),
        ({"referrer": "https://gemini.google.com/app"}, "ai", "Gemini"),
        ({"referrer": "https://chatgpt.com/"}, "ai", "ChatGPT"),
        ({"referrer": "https://l.instagram.com/"}, "social", "Instagram"),
        ({"referrer": "https://t.co/abc"}, "social", "X (Twitter)"),
        ({"referrer": "https://blog.example.com/best-dtf"}, "referral", "blog.example.com"),
        ({"gclid": "x"}, "paid_search", "Google Ads"),
        ({"msclkid": "x", "referrer": "https://www.bing.com/"}, "paid_search", "Bing Ads"),
        ({"ttclid": "x"}, "paid_social", "a TikTok ad"),
        ({"fbclid": "x", "referrer": "https://l.instagram.com/"}, "meta_click", "Instagram"),
        ({"fbclid": "x"}, "meta_click", "Facebook"),
        ({"utm_source": "google", "utm_medium": "cpc"}, "paid_search", "Google Ads"),
        ({"utm_source": "fb", "utm_medium": "paid"}, "paid_social", "a Facebook ad"),
        ({"utm_source": "facebook", "utm_medium": "paid_social", "fbclid": "x"}, "paid_social", "a Facebook ad"),
        ({"utm_source": "instagram", "utm_medium": "social"}, "social", "Instagram"),
        ({"utm_source": "klaviyo", "utm_medium": "email"}, "email", "an email (Klaviyo)"),
        ({"utm_source": "newsletter"}, "email", "an email"),
        ({"utm_source": "google", "utm_medium": "organic"}, "search", "Google"),
        ({"utm_source": "partner_blog", "utm_medium": "affiliate"}, "referral", "partner_blog"),
        ({"utm_source": "spring_flyer"}, "campaign", "spring_flyer"),
    ]
    for visit, kind, short in cases:
        named = attribution.classify(visit)
        assert (named["kind"], named["short"]) == (kind, short), visit


def test_the_details_carry_the_utms_and_the_ad_click():
    order = _order(attribution.clean({
        "sessions": [{"at": "2026-10-27T14:00:00Z", "utm_source": "Google", "utm_medium": "CPC",
                      "utm_campaign": "Fall Sale", "gclid": "abc", "landing_page": "https://shop.example/"}],
    })["meta"])
    s = attribution.journey(order)["sessions"][0]
    assert s["utm"] == {"utm_source": "google", "utm_medium": "cpc", "utm_campaign": "Fall Sale"}
    assert s["ad_click"] == "Google Ads"
    assert s["text"] == "Visited your store from a search ad on Google"


def test_anything_that_is_not_a_visit_is_dropped():
    meta = attribution.clean({
        "sessions": [
            "nonsense", {"at": "yesterday"}, {"no": "time"},
            {"at": "2026-10-27T14:00:00Z", "referrer": 42, "evil": "<script>", "utm_source": "x" * 999},
        ] + [{"at": "2026-10-20T10:00:00Z"}] * 40,
    })["meta"]
    sessions = meta["sessions"]
    assert len(sessions) <= attribution.MAX_SESSIONS
    assert all("evil" not in s and "no" not in s for s in sessions)
    kept = [s for s in sessions if s["at"].startswith("2026-10-27")]
    assert kept and "referrer" not in kept[0] and len(kept[0]["utm_source"]) == 255
    # Oldest first, whatever order the browser sent.
    assert [s["at"] for s in sessions] == sorted(s["at"] for s in sessions)


def test_an_order_from_before_visits_were_listed_shows_its_one_visit():
    order = _order(
        {"referrer": "https://l.facebook.com/", "landing_page": "https://shop.example/",
         "first_seen": "2026-10-01T09:00:00.000Z", "visits": 4, "fbclid": "x"},
        utm_source="facebook", utm_medium="paid_social", utm_campaign="fall",
    )
    j = attribution.journey(order, order_count=1)
    assert j["total_sessions"] == 4
    assert len(j["sessions"]) == 1
    assert j["sessions"][0]["short"] == "a Facebook ad"
    assert j["sessions"][0]["utm"]["utm_campaign"] == "fall"
    assert j["days_to_conversion"] == 26


def test_an_order_with_nothing_recorded_says_so():
    j = attribution.journey(_order(None), order_count=2)
    assert j["sessions"] == [] and j["total_sessions"] == 0
    assert j["days_to_conversion"] is None
    assert j["order_count"] == 2


def test_a_direct_only_order_reads_direct_in_the_list():
    meta = attribution.clean({"first_seen": "2026-10-27T14:00:00Z", "visits": 1,
                              "sessions": [{"at": "2026-10-27T14:00:00Z"}]})["meta"]
    assert attribution.summary(_order(meta))["label"] == "Direct"
    # A campaign on the order still names it.
    assert attribution.summary(_order(meta, utm_source="google", utm_medium="cpc"))["label"] == "google / cpc"


def test_days_count_calendar_days_and_never_go_below_zero():
    meta = {"sessions": [{"at": "2026-10-27T23:50:00+00:00"}]}
    assert attribution.journey(_order(meta, created="2026-10-28T00:10:00+00:00"))["days_to_conversion"] == 1
    clock_skew = {"sessions": [{"at": "2026-10-29T10:00:00+00:00"}]}
    assert attribution.journey(_order(clock_skew))["days_to_conversion"] == 0
    assert attribution.journey(_order(meta, created="2026-10-28T00:10:00"))["converted_at"].endswith("+00:00")
