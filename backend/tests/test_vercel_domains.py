"""A brand's own domain on the Vercel project (services/vercel_domains).

Vercel's API is played by httpx's MockTransport: what is asked, in which
order, and what the shop is told back. Nothing leaves the machine.
"""
import asyncio
import json

import httpx
import pytest

from app.services import brand_domain, vercel_domains


class Vercel:
    """Answers like Vercel's API for one project; remembers each call."""

    def __init__(self, answers=None):
        self.calls = []
        self.answers = answers or {}

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        self.calls.append((request.method, request.url.path, dict(request.url.params), body,
                           request.headers.get("authorization")))
        key = (request.method, request.url.path)
        if key in self.answers:
            status, data = self.answers[key]
            return httpx.Response(status, json=data)
        if request.method == "POST" and request.url.path.endswith("/domains"):
            return httpx.Response(200, json={"name": body["name"], "apexName": "example.com",
                                             "projectId": "p", "verified": True})
        return httpx.Response(200, json={})


@pytest.fixture
def vercel(monkeypatch):
    fake = Vercel()
    settings = vercel_domains.get_settings()
    monkeypatch.setattr(settings, "VERCEL_TOKEN", "tok_test")
    monkeypatch.setattr(settings, "VERCEL_PROJECT", "b2b-saas")
    monkeypatch.setattr(settings, "VERCEL_TEAM", "aheadtech360developments-projects")
    monkeypatch.setattr(vercel_domains, "_client",
                        lambda: httpx.AsyncClient(base_url=vercel_domains.API, transport=httpx.MockTransport(fake)))
    return fake


def run(coro):
    return asyncio.run(coro)


def test_nothing_is_sent_without_a_token(monkeypatch):
    settings = vercel_domains.get_settings()
    monkeypatch.setattr(settings, "VERCEL_TOKEN", "")
    out = run(vercel_domains.add("shop.example.com"))
    assert out["skipped"] is True and out["ok"] is False
    assert run(brand_domain.vercel_swap(None, "shop.example.com")) == {"skipped": True}


def test_a_subdomain_goes_on_the_project_as_it_is(vercel):
    out = run(vercel_domains.add("Shop.Example.com"))
    assert out["ok"] and out["verified"]
    method, path, params, body, auth = vercel.calls[0]
    assert (method, path, body) == ("POST", "/v10/projects/b2b-saas/domains", {"name": "shop.example.com"})
    assert params == {"slug": "aheadtech360developments-projects"}
    assert auth == "Bearer tok_test"
    assert len(vercel.calls) == 1


def test_a_bare_domain_goes_on_with_its_www_redirecting_to_it(vercel):
    run(vercel_domains.add("example.com"))
    bodies = [c[3] for c in vercel.calls]
    assert bodies == [{"name": "example.com"},
                      {"name": "www.example.com", "redirect": "example.com", "redirectStatusCode": 308}]


def test_a_team_id_is_sent_as_team_id(vercel, monkeypatch):
    monkeypatch.setattr(vercel_domains.get_settings(), "VERCEL_TEAM", "team_abc123")
    run(vercel_domains.add("shop.example.com"))
    assert vercel.calls[0][2] == {"teamId": "team_abc123"}


def test_a_domain_already_on_the_project_is_read_back(vercel):
    vercel.answers[("POST", "/v10/projects/b2b-saas/domains")] = (
        400, {"error": {"code": "domain_already_in_project", "message": "The domain is already assigned to this project"}})
    vercel.answers[("GET", "/v9/projects/b2b-saas/domains/shop.example.com")] = (
        200, {"name": "shop.example.com", "apexName": "example.com", "verified": True})
    out = run(vercel_domains.add("shop.example.com"))
    assert out["ok"] and out["verified"]
    assert [c[:2] for c in vercel.calls] == [("POST", "/v10/projects/b2b-saas/domains"),
                                             ("GET", "/v9/projects/b2b-saas/domains/shop.example.com")]


def test_a_domain_on_another_vercel_project_is_refused_and_said_so(vercel):
    vercel.answers[("POST", "/v10/projects/b2b-saas/domains")] = (
        409, {"error": {"code": "domain_already_in_use", "message": "in use"}})
    out = run(vercel_domains.add("shop.example.com"))
    assert not out["ok"] and "another Vercel project" in out["error"]


def test_a_txt_challenge_becomes_a_row_of_the_shops_dns_table(vercel):
    vercel.answers[("POST", "/v10/projects/b2b-saas/domains")] = (200, {
        "name": "shop.example.com", "apexName": "example.com", "verified": False,
        "verification": [{"type": "TXT", "domain": "_vercel.example.com", "value": "vc-domain-verify=shop,abc",
                          "reason": "pending_domain_verification"}]})
    out = run(vercel_domains.add("shop.example.com"))
    assert not out["verified"]
    shown = brand_domain.with_vercel({"records": [{"type": "CNAME", "host": "shop", "value": "x"}], "message": ""}, out)
    assert shown["records"][-1] == {"type": "TXT", "host": "_vercel", "value": "vc-domain-verify=shop,abc",
                                    "note": shown["records"][-1]["note"]}
    assert "TXT" in shown["message"]


def test_check_asks_vercel_to_verify_a_waiting_domain(vercel):
    path = "/v9/projects/b2b-saas/domains/shop.example.com"
    vercel.answers[("GET", path)] = (200, {"name": "shop.example.com", "apexName": "example.com", "verified": False,
                                           "verification": [{"type": "TXT", "domain": "_vercel.example.com",
                                                             "value": "v", "reason": "r"}]})
    vercel.answers[("POST", path + "/verify")] = (200, {"name": "shop.example.com", "verified": True})
    out = run(vercel_domains.check("shop.example.com"))
    assert out["verified"] and out["verification"] == []
    assert [c[:2] for c in vercel.calls] == [("GET", path), ("POST", path + "/verify")]


def test_check_adds_a_domain_the_project_does_not_have(vercel):
    vercel.answers[("GET", "/v9/projects/b2b-saas/domains/shop.example.com")] = (404, {"error": {"code": "not_found"}})
    out = run(vercel_domains.check("shop.example.com"))
    assert out["ok"] and vercel.calls[-1][:2] == ("POST", "/v10/projects/b2b-saas/domains")


def test_changing_the_domain_takes_the_old_one_off_first(vercel):
    run(brand_domain.vercel_swap("example.com", "shop.newbrand.com"))
    assert [c[:2] for c in vercel.calls] == [
        ("DELETE", "/v9/projects/b2b-saas/domains/www.example.com"),
        ("DELETE", "/v9/projects/b2b-saas/domains/example.com"),
        ("POST", "/v10/projects/b2b-saas/domains"),
    ]


def test_clearing_the_domain_only_takes_it_off(vercel):
    out = run(brand_domain.vercel_swap("shop.example.com", None))
    assert out["ok"] and [c[:2] for c in vercel.calls] == [("DELETE", "/v9/projects/b2b-saas/domains/shop.example.com")]


def test_vercel_not_answering_never_breaks_the_save(vercel, monkeypatch):
    def down(request):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(vercel_domains, "_client",
                        lambda: httpx.AsyncClient(base_url=vercel_domains.API, transport=httpx.MockTransport(down)))
    told = []
    monkeypatch.setattr(brand_domain, "_tell_platform", lambda host, error: told.append((host, error)))
    out = run(brand_domain.vercel_swap(None, "shop.example.com"))
    assert not out["ok"] and "did not answer" in out["error"]
    assert told and told[0][0] == "shop.example.com"
