"""The price table under the shop's rules (combinations.buyable).

The owner's case: a choice that hides another question, or shows only some of
its choices, made combinations the table never listed, so their price could
not be typed anywhere. The table, its file and the price at checkout now
follow what a buyer can actually choose: a question a rule hides is left out
of that combination (a shorter row), a choice a rule rules out is not listed.
"""
from __future__ import annotations

import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services import combinations as combos
from app.services import price_grid
from app.services.configurator_service import ConfigurationError, compute_price


def _value(label, position, *, delta="0"):
    return SimpleNamespace(id=uuid.uuid4(), label=label, enabled=True, price_delta=Decimal(delta),
                           price_mode="flat", sku_suffix=None, position=position, is_default=position == 0)


def _option(name, labels, position):
    return SimpleNamespace(id=uuid.uuid4(), name=name, input_type="select", is_active=True, required=True,
                           position=position, help_text=None, in_price_matrix=True,
                           values=[_value(x, i) for i, x in enumerate(labels)])


def _rule(action, when, *, option=None, value=None):
    return SimpleNamespace(id=uuid.uuid4(), when_value_id=when.id, action=action,
                           target_option_id=option.id if option else None,
                           target_value_id=value.id if value else None, note=None)


def _v(option, label):
    return next(v for v in option.values if v.label == label)


@pytest.fixture
def card():
    paper = _option("Paper", ["14 pt", "16 pt"], 0)
    coating = _option("Coating", ["Gloss", "Matte", "No Coating"], 1)
    size = _option("Size", ["Standard", "Square"], 2)
    return paper, coating, size


def _rows(pairs_list):
    return sorted(tuple(f"{o.name}={v.label}" for o, v in pairs) for pairs in pairs_list)


def test_without_rules_every_combination_is_listed(card):
    assert combos.buyable(list(card), []) is None
    paper, coating, size = card
    other = _rule("hide_option", _v(paper, "14 pt"), option=_option("Not in table", [], 9))
    assert combos.buyable(list(card), [other]) is None   # aims outside the table


def test_a_hidden_question_leaves_a_shorter_combination_to_price(card):
    paper, coating, size = card
    rules = [_rule("hide_option", _v(paper, "14 pt"), option=coating)]
    got = _rows(combos.buyable(list(card), rules))
    assert ("Paper=14 pt", "Size=Standard") in got and ("Paper=14 pt", "Size=Square") in got
    assert not any(r[0] == "Paper=14 pt" and len(r) == 3 for r in got)
    assert len(got) == 2 + 6     # 14 pt x size, 16 pt x coating x size


def test_show_only_lists_only_the_kept_choices(card):
    paper, coating, size = card
    rules = [_rule("only_values", _v(paper, "14 pt"), option=coating, value=_v(coating, "No Coating"))]
    got = _rows(combos.buyable(list(card), rules))
    with14 = [r for r in got if r[0] == "Paper=14 pt"]
    assert with14 == [("Paper=14 pt", "Coating=No Coating", "Size=Square"),
                      ("Paper=14 pt", "Coating=No Coating", "Size=Standard")]
    assert len(got) == 2 + 6


def test_a_greyed_out_choice_is_not_listed_with_its_trigger(card):
    paper, coating, size = card
    rules = [_rule("disable_value", _v(paper, "14 pt"), value=_v(coating, "Matte"))]
    got = _rows(combos.buyable(list(card), rules))
    assert not any("Paper=14 pt" in r and "Coating=Matte" in r for r in got)
    assert len(got) == 12 - 2


def test_an_answer_to_a_hidden_question_sets_nothing_off(card):
    paper, coating, size = card
    rules = [_rule("hide_option", _v(paper, "14 pt"), option=coating),
             _rule("hide_option", _v(coating, "Gloss"), option=size)]
    got = _rows(combos.buyable(list(card), rules))
    # 14 pt hides Coating, so Gloss is never answered and Size stays asked.
    assert ("Paper=14 pt", "Size=Standard") in got
    assert ("Paper=16 pt", "Coating=Gloss") in got          # Gloss asked here: Size hidden
    assert not any(r[0] == "Paper=16 pt" and "Coating=Gloss" in r and len(r) == 3 for r in got)


def test_the_file_writes_dash_for_a_hidden_question_and_reads_it_back(card):
    paper, coating, size = card
    rules = [_rule("hide_option", _v(paper, "14 pt"), option=coating)]
    text = price_grid.export_csv(list(card), [], rules)
    lines = text.strip().split("\n")
    assert lines[0] == "Paper,Coating,Size,Price,SKU,Note"
    assert "14 pt,-,Standard,,," in lines
    assert len(lines) == 1 + 8

    filled = "\n".join([lines[0], "14 pt,-,Standard,12.50,,", "16 pt,Gloss,Standard,15,,"])
    existing = [{"id": str(o.id), "name": o.name, "input_type": "select", "is_active": True,
                 "values": [{"id": str(v.id), "label": v.label, "enabled": True} for v in o.values]} for o in card]
    plan = price_grid.plan(price_grid.read_csv(filled), existing)
    assert plan["error_count"] == 0
    assert all(q["new_labels"] == [] for q in plan["_questions"])      # "-" is never a choice
    keys = price_grid.listed_keys(plan, existing)
    short = combos.combo_key([(paper.id, _v(paper, "14 pt").id), (size.id, _v(size, "Standard").id)])
    assert short in keys


def test_a_row_of_dashes_or_a_dashed_quantity_is_refused(card):
    existing = [{"id": str(o.id), "name": o.name, "input_type": "select", "is_active": True,
                 "values": [{"id": str(v.id), "label": v.label, "enabled": True} for v in o.values]} for o in card]
    plan = price_grid.plan(price_grid.read_csv("Paper,Coating,Size,Price\n-,-,-,10\n14 pt,-,Standard,12\n"), existing)
    assert [e["message"] for e in plan["errors"]] == ['Every question is "-": the row names no choice.']
    qty = price_grid.plan(price_grid.read_csv("Paper,Qty,Price\n14 pt,100,10\n14 pt,-,12\n"), existing,
                          quantity_column="Qty")
    assert qty["errors"][0]["message"].startswith('"Qty" cannot be "-"')


def _stored(pairs, price, *, enabled=True):
    return SimpleNamespace(combo_key=combos.combo_key((o.id, v.id) for o, v in pairs), unit_price=Decimal(price),
                           line_price=None, setup_fee=None, sku=None, enabled=enabled, note=None)


def test_checkout_prices_the_shorter_row_and_ignores_a_stale_hidden_answer(card):
    paper, coating, size = card
    p14, gloss, std = _v(paper, "14 pt"), _v(coating, "Gloss"), _v(size, "Standard")
    product = SimpleNamespace(id=uuid.uuid4(), options=list(card), base_price=Decimal("20"),
                              option_rules=[_rule("hide_option", p14, option=coating)])
    rows = [_stored([(paper, p14), (size, std)], "12.50"),
            # an old row from before the rule, switched off: it must not block
            _stored([(paper, p14), (coating, gloss), (size, std)], "0", enabled=False)]
    clean = compute_price(product, [], rows, {str(paper.id): str(p14.id), str(size.id): str(std.id)}, 1)
    stale = compute_price(product, [], rows, {str(paper.id): str(p14.id), str(coating.id): str(gloss.id),
                                              str(size.id): str(std.id)}, 1)
    assert Decimal(str(clean["unit_price"])) == Decimal("12.50")
    assert Decimal(str(stale["unit_price"])) == Decimal("12.50")


def test_a_ruled_out_choice_is_still_refused_at_checkout(card):
    paper, coating, size = card
    p14, matte, std = _v(paper, "14 pt"), _v(coating, "Matte"), _v(size, "Standard")
    product = SimpleNamespace(id=uuid.uuid4(), options=list(card), base_price=Decimal("20"),
                              option_rules=[_rule("disable_value", p14, value=matte)])
    with pytest.raises(ConfigurationError):
        compute_price(product, [], [], {str(paper.id): str(p14.id), str(coating.id): str(matte.id),
                                        str(size.id): str(std.id)}, 1)
