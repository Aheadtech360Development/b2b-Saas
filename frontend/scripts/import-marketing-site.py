"""Turn the static printcopilot.co design (printcopilot-site/*.html) into the
modules the website renders (src/components/marketing/site/pages/*.ts).

    python frontend/scripts/import-marketing-site.py            # from the repo root

Run it again whenever the design folder changes; nothing generated is edited
by hand. For each page it keeps the design's CSS and markup as they are, and:

* points every placeholder link ("#") at the real page, by what the link says
  (Book a demo -> /demo, Log in -> /login, Start on Starter -> /signup?plan=starter,
  a feature in the menu -> its section of /features, a blog card -> its post);
  an in-page anchor whose target is on the same page is kept;
* replaces the plan prices with tokens the server fills from the prices the
  super admin sets ($97 -> %%PRICE:starter%%), and on the affiliate page the
  program's own numbers (rate, earnings, hold, minimum payout, cookie days);
* marks the four forms (demo, contact, affiliate application, newsletter) and
  their submit links for the browser code that sends them (SiteWire);
* drops inline event handlers, and moves images to /site/.
"""
from __future__ import annotations

import html as htmllib
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "printcopilot-site"
OUT = ROOT / "frontend" / "src" / "components" / "marketing" / "site" / "pages"
PUBLIC = ROOT / "frontend" / "public" / "site"

# key -> (file, path on printcopilot.co)
PAGES: dict[str, tuple[str, str]] = {
    "home": ("index.html", "/"),
    "features": ("features.html", "/features"),
    "pricing": ("pricing.html", "/pricing"),
    "demo": ("demo.html", "/demo"),
    "contact": ("contact.html", "/contact"),
    "about": ("about.html", "/about"),
    "affiliate": ("affiliate.html", "/affiliate"),
    "blog": ("blog.html", "/blog"),
    "blog-online-brand-app-stack": ("blog-online-brand-app-stack.html", "/blog/online-brand-app-stack"),
    "blog-sell-dtf-gang-sheets-online": ("blog-sell-dtf-gang-sheets-online.html", "/blog/sell-dtf-gang-sheets-online"),
    "blog-tiered-wholesale-pricing-blank-apparel": (
        "blog-tiered-wholesale-pricing-blank-apparel.html", "/blog/tiered-wholesale-pricing-blank-apparel"),
    "brands": ("brands.html", "/brands"),
    "dtf": ("dtf.html", "/dtf"),
    "examples": ("examples.html", "/examples"),
    "help": ("help.html", "/help"),
    "print-shops": ("print-shops.html", "/print-shops"),
    "wholesale": ("wholesale.html", "/wholesale"),
}

FORM_OF = {"demo": "demo", "contact": "contact", "affiliate": "affiliate", "blog": "newsletter"}

PLAN_OF_PRICE = {"79": "retail", "97": "starter", "297": "wholesale", "497": "scale"}

# Link text (start of it) -> where it goes. First match wins; blog cards come
# first because their text starts with a topic that is also a page.
RULES: list[tuple[str, str]] = [
    (r"How to sell DTF gang", "/blog/sell-dtf-gang-sheets-online"),
    (r"The app stack a small online bran", "/blog/online-brand-app-stack"),
    (r"How to set up tiered wholesale", "/blog/tiered-wholesale-pricing-blank-apparel"),
    (r"^Log in to your portal", "/partners/login"),
    (r"^Log in\b", "/login?tenant="),
    (r"^Start on Retail", "/signup?plan=retail"),
    (r"^Start on Starter", "/signup?plan=starter"),
    (r"^Start on Wholesale", "/signup?plan=wholesale"),
    (r"^Start on Scale", "/signup?plan=scale"),
    (r"^Start (free trial|your 14 day free trial)", "/signup"),
    (r"^(Book a demo|Choose a time)", "/demo"),
    (r"^Apply to join", "/affiliate#apply"),
    (r"^Affiliate Terms", "/affiliate-terms"),
    (r"^(Affiliate|Affiliate program|Join the affiliate program)\b", "/affiliate"),
    (r"^About\b", "/about"),
    (r"^Contact\b", "/contact"),
    (r"^Blog\b", "/blog"),
    (r"^(Examples|Live stores|See the examples|See the stores|Browse the stores|See live stores)\b", "/examples"),
    (r"^(Features|Explore all features)$", "/features"),
    (r"^Help center", "/help"),
    (r"^(Pricing|Compare plans|Compare every plan|See plans|print plans|See the Scale plan)\b", "/pricing"),
    (r"^PrintCoPilot$", "/"),
    (r"^Privacy Policy", "/privacy-policy"),
    (r"^Terms of Service", "/terms"),
    (r"^Cookie Policy", "/cookie-policy"),
    (r"^Acceptable Use", "/terms#acceptable-use-and-intellectual-property"),
    (r"^Data Processing", "/data-processing-addendum"),
    (r"^(Brands selling direct|See the Brands page|Brands page|My own brand|Brands)\b", "/brands"),
    (r"^(Custom print shops|See the Print shops page|Custom printing)\b", "/print-shops"),
    (r"^(DTF and gang sheet shops|DTF and gang sheets|See the DTF page|DTF page)\b", "/dtf"),
    (r"^(Wholesalers and blank suppliers|Wholesale and blanks|See the Wholesale page|Wholesale page)\b", "/wholesale"),
]

# In-page anchors of the design that mean another page when that page lacks them.
ANCHORS = {
    "#plans": "/pricing", "#pricing": "/pricing", "#examples": "/examples", "#stores": "/examples",
    "#features": "/features", "#affiliate": "/affiliate", "#apply": "/affiliate#apply",
    "#path-brand": "/brands", "#path-dtf": "/dtf", "#path-print": "/print-shops", "#path-wholesale": "/wholesale",
    "#top": "#top",
}


def text_of(fragment: str) -> str:
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def spans(body: str, tag: str) -> list[tuple[int, int]]:
    return [(m.start(), m.end()) for m in re.finditer(rf"<{tag}\b.*?</{tag}>", body, re.S)]


def inside(pos: int, ranges: list[tuple[int, int]]) -> bool:
    return any(a <= pos < b for a, b in ranges)


def feature_sections() -> dict[str, str]:
    """Which /features section each item of the Features menu opens: Sell, Run,
    Grow or AI, as the page groups them (its h3 headings under each id)."""
    return {
        "Build with AI": "/features#sell",          # the storefront builder that designs from a prompt
        "Gang sheet builder": "/features#sell",
        "Product designer": "/features#sell",
        "Storefront and website": "/features#sell",
        "Wholesale tools": "/features#run",
        "Production queue": "/features#run",
        "Supplier catalogs and stock": "/features#run",
        "Upsell, bundles, gift cards": "/features#grow",
        "Reviews and loyalty": "/features#grow",
        "Live chat": "/features#grow",
        "Copilot AI analytics": "/features#ai",
        "Owner app": "/features#ai",
    }


def rewrite_links(key: str, body: str, ids: set[str], features: dict[str, str], unmapped: list[str]) -> str:
    chrome = spans(body, "header") + spans(body, "footer")
    forms = spans(body, "form")

    def fix(m: re.Match) -> str:
        attrs, inner = m.group(1), m.group(2)
        href_m = re.search(r'href="([^"]*)"', attrs)
        href = href_m.group(1) if href_m else None
        if href is None or not href.startswith("#"):
            return m.group(0)
        words = text_of(inner)
        pos = m.start()
        new = None
        if inside(pos, forms) and not words.startswith("Log in to your portal"):
            # The form's own button: SiteWire sends the form when it is pressed.
            return f'<a{attrs.replace(href_m.group(0), "href=\"#\" data-pc-submit=\"1\"")}>{inner}</a>'
        if words == "Search" and key == "help":
            return f'<a{attrs.replace(href_m.group(0), "href=\"#\" data-pc-search=\"1\"")}>{inner}</a>'
        in_chrome = inside(pos, chrome)
        # "Start ..." means sign up, wherever the design pointed it. On a plan's
        # card it signs up for that plan (the nearest plan price above it), as
        # the old site's pricing cards did.
        if re.match(r"Start (free trial|your 14 day free trial|on )", words):
            plan = None
            if words.startswith("Start on "):
                plan = words.split()[2].lower()
            elif not in_chrome:
                # The plan's card the button sits in (a "card plan" box), else
                # the stretch of page since the last link.
                card = max(body.rfind('class="card plan', 0, pos), body.rfind("class='card plan", 0, pos))
                if card >= 0 and pos - card < 8000 and "</section>" not in body[card:pos]:
                    before = body[card:pos]
                else:
                    before = body[max(0, pos - 1800):pos]
                    before = before[before.rfind("</a>") + 1:]
                prices = list(re.finditer(r"\$(79|97|297|497)(?![\d.,])", before))
                if prices:
                    plan = PLAN_OF_PRICE[prices[-1].group(1)]
            target = f"/signup?plan={plan}" if plan in PLAN_OF_PRICE.values() else "/signup"
            return f'<a{attrs.replace(href_m.group(0), f"href=\"{target}\"")}>{inner}</a>'
        if len(href) > 1 and href[1:] in ids and not in_chrome:
            return m.group(0)
        for item, target in features.items():
            if words.startswith(item):
                new = target
                break
        if new is None:
            for pattern, target in RULES:
                if re.search(pattern, words, re.I):
                    new = target
                    break
        if new is None and href in ANCHORS:
            new = ANCHORS[href]
        if new is None:
            unmapped.append(f"{key}: {href} {words[:50]!r}")
            return m.group(0)
        if key == "affiliate" and new == "/affiliate#apply" and "apply" in ids:
            new = "#apply"
        return f'<a{attrs.replace(href_m.group(0), f"href=\"{new}\"")}>{inner}</a>'

    return re.sub(r"<a\b([^>]*)>(.*?)</a>", fix, body, flags=re.S)


def tokens_in_text(body: str, fn) -> str:
    """Apply fn to text between tags only, never inside a tag or an attribute."""
    parts = re.split(r"(<[^>]+>)", body)
    return "".join(p if p.startswith("<") else fn(p) for p in parts)


def price_tokens(text: str) -> str:
    return re.sub(r"(?<![\d.,])\$(79|97|297|497)(?![\d.,])", lambda m: f"%%PRICE:{PLAN_OF_PRICE[m.group(1)]}%%", text)


def affiliate_tokens(text: str) -> str:
    for amount, plan in (("15.80", "retail"), ("19.40", "starter"), ("59.40", "wholesale"),
                         ("99.40", "scale"), ("194.00", "total")):
        text = text.replace(f"${amount}", f"%%EARN:{plan}%%")
    text = re.sub(r"(?<![\d.])20%", "%%RATE%%", text)
    text = re.sub(r"(?<![\d.,])\$50(?![\d.,])", "%%MINPAY%%", text)
    text = re.sub(r"\b30 (day|days)\b", r"%%HOLD%% \1", text)
    text = re.sub(r"\b90 day\b", "%%COOKIE%% day", text)
    return text


CONTACT_DETAILS = (
    '<p style="font-size:17px;line-height:26px;color:#DCE6F5;margin-top:12px" data-support-hours>'
    "Hours: Monday to Friday, 9am to 5pm US Eastern Time</p>"
    '<p style="font-size:17px;line-height:26px;color:#DCE6F5;margin-top:12px" data-company-address>'
    "AheadTech360 LLC<br>30 N Gould St, Ste N<br>Sheridan, WY 82801, USA</p>"
)


def add_contact_details(body: str) -> str:
    """The company's address and support hours under the email on Contact
    (the manager's list for printcopilot.co, Nov 2026; the design has the email only)."""
    email = re.search(r'<p[^>]*>Email: <a href="mailto:support@printcopilot\.co"[^>]*>support@printcopilot\.co</a></p>', body)
    if not email:
        raise SystemExit("contact.html: the Email line moved; place the address and hours by hand")
    return body[:email.end()] + CONTACT_DETAILS + body[email.end():]


# The platform's own logo file, as the old site showed it (components/shared/
# PlatformLogo): the off-white wordmark, 210px wide in the header (135px on a
# phone) and 240px in the footer. The design sets the name in type instead.
LOGO_SRC = "/wordmark-horizontal_color-on-dark_1200w.png"
LOGO_CSS = (
    ".wordmark{display:inline-flex;align-items:center;line-height:0}"
    ".wordmark .pc-logo{display:block;width:210px;height:auto}"
    "footer .wordmark .pc-logo{width:240px}"
    "@media (max-width:560px){header .wordmark .pc-logo{width:135px}}"
)


def swap_logo(body: str) -> str:
    footers = spans(body, "footer")

    def fix(m: re.Match) -> str:
        width, height = (240, 32) if inside(m.start(), footers) else (210, 28)
        return (f'{m.group(1)}<img class="pc-logo" src="{LOGO_SRC}" alt="PrintCoPilot" '
                f'width="{width}" height="{height}"></a>')

    out, n = re.subn(r'(<a\b[^>]*class="wordmark"[^>]*>)\s*PrintCoPilot\s*</a>', fix, body)
    if not n:
        raise SystemExit("no wordmark found: the design's logo markup changed")
    return out


# The app's own stylesheet has a `.card` (24px padding and a shadow) that the
# design's cards do not have; it pushed the plan cards' navy price block in from
# the card's edges. Undone here, ahead of the design's CSS, at the lowest weight,
# so every card rule the design writes itself still wins.
RESET_CSS = ":where(#pc-site) .card{padding:0;box-shadow:none}"

# Phone fixes the owner asked for (2026-11-14), on top of the design's own:
# the home page's customer strip as two tidy rows, the home plan table fitted
# to the screen instead of cut off (ticks and dashes for Included / Not
# included, as the pricing page's table does), the help search on one row, and
# the forms' select boxes drawn like their text boxes.
CHEVRON = (
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' "
    "viewBox='0 0 24 24' fill='none' stroke='%23475467' stroke-width='2.2' stroke-linecap='round' "
    "stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")"
)
MOBILE_CSS = (
    ".fm select{-webkit-appearance:none;appearance:none;background-image:" + CHEVRON + ";"
    "background-repeat:no-repeat;background-position:right 14px center;background-size:16px;padding-right:40px}"
    "h2+.fm{margin-top:20px}"
    "@media (max-width:560px){"
    ".pc-strip{flex-direction:column!important;gap:2px!important}"
    ".pc-strip>span:nth-child(3){display:none!important}"
    ".pc-strip>span:nth-child(4){margin-top:14px}"
    ".pc-strip>span:nth-child(5){gap:4px 22px!important}"
    ".tbl-wrap table{min-width:0;font-size:13px;line-height:18px}"
    ".tbl-wrap th,.tbl-wrap td{padding:10px 3px!important}"
    ".tbl-wrap tbody th{padding-left:12px!important}"
    ".tbl-wrap thead th{font-size:12px;line-height:16px}"
    ".tbl-wrap td.yes,.tbl-wrap td.dash{font-size:0;line-height:0}"
    ".tbl-wrap td.yes::before{content:'\\2713';font-size:17px;line-height:18px;font-weight:700;color:#067647}"
    ".tbl-wrap td.dash::before{content:'\\2013';font-size:17px;line-height:18px;color:#98A2B3}"
    ".hs{flex-direction:row!important;gap:6px}"
    ".hs input{padding:0 10px}"
    ".hs .btn{flex:none;width:auto;padding:0 18px}"
    "}"
)


def mark_strip(key: str, body: str) -> str:
    """Name the home page's customer strip, so the phone rules can reach it."""
    if key != "home":
        return body
    out, n = re.subn(r'<div class="wrap"(?= style="[^"]*">\s*<span[^>]*>Live customer</span>)', '<div class="wrap pc-strip"', body)
    if n != 1:
        raise SystemExit("home: the customer strip's markup changed")
    return out


def mark_form(key: str, body: str) -> str:
    kind = FORM_OF.get(key)
    if not kind:
        return body
    return re.sub(r"<form\b", f'<form data-pc-form="{kind}"', body, count=1)


def convert(key: str, file: str, features: dict[str, str], unmapped: list[str]) -> dict:
    t = (SRC / file).read_text(encoding="utf-8")
    title = text_of(re.search(r"<title>(.*?)</title>", t, re.S).group(1)) if "<title>" in t else ""
    desc_m = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', t)
    # The export repeats the head's stylesheet (and the font links) in a
    # <helmet> block at the top of the body: one copy is kept.
    blocks: list[str] = []
    for block in re.findall(r"<style[^>]*>(.*?)</style>", t, re.S):
        if block not in blocks:
            blocks.append(block)
    css = "\n".join(blocks)
    body = re.search(r"<body[^>]*>(.*)</body>", t, re.S).group(1)
    body = re.sub(r"<helmet>.*?</helmet>", "", body, flags=re.S)
    body = re.sub(r"<script\b.*?</script>", "", body, flags=re.S)
    # Inline handlers (onsubmit="return false") are not carried: the browser code sends the forms.
    body = re.sub(r'\s+on[a-z]+="[^"]*"', "", body)
    body = re.sub(r'\s(src|href)="images/', r' \1="/site/', body)
    css = css.replace("url(images/", "url(/site/").replace("url('images/", "url('/site/").replace('url("images/', 'url("/site/')
    ids = set(re.findall(r'\bid="([^"]+)"', body))
    body = rewrite_links(key, body, ids, features, unmapped)
    body = mark_form(key, body)
    body = swap_logo(body)
    body = mark_strip(key, body)
    css = RESET_CSS + "\n" + css + "\n" + LOGO_CSS + "\n" + MOBILE_CSS
    if key == "contact":
        body = add_contact_details(body)
    body = tokens_in_text(body, price_tokens)
    if key == "affiliate":
        body = tokens_in_text(body, affiliate_tokens)
    return {"title": title, "description": htmllib.unescape(desc_m.group(1)) if desc_m else "", "css": css, "html": body}


def main() -> int:
    if not SRC.exists():
        print(f"No design folder at {SRC}")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for img in (SRC / "images").glob("*"):
        shutil.copy2(img, PUBLIC / img.name)
    features = feature_sections()
    unmapped: list[str] = []
    for key, (file, path) in PAGES.items():
        page = convert(key, file, features, unmapped)
        page["path"] = path
        (OUT / f"{key}.ts").write_text(
            f"// Generated by frontend/scripts/import-marketing-site.py from printcopilot-site/{file}.\n"
            "// Do not edit: change the design and run the script again.\n"
            f"const page = {json.dumps(page, ensure_ascii=False)};\n"
            "export default page;\n",
            encoding="utf-8", newline="\n",
        )
        print(f"{key:48} {len(page['html']):7} html  {len(page['css']):6} css  {path}")
    print("feature menu ->", json.dumps(features))
    if unmapped:
        print("\nLinks left as they were (check):")
        for u in sorted(set(unmapped)):
            print("  ", u)
    return 0


if __name__ == "__main__":
    sys.exit(main())
