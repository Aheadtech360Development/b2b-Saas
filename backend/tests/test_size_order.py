"""Sizes on the size chart wherever a shopper sees them (services/size_order).

The shop listed a product's sizes in the order the database returned its
variants, which changes every time one is edited: a brand that entered
XS, S, M, L, XL saw XS, M, L, XL, S. frontend/src/__tests__/size-order.test.ts
holds the browser's copy of the same rule to the same cases.
"""
from datetime import datetime, timedelta
from types import SimpleNamespace

from app.services.size_order import size_rank, sort_sizes, sort_variants


def test_letter_sizes_go_on_the_chart():
    assert sort_sizes(["XL", "M", "XS", "L", "S"]) == ["XS", "S", "M", "L", "XL"]
    assert sort_sizes(["3XL", "XL", "XXS", "2X", "L", "4XL"]) == ["XXS", "L", "XL", "2X", "3XL", "4XL"]


def test_the_same_size_written_another_way():
    assert sort_sizes(["Large", "Small", "X-Large", "Medium", "XX-Large"]) == ["Small", "Medium", "Large", "X-Large", "XX-Large"]
    assert size_rank("2XL") == size_rank("XXL") == size_rank("2x")
    assert size_rank(" xs ") == size_rank("XS")


def test_children_before_adults_and_one_size_last():
    assert sort_sizes(["S", "YL", "YS", "M", "One Size"]) == ["YS", "YL", "S", "M", "One Size"]
    assert sort_sizes(["4T", "2T", "0-3M", "NB", "6-12M", "3-6M"]) == ["NB", "0-3M", "3-6M", "6-12M", "2T", "4T"]
    assert sort_sizes(["M (Youth)", "S (Youth)", "S"]) == ["S (Youth)", "M (Youth)", "S"]


def test_numbered_sizes_by_number_not_by_letter():
    assert sort_sizes(["10", "2", "8", "4"]) == ["2", "4", "8", "10"]
    assert sort_sizes(["10.5", "9", "9.5"]) == ["9", "9.5", "10.5"]
    assert sort_sizes(["32x30", "30x32", "30x30"]) == ["30x30", "30x32", "32x30"]
    assert sort_sizes(["10-12", "8-10", "14-16"]) == ["8-10", "10-12", "14-16"]


def test_tall_and_two_size_fits_sit_by_their_sizes():
    assert sort_sizes(["XLT", "L", "LT", "XL"]) == ["L", "LT", "XL", "XLT"]
    assert sort_sizes(["L/XL", "S/M", "M"]) == ["S/M", "M", "L/XL"]


def test_unknown_sizes_keep_the_order_they_were_given_after_the_chart():
    assert sort_sizes(["15oz", "S", "11oz", "M"]) == ["S", "M", "15oz", "11oz"]
    assert sort_sizes(["8x10 in", "5x7 in"]) == ["8x10 in", "5x7 in"]
    assert sort_sizes(["M", None, "", "M", "S"]) == ["S", "M"]


def test_variants_keep_colours_as_added_and_sizes_on_the_chart():
    t = datetime(2026, 10, 1)
    def v(color, size, sort_order=0, minutes=0):
        return SimpleNamespace(color=color, size=size, sort_order=sort_order, created_at=t + timedelta(minutes=minutes))
    # Black was added first, White second; their rows come back shuffled.
    rows = [v("White", "M", minutes=9), v("Black", "XL", minutes=4), v("Black", "S", minutes=2),
            v("White", "S", minutes=8), v("Black", "M", minutes=3), v("Black", "XS", minutes=1)]
    shown = [(x.color, x.size) for x in sort_variants(rows)]
    assert shown == [("Black", "XS"), ("Black", "S"), ("Black", "M"), ("Black", "XL"), ("White", "S"), ("White", "M")]
    # A brand's own sort order comes before when a colour was made.
    rows = [v("Black", "S", sort_order=2), v("Red", "S", sort_order=1)]
    assert [x.color for x in sort_variants(rows)] == ["Red", "Black"]
