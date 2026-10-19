"""A gang sheet job says whose it is: the order's number and the customer.

A job is made before checkout, from the builder or an upload, so a guest's job
had no name on it — they type it at checkout, onto the order — and the shop's
queue said "Guest", with no order number anywhere. The queue now reads both
from the order the job was checked out on, and the files production downloads
are named for them: the print-ready sheet, a buyer's own file, and the brand's
own "Print file-name format" when it has set one.
"""
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

from app.api.v1.gang_sheets import _download_header, _order_row, _owned_name, _print_name


def job(**over):
    base = dict(
        id="j1", reference="GS-2610-0008", status="in_review", version=1, sheet_name="22x24",
        sheet_width_in=Decimal("22"), sheet_height_in=Decimal("24.5"), price_per_sheet=Decimal("10"),
        sheet_quantity=2, subtotal=Decimal("20"), customer_notes=None, supplier_notes=None,
        revision_count=0, contact_email=None, contact_name=None, product_id=None, sheet_size_id="s1",
        created_at=datetime(2026, 10, 12, tzinfo=UTC), updated_at=None, layout=[], order_id="o1",
        paid_at=None, internal_notes=None, versions=[],
    )
    base.update(over)
    return SimpleNamespace(**base)


BUYER = {"number": "1042", "name": "Zain Ahmed", "email": "zain@example.com"}


def test_a_guests_job_takes_the_name_and_number_from_its_order():
    row = _order_row(job(), admin=True, linked=BUYER)
    assert (row["order_number"], row["contact_name"], row["contact_email"]) == ("1042", "Zain Ahmed", "zain@example.com")


def test_the_name_the_job_was_sent_with_comes_first():
    row = _order_row(job(contact_name="Bilal Printing", contact_email="b@example.com"), admin=True, linked=BUYER)
    assert (row["contact_name"], row["contact_email"]) == ("Bilal Printing", "b@example.com")


def test_not_checked_out_yet_is_still_a_guest_with_no_order():
    row = _order_row(job(order_id=None), admin=True)
    assert (row["order_number"], row["contact_name"]) == (None, "Guest")


def test_the_print_file_is_named_for_the_order_the_customer_and_the_job():
    assert _print_name(job(), "1042", "Zain Ahmed") == "1042-Zain-Ahmed-GS-2610-0008-22x24.5in-300dpi.png"
    # Before checkout there is no order or name to give it: the job and its size.
    assert _print_name(job()) == "GS-2610-0008-22x24.5in-300dpi.png"


def test_a_brands_own_format_is_followed():
    assert _print_name(job(), "1042", "Zain Ahmed", "{order}-{customer}-{design}") == "1042-Zain-Ahmed-GS-2610-0008.png"
    assert _print_name(job(), "1042", "Zain Ahmed", "{customer}_{size}_x{qty}") == "Zain-Ahmed_22x24.5in_x2.png"
    # A token it does not know is left out, and so is the gap it leaves.
    assert _print_name(job(), "1042", None, "{order}-{nope}-{customer}") == "1042.png"


def test_a_name_no_folder_refuses():
    assert _print_name(job(), "#1042", 'A/B: "C" <D>', None) == "1042-AB-C-D-GS-2610-0008-22x24.5in-300dpi.png"


def test_a_buyers_own_file_keeps_its_name_behind_whose_it_is():
    assert _owned_name("my sheet.png", "1042", "Zain Ahmed") == "1042-Zain-Ahmed-my sheet.png"
    assert _owned_name("my sheet.png") == "my sheet.png"


def test_a_name_that_is_not_plain_letters_still_downloads_by_that_name():
    header = _download_header("1042-José-GS-1.png")
    assert header.startswith('attachment; filename="1042-Jose-GS-1.png"; ')
    assert header.endswith("filename*=UTF-8''1042-Jos%C3%A9-GS-1.png")
    assert 'filename="sheet.png"' in _download_header("زین.png")
