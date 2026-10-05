"""Tickets for the image tools Worker.

    python tests/test_image_tools.py

No database and no network: the signing, and the endpoint with everything
around it stood in for. The Worker checks a ticket from the other side
(workers/image-tools/src/index.js, `shopFor`), and the two have to agree on the
format to the character.
"""
import asyncio
import hashlib
import hmac
import os
import sys

# Nothing here connects to a database, but importing the endpoint builds an
# engine from whatever the environment names — so it is pointed at the local
# test database before anything is imported, never at a real one.
os.environ["DATABASE_URL"] = "postgresql+asyncpg://postgres:test@localhost:55432/at360test"
os.environ["DATABASE_URL_SYNC"] = "postgresql://postgres:test@localhost:55432/at360test"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services import image_tools  # noqa: E402

ok = fail = 0


def check(name: str, cond: bool, detail: object = "") -> None:
    global ok, fail
    if cond:
        ok += 1
        print(f"  PASS  {name}")
    else:
        fail += 1
        print(f"  FAIL  {name} {detail}")


print("signing")
t = image_tools.sign("k3y", 1_800_000_000, "innterflow")
exp, shop, sig = t.split(".")
check("a ticket is <expires>.<shop>.<signature>", (exp, shop) == ("1800000000", "innterflow") and len(sig) == 64, t)
check("…signed over the first two parts with HMAC-SHA256",
      sig == hmac.new(b"k3y", b"1800000000.innterflow", hashlib.sha256).hexdigest())
check("a different key signs differently", image_tools.sign("other", 1_800_000_000, "innterflow") != t)
check("a different shop signs differently", image_tools.sign("k3y", 1_800_000_000, "bravo").split(".")[2] != sig)
check("a different expiry signs differently", image_tools.sign("k3y", 1_800_000_001, "innterflow").split(".")[2] != sig)

print("\na ticket for a shop")
s = image_tools.get_settings()
before = (s.IMAGE_TOOLS_URL, s.IMAGE_TOOLS_KEY)
try:
    s.IMAGE_TOOLS_URL, s.IMAGE_TOOLS_KEY = "", ""
    check("nothing is offered until both the address and the key are set", image_tools.is_configured() is False)
    s.IMAGE_TOOLS_URL = "https://tools.example.workers.dev/"
    check("…the address alone is not enough", image_tools.is_configured() is False)
    s.IMAGE_TOOLS_KEY = "k3y"
    check("…both are", image_tools.is_configured() is True)

    got = image_tools.cutout_ticket("innterflow", now=1_000)
    check("says where to send the image, without a doubled slash", got["url"] == "https://tools.example.workers.dev/cutout", got["url"])
    check("lasts five minutes", got["expires_in"] == 300 and got["ticket"].startswith("1300.innterflow."), got)
    check("…and is signed with the platform's key", got["ticket"] == image_tools.sign("k3y", 1_300, "innterflow"))
    check("the key itself is never in what the browser is given", "k3y" not in str(got))
finally:
    s.IMAGE_TOOLS_URL, s.IMAGE_TOOLS_KEY = before

print("\nthe endpoint that hands a ticket out")
from fastapi import HTTPException  # noqa: E402

import app.api.v1.upload as upload  # noqa: E402
import app.core.redis as redis_mod  # noqa: E402

state = {"shop": "innterflow", "count": 0, "limited": False, "redis_down": False, "limits": []}


async def fake_limit(request, scope, limit, window, extra=None):
    state["limits"].append((scope, limit, window))
    if state["limited"]:
        raise HTTPException(status_code=429, detail="Too many attempts.")


async def fake_shop(request, db):
    return state["shop"]


async def fake_increment(key, expire=None):
    if state["redis_down"]:
        raise RuntimeError("redis is away")
    state["count"] += 1
    state["key"] = key
    return state["count"]


upload.enforce_rate_limit = fake_limit
upload.resolve_media_folder_key = fake_shop
redis_mod.redis_increment = fake_increment


def ask():
    try:
        return 200, asyncio.run(upload.cutout_ticket(request=object(), db=object()))
    except HTTPException as exc:
        return exc.status_code, exc.detail


try:
    s.IMAGE_TOOLS_URL, s.IMAGE_TOOLS_KEY = "", ""
    status, body = ask()
    check("says it is not set up, rather than failing, when the platform has no key", status == 503, (status, body))

    s.IMAGE_TOOLS_URL, s.IMAGE_TOOLS_KEY, s.IMAGE_TOOLS_DAILY_CAP = "https://tools.example.workers.dev", "k3y", 3
    status, body = ask()
    check("gives a shop its ticket", status == 200 and body["url"].endswith("/cutout") and ".innterflow." in body["ticket"], (status, body))
    check("…counted against that shop, for that day", state["key"].startswith("cutout:innterflow:") and state["count"] == 1, state)
    check("…after the caller's own limit was applied", state["limits"][-1] == ("cutout", 20, 600), state["limits"])

    ask(); ask()
    status, body = ask()
    check("stops at the shop's limit for the day", status == 429 and state["count"] == 4, (status, body, state["count"]))

    state["count"] = 0
    state["shop"] = None
    status, body = ask()
    check("refuses a caller with no shop behind it", status == 400, (status, body))

    state["shop"] = "innterflow"
    state["redis_down"] = True
    status, body = ask()
    check("still works when the counter cannot be reached", status == 200, (status, body))

    state["redis_down"] = False
    state["limited"] = True
    status, body = ask()
    check("passes on the caller's own limit", status == 429, (status, body))
finally:
    s.IMAGE_TOOLS_URL, s.IMAGE_TOOLS_KEY = before

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
