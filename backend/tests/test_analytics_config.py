"""A brand's tracking IDs: what is saved when an admin pastes the whole snippet."""
from app.services import analytics_config as svc

GA4_SNIPPET = """<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-JLFGS9K0GP"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-JLFGS9K0GP');
</script>"""

META_SNIPPET = """<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){};}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1234567890123456');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=1234567890123456&ev=PageView&noscript=1"/></noscript>"""


def saved(key: str, value: str) -> dict:
    return svc.clean({"enabled": True, "tools": {key: {"id": value, "enabled": True}}})


def test_ga4_snippet_saves_as_its_measurement_id():
    config = saved("ga4", GA4_SNIPPET)
    assert config["tools"]["ga4"] == {"id": "G-JLFGS9K0GP", "enabled": True}
    assert svc.validate(config) == []
    assert svc.public(config)["tools"] == {"ga4": "G-JLFGS9K0GP"}


def test_snippets_of_the_other_tools_save_as_their_ids():
    cases = {
        "gtm": ("<script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-AB12CD3');</script>",
                "GTM-AB12CD3"),
        "meta_pixel": (META_SNIPPET, "1234567890123456"),
        "clarity": ('<script>(function(c,l,a,r,i,t,y){})(window, document, "clarity", "script", "abcd1234ef");</script>',
                    "abcd1234ef"),
        "tiktok_pixel": ("<script>ttq.load('C4ABCDEFGHIJ1234567K');ttq.page();</script>", "C4ABCDEFGHIJ1234567K"),
        "pinterest_tag": ("<script>pintrk('load', '2612345678901', {em: ''});pintrk('page');</script>",
                          "2612345678901"),
        "snap_pixel": ("<script>snaptr('init', '0a1b2c3d-0000-4e5f-9a8b-0c1d2e3f4a5b', {});</script>",
                       "0a1b2c3d-0000-4e5f-9a8b-0c1d2e3f4a5b"),
        "klaviyo": ('<script async src="https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=AbC123"></script>',
                    "AbC123"),
        "omnisend": ('<script>omnisend.push(["accountID", "60f0a1b2c3d4e5f6a7b8c9d0"]);</script>',
                     "60f0a1b2c3d4e5f6a7b8c9d0"),
    }
    for key, (snippet, expected) in cases.items():
        config = saved(key, snippet)
        assert config["tools"][key]["id"] == expected, key
        assert svc.validate(config) == [], key


def test_a_correct_id_is_kept_as_typed():
    assert saved("ga4", "  G-JLFGS9K0GP ")["tools"]["ga4"]["id"] == "G-JLFGS9K0GP"
    assert saved("meta_pixel", "1234567890123456")["tools"]["meta_pixel"]["id"] == "1234567890123456"


def test_a_wrong_value_without_an_id_in_it_is_still_flagged():
    config = saved("ga4", "UA-12345-1")
    assert config["tools"]["ga4"]["id"] == "UA-12345-1"
    assert "does not look like" in svc.validate(config)[0]


def test_a_snippet_saved_before_this_reads_back_as_its_id():
    # A snippet saved past the format check was cut to 200 characters; the ID
    # is near the top, so loading it still finds the ID.
    stored = {"enabled": True, "tools": {"ga4": {"id": GA4_SNIPPET[:200], "enabled": True}}}
    assert svc.clean(stored)["tools"]["ga4"]["id"] == "G-JLFGS9K0GP"


def test_the_extract_pattern_never_reaches_the_admin_screen():
    assert all("extract" not in tool for tool in svc.TOOLS)
