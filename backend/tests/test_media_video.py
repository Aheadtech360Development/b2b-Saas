"""Videos in the media library (admin/media.py, services/imagekit_service).

What each test holds, in the owner's terms:
* A video goes from the browser straight to ImageKit, with a one-time
  permission signed here: it names the brand's own folder, the size limit and
  "a video", and ImageKit refuses the upload if any of them is changed.
* A video too big for the plan, or a file that is not a video, gets no
  permission, and says why.
* A video never goes through the server's own upload (it would be held whole
  in memory).
No database or network.
"""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from jose import jwt

from app.api.v1.admin import media
from app.core.config import settings
from app.services import imagekit_service

PRIVATE, PUBLIC = "private_test_key", "public_test_key"


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def _keys(monkeypatch):
    monkeypatch.setattr(settings, "IMAGEKIT_PRIVATE_KEY", PRIVATE)
    monkeypatch.setattr(settings, "IMAGEKIT_PUBLIC_KEY", PUBLIC)
    monkeypatch.setattr(settings, "IMAGEKIT_URL_ENDPOINT", "https://ik.imagekit.io/test")
    monkeypatch.setattr(settings, "MEDIA_VIDEO_MAX_MB", 100)

    async def folder(request, db):
        return "demo"

    monkeypatch.setattr(media, "resolve_media_folder_key", folder)


def test_the_permission_pins_the_brands_folder_the_size_and_a_video():
    out = imagekit_service.video_upload_token("demo", "Summer drop.mp4", 100 * 1024 * 1024, now=1_800_000_000)
    assert out["upload_url"] == "https://upload.imagekit.io/api/v2/files/upload"
    claims = jwt.decode(out["token"], PRIVATE, algorithms=["HS256"], options={"verify_exp": False})
    assert jwt.get_unverified_header(out["token"]) == {"alg": "HS256", "typ": "JWT", "kid": PUBLIC}
    fields = out["fields"]
    assert fields == {"fileName": "Summer-drop.mp4", "folder": "/tenants/demo", "useUniqueFileName": "true",
                      "checks": '"file.size" <= 104857600 AND "file.mime" : "video"'}
    # The browser must send exactly what was signed; ImageKit compares them.
    assert {k: claims[k] for k in fields} == fields
    assert claims["exp"] - claims["iat"] == 3600 and claims["iat"] == 1_800_000_000


@pytest.mark.parametrize("given, kept", [
    ("Summer drop.mp4", "Summer-drop.mp4"),
    ("C:\\Users\\me\\clip.MOV", "clip.MOV"),
    ("../../reel.webm", "reel.webm"),
    ("no extension", "video.mp4"),
    (".mp4", "video.mp4"),
])
def test_a_file_name_is_one_imagekit_keeps_as_it_is(given, kept):
    assert imagekit_service.safe_file_name(given) == kept


def test_the_route_gives_the_permission_for_this_brand_only():
    out = run(media.video_upload(media.VideoUploadIn(file_name="reel.mp4", size=5_000_000, mime="video/mp4"),
                                 SimpleNamespace(state=SimpleNamespace()), None))
    assert out["fields"]["folder"] == "/tenants/demo"


def test_too_big_or_not_a_video_gets_no_permission_and_says_why():
    with pytest.raises(HTTPException) as e:
        run(media.video_upload(media.VideoUploadIn(file_name="long.mp4", size=150 * 1024 * 1024, mime="video/mp4"),
                               SimpleNamespace(state=SimpleNamespace()), None))
    assert e.value.status_code == 413 and "up to 100 MB" in e.value.detail and "150 MB" in e.value.detail
    with pytest.raises(HTTPException) as e:
        run(media.video_upload(media.VideoUploadIn(file_name="a.png", size=10, mime="image/png"),
                               SimpleNamespace(state=SimpleNamespace()), None))
    assert e.value.status_code == 400


def test_no_public_key_no_video_uploads(monkeypatch):
    monkeypatch.setattr(settings, "IMAGEKIT_PUBLIC_KEY", "")
    with pytest.raises(HTTPException) as e:
        run(media.video_upload(media.VideoUploadIn(file_name="a.mp4", size=10, mime="video/mp4"),
                               SimpleNamespace(state=SimpleNamespace()), None))
    assert e.value.status_code == 400


def test_a_video_never_goes_through_the_servers_own_upload(monkeypatch):
    async def never(*a, **k):
        raise AssertionError("must not upload")

    monkeypatch.setattr(imagekit_service, "upload_bytes", never)
    upload = SimpleNamespace(content_type="video/mp4", filename="a.mp4", read=never)
    with pytest.raises(HTTPException) as e:
        run(media.upload_media(SimpleNamespace(state=SimpleNamespace()), upload, None))
    assert e.value.status_code == 400


def test_the_library_says_whether_it_takes_videos_and_how_big(monkeypatch):
    async def files(folder):
        return [{"file_id": "f1", "url": "https://ik.imagekit.io/test/tenants/demo/reel.mp4", "mime": "video/mp4"}]

    monkeypatch.setattr(imagekit_service, "list_files", files)
    out = run(media.list_media(SimpleNamespace(state=SimpleNamespace()), None))
    assert out["videos"] is True and out["video_max_mb"] == 100 and out["items"][0]["mime"] == "video/mp4"
