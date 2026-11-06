"""A file on this server's own disk opens from its link (auth_middleware._is_public).

Innterflow, 2026-11-06: a buyer's artwork that ImageKit could not take was
kept on the server's disk (/media/artwork/<random>/<name>), and its link
answered "Authentication required": a browser tab carries no sign-in. Files
under /media are open like an ImageKit address, the API stays behind sign-in,
and the mount lists no folder. No database or network.
"""
import os

from fastapi.testclient import TestClient

from app.main import app
from app.middleware.auth_middleware import AuthMiddleware


def _public(path: str) -> bool:
    return AuthMiddleware._is_public(AuthMiddleware.__new__(AuthMiddleware), path)


def test_media_files_are_open_and_the_api_is_not():
    assert _public("/media/artwork/328c3503-7c0e-4cb8-b1c1-3fd9176c0777/Dise%C3%B1o%20sin%20t%C3%ADtulo.png")
    assert _public("/media/products/p1/storefront_large.webp")
    for closed in ("/api/v1/admin/orders", "/api/v1/cart", "/mediax/a.png", "/api/v1/media/a.png"):
        assert not _public(closed), closed


def test_a_file_opens_without_sign_in_and_a_folder_lists_nothing():
    folder = "/app/media/artwork/0a1b2c3d-test-open-without-sign-in"
    os.makedirs(folder, exist_ok=True)
    try:
        with open(f"{folder}/Diseño sin título.png", "wb") as fh:
            fh.write(b"\x89PNG\r\n\x1a\n")
        client = TestClient(app)
        r = client.get("/media/artwork/0a1b2c3d-test-open-without-sign-in/Dise%C3%B1o%20sin%20t%C3%ADtulo.png")
        assert r.status_code == 200 and r.content.startswith(b"\x89PNG")
        assert client.get("/media/artwork/0a1b2c3d-test-open-without-sign-in/").status_code == 404
        assert client.get("/media/artwork/0a1b2c3d-test-open-without-sign-in/missing.png").status_code == 404
        # Nothing outside the media folder, however the path climbs out of it.
        for escape in ("/media/%2e%2e/%2e%2e/backend/app/main.py", "/media/artwork/%2e%2e/%2e%2e/%2e%2e/Windows/win.ini"):
            assert client.get(escape).status_code in (400, 404), escape
        assert client.get("/media/../app/main.py").status_code == 401   # the client tidies it to /app/main.py: not open
    finally:
        for name in os.listdir(folder):
            os.remove(os.path.join(folder, name))
        os.rmdir(folder)
