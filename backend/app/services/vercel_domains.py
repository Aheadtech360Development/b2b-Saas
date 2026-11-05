"""A brand's own domain on the Vercel project, through Vercel's REST API.

A shop's address under the platform (<slug>.printcopilot.co) needs nothing:
the project has a wildcard certificate for *.printcopilot.co. A domain the
brand bought itself has to be on the project before Vercel issues its
certificate, so this adds it when the brand saves it and takes it off when
the brand removes or changes it. A bare domain (example.com) goes on with its
www, which redirects to it, because the brand is told to point both here.

Configured by VERCEL_TOKEN (an access token for the team: a secret, set in
Railway, never in the repo), VERCEL_PROJECT (the project's name or id) and
VERCEL_TEAM (the team's slug, or its id starting "team_"). Without them
nothing is sent and the domain is added in Vercel by hand, as before.

Endpoints (Vercel REST API, checked 2026-11-05):
  POST   /v10/projects/{project}/domains                 add (400 if already on it)
  GET    /v9/projects/{project}/domains/{domain}         read, with its verification
  POST   /v9/projects/{project}/domains/{domain}/verify  check a TXT challenge
  DELETE /v9/projects/{project}/domains/{domain}         take it off
"""
from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

API = "https://api.vercel.com"
TIMEOUT = 15.0


def configured() -> bool:
    s = get_settings()
    return bool((s.VERCEL_TOKEN or "").strip() and (s.VERCEL_PROJECT or "").strip())


def _client() -> httpx.AsyncClient:
    """One client per call (tests replace this)."""
    return httpx.AsyncClient(base_url=API, timeout=TIMEOUT)


def _params() -> dict[str, str]:
    team = (get_settings().VERCEL_TEAM or "").strip()
    if not team:
        return {}
    return {"teamId": team} if team.startswith("team_") else {"slug": team}


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {get_settings().VERCEL_TOKEN.strip()}"}


def _project() -> str:
    return quote(get_settings().VERCEL_PROJECT.strip(), safe="")


def names_for(host: str) -> list[tuple[str, str | None]]:
    """(domain, redirect target) to put on the project: a bare domain with
    its www redirecting to it, anything else on its own."""
    host = host.strip().lower().rstrip(".")
    if host.count(".") <= 1:
        return [(host, None), (f"www.{host}", host)]
    return [(host, None)]


def _error(response: httpx.Response) -> str:
    try:
        err = (response.json() or {}).get("error") or {}
    except ValueError:
        err = {}
    return str(err.get("message") or err.get("code") or f"HTTP {response.status_code}")


def _status(data: dict) -> dict[str, Any]:
    return {"verified": bool(data.get("verified")), "verification": list(data.get("verification") or []),
            "apex": data.get("apexName")}


async def add(host: str) -> dict[str, Any]:
    """Put the domain (and its www) on the project.

    Returns {ok, verified, verification, apex, error}. A domain already on the
    project counts as added; one held by another Vercel project is not, and
    says so.
    """
    if not configured():
        return {"ok": False, "skipped": True, "verified": False, "verification": [], "error": None}
    out: dict[str, Any] = {"ok": True, "verified": True, "verification": [], "apex": None, "error": None}
    async with _client() as client:
        for name, redirect in names_for(host):
            body: dict[str, Any] = {"name": name}
            if redirect:
                body.update(redirect=redirect, redirectStatusCode=308)
            try:
                r = await client.post(f"/v10/projects/{_project()}/domains", params=_params(),
                                      headers=_headers(), json=body)
            except httpx.HTTPError as exc:
                logger.warning("Vercel add %s failed: %s", name, exc)
                return {**out, "ok": False, "verified": False, "error": "Vercel did not answer. Try again in a minute."}
            if r.status_code == 400 and "already" in _error(r).lower():
                r = await client.get(f"/v9/projects/{_project()}/domains/{quote(name, safe='')}",
                                     params=_params(), headers=_headers())
            if r.status_code == 409:
                logger.warning("Vercel add %s refused: %s", name, _error(r))
                return {**out, "ok": False, "verified": False,
                        "error": f"{name} is already on another Vercel project. Remove it there first."}
            if r.status_code >= 400:
                logger.warning("Vercel add %s answered %s: %s", name, r.status_code, _error(r))
                return {**out, "ok": False, "verified": False, "error": f"Vercel refused {name}: {_error(r)}"}
            st = _status(r.json() or {})
            out["apex"] = out["apex"] or st["apex"]
            out["verified"] = out["verified"] and st["verified"]
            out["verification"] += st["verification"]
    return out


async def check(host: str) -> dict[str, Any]:
    """Where the domain stands on the project; asks Vercel to verify it when
    it is waiting on a TXT challenge. Adds it if it is not on the project."""
    if not configured():
        return {"ok": False, "skipped": True, "verified": False, "verification": [], "error": None}
    out: dict[str, Any] = {"ok": True, "verified": True, "verification": [], "apex": None, "error": None}
    async with _client() as client:
        for name, _ in names_for(host):
            path = f"/v9/projects/{_project()}/domains/{quote(name, safe='')}"
            try:
                r = await client.get(path, params=_params(), headers=_headers())
            except httpx.HTTPError as exc:
                logger.warning("Vercel read %s failed: %s", name, exc)
                return {**out, "ok": False, "verified": False, "error": "Vercel did not answer. Try again in a minute."}
            if r.status_code == 404:
                return await add(host)
            if r.status_code >= 400:
                return {**out, "ok": False, "verified": False, "error": f"Vercel: {_error(r)}"}
            st = _status(r.json() or {})
            if not st["verified"]:
                v = await client.post(f"{path}/verify", params=_params(), headers=_headers())
                if v.status_code < 400 and (v.json() or {}).get("verified"):
                    st["verified"], st["verification"] = True, []
            out["apex"] = out["apex"] or st["apex"]
            out["verified"] = out["verified"] and st["verified"]
            out["verification"] += st["verification"]
    return out


async def remove(host: str) -> bool:
    """Take the domain (and its www) off the project. True when it is gone."""
    if not configured() or not host:
        return False
    gone = True
    async with _client() as client:
        # www first: it redirects to the bare domain.
        for name, _ in reversed(names_for(host)):
            try:
                r = await client.delete(f"/v9/projects/{_project()}/domains/{quote(name, safe='')}",
                                        params=_params(), headers=_headers())
            except httpx.HTTPError as exc:
                logger.warning("Vercel remove %s failed: %s", name, exc)
                gone = False
                continue
            if r.status_code >= 400 and r.status_code != 404:
                logger.warning("Vercel remove %s answered %s: %s", name, r.status_code, _error(r))
                gone = False
    return gone


def records_from(verification: list[dict], apex: str | None) -> list[dict[str, str]]:
    """Vercel's TXT challenges as rows of the brand's DNS table."""
    out = []
    for v in verification:
        if str(v.get("type") or "").upper() != "TXT":
            continue
        name = str(v.get("domain") or "").rstrip(".")
        host = name[: -len(apex) - 1] if apex and name.endswith("." + apex) else name
        out.append({"type": "TXT", "host": host or "@", "value": str(v.get("value") or ""),
                    "note": "Proves to our host that this domain is yours. Add it, then press Check."})
    return out
