"""A partner's sign-in stays apart from a shop's: neither token opens the
other's doors. And a W-9 is checked by what it is, then kept sealed."""
import pytest

from app.core.security import create_access_token, decode_token
from app.middleware.auth_middleware import AuthMiddleware
from app.services.partners import auth, docs


def test_a_partner_token_is_never_a_shop_token_and_back():
    token = auth.access_token("p1", 3)
    # The middleware lets only "access" tokens through to shop, admin and
    # platform routes, so a partner token is refused there.
    assert decode_token(token)["type"] == "partner"
    assert auth.read(token, auth.ACCESS)["sv"] == 3
    shop = create_access_token("u1", {"tenant_id": "t1", "is_admin": True})
    assert auth.read(shop, auth.ACCESS) is None
    assert auth.read(auth.refresh_token("p1", 1), auth.ACCESS) is None
    assert auth.read(auth.challenge_token("p1"), auth.ACCESS) is None
    assert auth.read(auth.statement_ticket("p1"), auth.ACCESS) is None
    assert auth.read("not-a-token", auth.ACCESS) is None


def test_viewing_as_an_affiliate_is_marked_in_the_token():
    claims = auth.read(auth.access_token("p1", 1, view_as="admin-1"), auth.ACCESS)
    assert claims["view_as"] == "admin-1"
    assert "view_as" not in auth.read(auth.access_token("p1", 1), auth.ACCESS)


def test_only_the_partner_routes_skip_the_shop_sign_in():
    mw = AuthMiddleware(app=None)
    assert mw._is_public("/api/v1/partners/me/dashboard")
    assert mw._is_public("/api/v1/partners/auth/login")
    assert not mw._is_public("/api/v1/platform/affiliates/overview")
    assert not mw._is_public("/api/v1/admin/orders")


def test_new_passwords_and_one_time_links():
    assert auth.password_problem("short1") == "Use at least 8 characters."
    assert auth.password_problem("onlyletters") == "Mix letters with numbers or symbols."
    assert auth.password_problem("Partner2026!") is None
    raw, digest = auth.link_token()
    assert auth.digest(raw) == digest and raw != digest and len(raw) > 30


def test_a_w9_is_checked_by_its_content_and_sealed():
    pdf = b"%PDF-1.7\n1 0 obj << >> endobj\n%%EOF"
    assert docs.check(pdf) == "application/pdf"
    assert docs.check(b"\x89PNG\r\n\x1a\n....") == "image/png"
    for bad in (b"", b"MZ\x90\x00 a program named w9.pdf", b"x" * (docs.MAX_BYTES + 1)):
        with pytest.raises(docs.DocumentError):
            docs.check(bad)
    sealed = docs.seal(pdf)
    assert pdf not in sealed and docs.unseal(sealed) == pdf
    with pytest.raises(docs.DocumentError):
        docs.unseal(b"gAAAAAB-not-ours")
