"""The phone app (mobile/src) against the API's own route table: every path it
calls exists, with the method it uses. Three of the console's record screens
opened routes that did not exist (a return, a wholesale application, a
discount code); this keeps the next one from shipping. No requests are made.
"""
import re
from pathlib import Path

import pytest

from app.main import app

MOBILE = Path(__file__).resolve().parents[2] / "mobile" / "src"

ROUTES = [(r.path, set(getattr(r, "methods", None) or set())) for r in app.routes
          if getattr(r, "path", "").startswith("/api/")]


def methods_for(path: str) -> set[str]:
    found: set[str] = set()
    for route, methods in ROUTES:
        rx = "^" + re.sub(r"\{[^/}]+\}", "[^/]+", route.rstrip("/")) + "/?$"
        if re.match(rx, path.rstrip("/")):
            found |= methods
    return found


def app_paths() -> list[str]:
    out = set()
    for f in MOBILE.rglob("*.ts*"):
        text = f.read_text(encoding="utf-8")
        for m in re.finditer(r'[`"](/api/v1/[^`"]*)[`"]', text):
            path = re.sub(r"\$\{[^}]+\}", "X", m.group(1)).split("?")[0]
            out.add(path)
    return sorted(out)


@pytest.mark.skipif(not MOBILE.exists(), reason="the mobile app is not in this checkout")
def test_every_path_the_app_calls_exists():
    missing = [p for p in app_paths() if not methods_for(p)]
    assert not missing, missing


@pytest.mark.parametrize("method,path", [
    # Records the console opens.
    ("GET", "/api/v1/admin/orders/X"), ("GET", "/api/v1/admin/products/X"), ("GET", "/api/v1/admin/companies/X"),
    ("GET", "/api/v1/admin/wholesale-applications/X"), ("GET", "/api/v1/admin/purchase-orders/X"),
    ("GET", "/api/v1/admin/rma/X"), ("GET", "/api/v1/admin/gang-sheets/orders/X"), ("GET", "/api/v1/admin/discounts/X"),
    # What the console changes.
    ("PATCH", "/api/v1/admin/orders/X/status"), ("POST", "/api/v1/admin/orders/X/mark-paid"),
    ("POST", "/api/v1/admin/orders/X/send-invoice"), ("POST", "/api/v1/admin/orders/X/cancel"),
    ("POST", "/api/v1/admin/wholesale-applications/X/approve"), ("POST", "/api/v1/admin/wholesale-applications/X/reject"),
    ("PATCH", "/api/v1/admin/rma/X"), ("PATCH", "/api/v1/admin/gang-sheets/orders/X/status"),
    ("PATCH", "/api/v1/admin/products/X"), ("PATCH", "/api/v1/admin/collections/X"), ("PATCH", "/api/v1/admin/companies/X"),
    ("PATCH", "/api/v1/admin/discounts/X"), ("PATCH", "/api/v1/admin/orders/X"), ("PATCH", "/api/v1/admin/settings"),
    # The buyer's shop.
    ("GET", "/api/v1/products"), ("GET", "/api/v1/products/categories"), ("GET", "/api/v1/products/X"),
    ("GET", "/api/v1/cart"), ("POST", "/api/v1/cart/add-matrix"), ("PATCH", "/api/v1/cart/items/X"),
    ("DELETE", "/api/v1/cart/items/X"), ("GET", "/api/v1/account/addresses"), ("GET", "/api/v1/shipping/shipping-type"),
    ("POST", "/api/v1/shipping/live-rates"), ("POST", "/api/v1/tax/calculate"), ("POST", "/api/v1/discounts/validate"),
    ("GET", "/api/v1/checkout/payment-options"), ("POST", "/api/v1/checkout/intent"), ("POST", "/api/v1/checkout/confirm"),
    ("GET", "/api/v1/orders"), ("GET", "/api/v1/orders/X"), ("GET", "/api/v1/storefront/branding"),
    # Deleting one's own account (App Store 5.1.1(v)), and a shop's person asking for it.
    ("POST", "/api/v1/account/delete"), ("POST", "/api/v1/account/delete-request"),
])
def test_the_method_the_app_uses_is_there(method, path):
    assert method in methods_for(path), f"{method} {path}: {sorted(methods_for(path))}"


def test_an_order_note_is_taken_under_the_name_the_detail_gives_it():
    from app.schemas.order import OrderUpdateRequest

    assert OrderUpdateRequest(order_notes="Call first").model_dump(exclude_unset=True) == {"order_notes": "Call first"}


def test_a_deleted_account_cannot_be_written_to():
    from app.services.account_deletion import deleted_email
    import uuid

    uid = uuid.uuid4()
    address = deleted_email(uid)
    assert address.endswith("@deleted.invalid") and uid.hex in address
