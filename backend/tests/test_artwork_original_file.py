"""The server fetches an uploaded file as it was uploaded (services/artwork/inspect.original).

Innterflow's order 1011 (2026-11-06): a buyer's 27.5 megapixel sheet came back
from ImageKit as 400 Bad Request, because ImageKit sends every image through
its optimiser and refuses one past 25 megapixels. The print check and the
print file fetch artwork from ImageKit too, so they ask for the uploaded file
itself (`tr=orig-true`). Nothing else is touched. No network.
"""
import asyncio

from app.services import gang_sheet_render as render
from app.services.artwork import inspect

END = "https://ik.imagekit.io/9vhlgquzw"
SHEET = f"{END}/tenants/innterflow/Dise%C3%B1o_sin_t%C3%ADtulo_Q_x8PIEJw.png"


def test_an_uploaded_file_is_asked_for_as_it_was_uploaded(monkeypatch):
    monkeypatch.setattr(inspect.settings, "IMAGEKIT_URL_ENDPOINT", END)
    assert inspect.original(SHEET) == f"{SHEET}?tr=orig-true"
    assert inspect.original(f"{SHEET}?updatedAt=1") == f"{SHEET}?updatedAt=1&tr=orig-true"
    for left in (f"{SHEET}?tr=w-300", f"{END}/tr:w-300/a.png", f"{SHEET}?ik-s=x&ik-t=1",
                 "https://elsewhere.example/a.png", "/media/a.png"):
        assert inspect.original(left) == left
    monkeypatch.setattr(inspect.settings, "IMAGEKIT_URL_ENDPOINT", "")
    assert inspect.original(SHEET) == SHEET


class _Stream:
    def __init__(self, seen, url):
        seen.append(url)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    def raise_for_status(self):
        return None

    async def aiter_bytes(self):
        yield b"x"


class _Client:
    seen: list = []

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    def stream(self, method, url):
        return _Stream(self.seen, url)


def test_the_print_check_and_the_print_file_both_fetch_the_original(monkeypatch):
    monkeypatch.setattr(inspect.settings, "IMAGEKIT_URL_ENDPOINT", END)
    monkeypatch.setattr(inspect.httpx, "AsyncClient", _Client)
    import httpx

    monkeypatch.setattr(httpx, "AsyncClient", _Client)
    monkeypatch.setattr(render, "_header", lambda _f: (10, 10))
    _Client.seen = []
    asyncio.run(inspect.fetch_bytes(SHEET))
    source = asyncio.run(render.fetch(SHEET))
    source.file.close()
    assert _Client.seen == [f"{SHEET}?tr=orig-true", f"{SHEET}?tr=orig-true"]
