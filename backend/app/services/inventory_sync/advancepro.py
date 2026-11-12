"""AdvancePro (sold by AdvanceWare): the REST API a brand's stock is read from.

Docs: https://advanceware.net/restapibeta/documentation/ui/index.html
Spec: https://advanceware.net/restapibeta/swagger/v1/swagger.json (OpenAPI 3,
"V2"). What is used here, all read-only:

    POST /api/Authenticate/login           username + password → token, refreshToken
    POST /api/Authenticate/RefreshToken    token + refreshToken → a fresh pair
    GET  /api/warehouses                   the company's warehouses
    GET  /api/variants                     every variant: id, sku, upc, name
    GET  /api/warehouseInventory           per warehouse and variant: available_quantity

Every call carries `Authorization: Bearer <token>`. A login is per company:
the brand asks AdvancePro support for an API user (a test company first), and
two-factor sign-in must be off for that user, or a login only sends a code.

The spec does not say how its lists page: `page` and `limit` are there, with
no word on whether pages count from 0 or 1, or what the largest page is. So a
list is read page by page until a page comes back empty, the page number base
is found by asking for page 0 and page 1 (a server that counts from 1 answers
page 0 with page 1, an error or nothing), and a list that repeats itself (a
server that ignores `page`) stops instead of going round for ever.

A token is kept in Redis for the brand between syncs, so a sync every
quarter-hour does not sign the API user in every quarter-hour.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

DEFAULT_BASE = "https://advanceware.net/restapibeta"
PAGE_LIMIT = 500
MAX_PAGES = 400                  # 200,000 rows at the page size above: a guard, not a limit anyone meets
TOKEN_TTL = 20 * 60              # seconds a token is reused for, well inside AdvancePro's own timeout
TIMEOUT = 45.0


class AdvanceProError(RuntimeError):
    """Something the admin can read: what went wrong, in AdvancePro's words or ours."""


def base_url(raw: str | None) -> str:
    """The API address the brand gave, or AdvancePro's shared one; no trailing slash."""
    url = (raw or "").strip().rstrip("/") or DEFAULT_BASE
    if not url.lower().startswith("https://"):
        raise AdvanceProError("The AdvancePro API address must start with https://")
    return url


def _rows(data: Any) -> list[dict]:
    """A list answer as rows, whether it came bare or wrapped ({"data": [...]})."""
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    if isinstance(data, dict):
        for k in ("data", "items", "results", "value"):
            if isinstance(data.get(k), list):
                return [r for r in data[k] if isinstance(r, dict)]
    return []


def _key(row: dict) -> str:
    rid = row.get("id")
    return f"id:{rid}" if rid is not None else json.dumps(row, sort_keys=True, default=str)


def _failed_message(body: Any) -> str | None:
    """AdvancePro's own reason a login failed, if it gave one."""
    if not isinstance(body, dict):
        return None
    failed = body.get("failedResponse") or {}
    if isinstance(failed, dict) and failed.get("errorMessage"):
        return str(failed["errorMessage"])[:300]
    value = body.get("value") or {}
    if isinstance(value, dict) and value.get("title"):
        return str(value["title"])[:300]
    if body.get("title"):
        return str(body["title"])[:300]
    return None


class AdvanceProClient:
    def __init__(self, username: str, password: str, *, api_url: str | None = None,
                 tenant_id: Any = None, transport: httpx.AsyncBaseTransport | None = None,
                 cache_tokens: bool = True):
        if not (username or "").strip() or not (password or ""):
            raise AdvanceProError("Add the AdvancePro API username and password first.")
        self.base = base_url(api_url)
        self.username = username.strip()
        self.password = password
        self.tenant_id = str(tenant_id) if tenant_id else None
        self._cache_tokens = cache_tokens and self.tenant_id is not None
        self._http = httpx.AsyncClient(base_url=self.base, timeout=TIMEOUT, transport=transport,
                                       headers={"Accept": "application/json"})
        self._token: str | None = None
        self._refresh: str | None = None
        self.user: dict = {}

    async def close(self) -> None:
        await self._http.aclose()

    # ── Signing in ──────────────────────────────────────────────────────────
    def _cache_key(self) -> str:
        return f"advancepro:token:{self.tenant_id}:{self.username.lower()}"

    async def _cached(self) -> bool:
        if not self._cache_tokens:
            return False
        try:
            from app.core.redis import get_redis_pool
            raw = await get_redis_pool().get(self._cache_key())
        except Exception:
            return False
        if not raw:
            return False
        try:
            data = json.loads(raw)
        except ValueError:
            return False
        self._token, self._refresh = data.get("token"), data.get("refresh")
        return bool(self._token)

    async def _remember(self) -> None:
        if not self._cache_tokens or not self._token:
            return
        try:
            from app.core.redis import get_redis_pool
            await get_redis_pool().set(self._cache_key(), json.dumps({"token": self._token, "refresh": self._refresh}),
                                       ex=TOKEN_TTL)
        except Exception:
            pass

    async def _forget(self) -> None:
        self._token = self._refresh = None
        if not self._cache_tokens:
            return
        try:
            from app.core.redis import get_redis_pool
            await get_redis_pool().delete(self._cache_key())
        except Exception:
            pass

    async def login(self) -> dict:
        """Sign the API user in. Raises AdvanceProError with a plain reason when it cannot."""
        try:
            r = await self._http.post("/api/Authenticate/login", json={
                "username": self.username, "password": self.password, "forceLogin": False,
            })
        except httpx.HTTPError as exc:
            raise AdvanceProError(f"Could not reach AdvancePro at {self.base} ({type(exc).__name__}).") from exc
        try:
            body = r.json()
        except ValueError:
            body = None
        # The spec spells it "successResonse"; the right spelling is read too, in case they fix it.
        ok = (body.get("successResonse") or body.get("successResponse")) if isinstance(body, dict) else None
        if r.status_code == 200 and isinstance(ok, dict) and ok.get("token"):
            self._token, self._refresh = ok["token"], ok.get("refreshToken")
            self.user = ok.get("user") or {}
            await self._remember()
            return ok
        if isinstance(body, dict) and body.get("twoFactorEnabled"):
            raise AdvanceProError("Two-factor sign-in is on for this AdvancePro user. Use an API user with it turned off.")
        reason = _failed_message(body)
        if r.status_code in (401, 404) or reason:
            raise AdvanceProError(f"AdvancePro did not accept this username and password{f': {reason}' if reason else '.'}")
        raise AdvanceProError(f"AdvancePro answered the sign-in with {r.status_code}.")

    async def _renew(self) -> None:
        """A fresh token: by the refresh token when there is one, else by signing in again."""
        if self._token and self._refresh:
            try:
                r = await self._http.post("/api/Authenticate/RefreshToken",
                                          json={"token": self._token, "refreshToken": self._refresh})
                body = r.json() if r.status_code == 200 else None
                if isinstance(body, dict) and body.get("token"):
                    self._token, self._refresh = body["token"], body.get("refreshToken") or self._refresh
                    await self._remember()
                    return
            except (httpx.HTTPError, ValueError):
                pass
        await self._forget()
        await self.login()

    # ── Reading ─────────────────────────────────────────────────────────────
    async def _get(self, path: str, params: dict | None = None, *, quiet_400: bool = False) -> Any:
        if not self._token and not await self._cached():
            await self.login()
        for attempt in (1, 2):
            try:
                r = await self._http.get(path, params={k: v for k, v in (params or {}).items() if v is not None},
                                         headers={"Authorization": f"Bearer {self._token}"})
            except httpx.HTTPError as exc:
                raise AdvanceProError(f"Could not reach AdvancePro ({type(exc).__name__}).") from exc
            if r.status_code == 401 and attempt == 1:
                await self._renew()
                continue
            if r.status_code == 400 and quiet_400:
                return None
            if r.status_code == 401:
                raise AdvanceProError("AdvancePro signed this user out and would not let it back in. Check the login.")
            if r.status_code == 403:
                raise AdvanceProError("This AdvancePro user is not allowed to read inventory. Ask AdvancePro to give it API access.")
            if r.status_code == 429:
                raise AdvanceProError("AdvancePro asked us to slow down. The next sync will try again.")
            if r.status_code >= 400:
                raise AdvanceProError(f"AdvancePro answered {path} with {r.status_code}.")
            try:
                return r.json()
            except ValueError as exc:
                raise AdvanceProError(f"AdvancePro sent something that is not JSON for {path}.") from exc
        return None

    async def _page(self, path: str, params: dict, page: int) -> list[dict] | None:
        """One page; None when AdvancePro answers 400 (a page before the first, or past the last)."""
        data = await self._get(path, {**params, "page": page, "limit": PAGE_LIMIT}, quiet_400=True)
        return None if data is None else _rows(data)

    async def all_rows(self, path: str, params: dict | None = None) -> list[dict]:
        """Every row of a list, page by page (see the module's note on paging)."""
        params = params or {}
        first0 = await self._page(path, params, 0)
        first1 = await self._page(path, params, 1)
        if first0 is None and first1 is None:
            # Neither page was accepted: ask once more without hiding the answer, so its reason shows.
            await self._get(path, {**params, "page": 1, "limit": PAGE_LIMIT})
            return []
        if not first0:
            base, start = 1, first1 or []          # nothing at page 0: pages count from 1
        elif not first1:
            base, start = 0, first0                # all of it fitted on page 0
        elif _key(first0[0]) == _key(first1[0]):
            base, start = 1, first1                # page 0 answered as page 1: counting from 1
        else:
            base, start = 0, first0
        seen: set[str] = set()
        out: list[dict] = []
        page_rows = start
        page = base
        while page_rows and page - base < MAX_PAGES:
            fresh = [r for r in page_rows if _key(r) not in seen]
            if not fresh:
                break                              # the same rows again: the server ignores `page`
            for r in fresh:
                seen.add(_key(r))
            out.extend(fresh)
            page += 1
            if base == 0 and page == 1 and first1 is not None:
                page_rows = first1                 # already read
            else:
                page_rows = await self._page(path, params, page) or []
        return out

    async def warehouses(self) -> list[dict]:
        return await self.all_rows("/api/warehouses")

    async def variants(self) -> list[dict]:
        return await self.all_rows("/api/variants")

    async def warehouse_inventory(self, warehouse_id: int | None = None) -> list[dict]:
        return await self.all_rows("/api/warehouseInventory", {"warehouse_id": warehouse_id} if warehouse_id else None)

    async def check(self) -> dict:
        """A sign-in and one cheap read, for "Test" and "Connect"."""
        await self._forget()
        await self.login()
        houses = await self.warehouses()
        return {"warehouses": len(houses), "user": self.user}


def from_connection(conn: dict, *, tenant_id: Any = None, transport: httpx.AsyncBaseTransport | None = None,
                    cache_tokens: bool = True) -> AdvanceProClient:
    return AdvanceProClient(conn.get("username") or "", conn.get("password") or "", api_url=conn.get("api_url"),
                            tenant_id=tenant_id, transport=transport, cache_tokens=cache_tokens)
