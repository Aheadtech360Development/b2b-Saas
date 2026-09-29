"""Telling a phone apart from a browser, where it changes how tokens travel.

A browser keeps its refresh token in an httpOnly cookie, which is the safest
place for it: script on the page cannot read it, so an XSS bug cannot steal a
session. The cookie is set and read by the server and the page never sees it.

A native app has no such cookie jar — React Native's fetch does not persist
cookies dependably across platforms and app restarts — and it has somewhere
better to put one: the iOS Keychain or the Android Keystore, which the OS
guards and no web page can reach.

So the refresh token is handed over in the response body, but only when the
client says it is native. The default stays the cookie, because a browser that
could read its own refresh token would have given up the protection it has for
nothing.

This is a hint from the client, not a credential, and it is treated as one: it
only decides where a token the caller has already earned is written. A browser
sending this header would receive its own refresh token in the body, which is
no worse than it choosing to store one there itself.
"""
from __future__ import annotations

from fastapi import Request

HEADER = "X-Client-Type"
_NATIVE = {"native", "ios", "android", "mobile", "expo"}


def is_native(request: Request) -> bool:
    """Whether this caller wants its tokens in the body rather than a cookie."""
    return (request.headers.get(HEADER) or "").strip().lower() in _NATIVE
