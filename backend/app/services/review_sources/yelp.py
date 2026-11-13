"""Yelp: the brand's Yelp page, and its Yelp reviews shown by Yelp itself.

Yelp's API terms forbid using it on behalf of anyone else and keeping anything
it returns for more than a day, so the platform does not call it. Instead:

* the brand's Yelp page link, for a "Read our reviews on Yelp" link; and
* single reviews the brand picks with Yelp's own "Embed review" (on yelp.com,
  the three dots on a review → Embed review). Yelp's script draws each one on
  the shop, always current and straight from Yelp, so it cannot be edited or
  made up.

From the pasted code only the review id and Yelp's own links are kept. The
pasted HTML itself is never stored or put on a page: the shop draws its own
copy of Yelp's snippet from those few checked values.

Every review must belong to the brand's own Yelp business, so a shop cannot
show another business's reviews as its own.
"""
from __future__ import annotations

import html
import re
from urllib.parse import parse_qs, unquote, urlparse

MAX_REVIEWS = 10

_HOSTS = {"yelp.com", "www.yelp.com", "m.yelp.com"}
_REVIEW_ID = re.compile(r"^[A-Za-z0-9_-]{10,40}$")
_ALIAS = re.compile(r"^[A-Za-z0-9_.~%-]{2,200}$")
_USER_ID = re.compile(r"^[A-Za-z0-9_-]{10,40}$")


class YelpError(Exception):
    """Something the brand needs to fix, in plain words."""


def _yelp(url: str) -> tuple[str, dict] | None:
    """(path, query) of a Yelp link, or None if it is not one."""
    try:
        parsed = urlparse(html.unescape(url.strip()))
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or (parsed.hostname or "").lower() not in _HOSTS:
        return None
    return parsed.path, parse_qs(parsed.query)


def _alias(path: str) -> str | None:
    match = re.match(r"^/biz/([^/?#]+)/?$", path or "")
    if not match:
        return None
    alias = match.group(1)
    return alias if _ALIAS.match(alias) else None


def clean_page(raw: str | None) -> dict:
    """The brand's Yelp page as a canonical link: https://www.yelp.com/biz/<name>."""
    value = (raw or "").strip()
    if value and "://" not in value:
        value = "https://" + value
    found = _yelp(value) if value else None
    alias = _alias(found[0]) if found else None
    if not alias:
        raise YelpError("Paste your business page link from Yelp, like https://www.yelp.com/biz/your-business-city.")
    return {"url": f"https://www.yelp.com/biz/{alias}", "alias": alias}


_LINK = re.compile(r"""<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>(.*?)</a>""", re.I | re.S)


def _plain(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def parse_review(raw: str | None) -> dict:
    """One Yelp review from Yelp's embed code or the review's own link."""
    text = (raw or "").strip()
    if not text:
        raise YelpError("Paste the embed code Yelp gives you for the review.")

    review_id = None
    match = re.search(r"""data-review-id\s*=\s*["']([^"']+)["']""", text, re.I)
    if match:
        review_id = match.group(1).strip()

    alias = author = author_url = business = None
    links = _LINK.findall(text) if "<" in text else [(text, "")]
    for href, inner in links:
        found = _yelp(href)
        if not found:
            continue
        path, query = found
        if path.startswith("/user_details"):
            user = (query.get("userid") or [""])[0]
            if _USER_ID.match(user):
                author_url = f"https://www.yelp.com/user_details?userid={user}"
                author = _plain(inner)[:120] or None
            continue
        biz = _alias(path)
        if not biz:
            continue
        hrid = (query.get("hrid") or [""])[0]
        if hrid:
            review_id = review_id or hrid
            if hrid == review_id:
                alias = biz
        elif inner and not business:
            business = _plain(inner)[:150] or None

    if not review_id or not _REVIEW_ID.match(review_id):
        raise YelpError("That is not a Yelp review. On yelp.com open the review's three dots → Embed review, and paste the code.")
    if not alias:
        raise YelpError("That code has no link to the business on Yelp. Copy the whole embed code from Yelp.")
    return {
        "id": review_id,
        "alias": unquote(alias)[:200],
        "author": author,
        "author_url": author_url,
        "review_url": f"https://www.yelp.com/biz/{alias}?hrid={review_id}",
        "business": business,
    }


def clean(page: str | None, codes: list[str] | None, *, kept: list[dict] | None = None) -> dict:
    """The brand's Yelp setup, checked. Reviews must be of the brand's business.

    `kept` are reviews saved before (already checked) that stay; `codes` are
    new embed codes or review links.
    """
    out: dict = {"url": None, "alias": None, "reviews": []}
    if page and page.strip():
        out.update(clean_page(page))
    new: list[dict] = []
    for i, code in enumerate([c for c in (codes or []) if c and c.strip()], start=1):
        try:
            new.append(parse_review(code))
        except YelpError as exc:
            raise YelpError(f"Review {i}: {exc}")

    reviews: list[dict] = []
    for review in [*(kept or []), *new]:
        if out["alias"] is None:
            out.update({"url": f"https://www.yelp.com/biz/{review['alias']}", "alias": review["alias"]})
        if unquote(out["alias"]).lower() != unquote(str(review.get("alias") or "")).lower():
            raise YelpError("A review is for a different business on Yelp. Only your own business's reviews can be shown.")
        if all(r["id"] != review["id"] for r in reviews):
            reviews.append(review)
    if len(reviews) > MAX_REVIEWS:
        raise YelpError(f"Show up to {MAX_REVIEWS} Yelp reviews. Remove one to add another.")
    out["reviews"] = reviews
    return out
