"""The platform's share of a Gang Sheet Builder order: what it is taken on, and
that every way of paying for one takes it. No database or network."""
import inspect
from decimal import Decimal

from app.services import commission

D = Decimal


def test_a_percentage_of_the_gang_sheet_lines_rounded_like_money():
    assert commission.amount_cents(D("100.00"), 280) == 280       # 2.8% of $100
    assert commission.amount_cents(D("7.35"), 280) == 21          # 20.58 cents, rounded
    assert commission.amount_cents(D("100.00"), 0) == 0
    assert commission.amount_cents(D("0"), 280) == 0


def test_a_discount_code_comes_off_the_gang_sheet_lines_in_their_share_of_the_cart():
    # $100 of gang sheets and $100 of blanks, $20 off the lot: $10 of it is the sheets'.
    assert commission.base_after_discount(D("100"), D("200"), D("20")) == D("90.00")
    # No code, nothing changes; a code worth the whole cart leaves nothing to take from.
    assert commission.base_after_discount(D("100"), D("200"), D("0")) == D("100")
    assert commission.base_after_discount(D("100"), D("100"), D("150")) == D("0.00")
    assert commission.base_after_discount(D("0"), D("200"), D("20")) == D("0")


def test_an_invoice_paid_in_parts_pays_the_fee_once_between_them():
    # A $2.80 fee on a $100 order: $60 now and $40 later.
    first = commission.share_cents(280, D("60"), D("100"))
    second = commission.share_cents(280, D("40"), D("100"))
    assert (first, second) == (168, 112) and first + second == 280
    # Never more than the whole fee, whatever is sent.
    assert commission.share_cents(280, D("150"), D("100")) == 280
    assert commission.share_cents(0, D("60"), D("100")) == 0


def test_every_way_of_paying_for_a_gang_sheet_hands_the_share_to_the_charge():
    """The rate set in the console changed nothing for a signed-in customer:
    only the guest checkout passed the fee on. Each of the three places a card
    is charged has to."""
    from app.api.v1 import checkout, guest, orders

    for module in (checkout, guest, orders):
        src = inspect.getsource(module)
        charge = src.index("create_direct_payment_intent(")
        assert "application_fee_cents=fee_cents" in src[charge:charge + 900], module.__name__
        assert "commission_svc.amount_cents(" in src[:charge], module.__name__
