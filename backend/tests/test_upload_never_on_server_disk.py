"""An upload ImageKit will not take is refused, never kept on this server's disk.

Innterflow, 2026-11-06: a buyer's print file that ImageKit did not take was
kept on the backend's own disk instead, looked saved, and was gone after the
next deploy (the disk starts empty each time). Now ImageKit is tried twice and
then the person is asked to upload again (503); only a setup with no ImageKit
at all (a developer's machine) uses the disk. No database or network.
"""
import asyncio
import os

import pytest
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.exceptions import ServiceUnavailableError
from app.main import app
from app.services import imagekit_service


def test_imagekit_is_tried_twice_then_the_person_is_asked_to_upload_again(monkeypatch):
    calls = []

    async def down(*_a, **_k):
        calls.append(1)
        raise RuntimeError("ImageKit timed out")

    monkeypatch.setattr(imagekit_service, "upload_bytes", down)
    with pytest.raises(ServiceUnavailableError) as e:
        asyncio.run(imagekit_service.upload_or_refuse(b"x", "a.png", tenant_id="shop"))
    assert len(calls) == 2 and "upload it again" in e.value.message

    tries = []

    async def once(*_a, **_k):
        tries.append(1)
        if len(tries) == 1:
            raise RuntimeError("blip")
        return {"url": "https://ik.imagekit.io/x/tenants/shop/a.png", "name": "a.png"}

    monkeypatch.setattr(imagekit_service, "upload_bytes", once)
    assert asyncio.run(imagekit_service.upload_or_refuse(b"x", "a.png"))["url"].endswith("/a.png")
    assert len(tries) == 2


def test_a_buyers_artwork_imagekit_will_not_take_is_refused_and_nothing_is_written(monkeypatch):
    async def down(*_a, **_k):
        raise RuntimeError("ImageKit timed out")

    async def folder(*_a, **_k):
        return "innterflow"

    async def no_db():
        yield None

    monkeypatch.setattr(imagekit_service, "is_configured", lambda: True)
    monkeypatch.setattr(imagekit_service, "upload_bytes", down)
    monkeypatch.setattr("app.api.v1.upload.resolve_media_folder_key", folder)
    app.dependency_overrides[get_db] = no_db
    disk = "/app/media/artwork"
    before = set(os.listdir(disk)) if os.path.isdir(disk) else set()
    try:
        r = TestClient(app).post("/api/v1/upload/artwork", headers={"X-Tenant-Slug": "innterflow"},
                                 files={"file": ("Diseño sin título.png", b"\x89PNG\r\n\x1a\n" + b"0" * 64, "image/png")})
    finally:
        app.dependency_overrides.pop(get_db, None)
    after = set(os.listdir(disk)) if os.path.isdir(disk) else set()
    assert r.status_code == 503 and "upload it again" in r.text
    assert after == before, "nothing kept on this server's disk"
