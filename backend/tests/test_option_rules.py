"""A configurable product's "show only these choices" rule.

The owner's case: with 14 pt uncoated paper the Coating question offers No
Coating alone; 16 pt paper offers every coating. The rule is a row per choice
kept, so these check that the server reads such rows the way both product
pages do (frontend lib/optionRules), refuses what they leave off the page,
opens on a choice they keep, and that the admin, the products file and the
pages all see one rule.
"""
from __future__ import annotations

import json
import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.api.v1.admin.product_options import _rule_rows
from app.services import product_export, product_import
from app.services.configurator_service import (
    ConfigurationError,
    compute_price,
    default_selections,
    evaluate_rules,
    public_rules,
)


def _value(label, position, *, enabled=True, default=False, delta="0"):
    return SimpleNamespace(id=uuid.uuid4(), label=label, enabled=enabled, price_delta=Decimal(delta),
                           price_mode="flat", sku_suffix=None, position=position, is_default=default,
                           swatch_hex=None, image_url=None)


def _option(name, labels, position, *, required=True):
    return SimpleNamespace(id=uuid.uuid4(), name=name, input_type="select", is_active=True, required=required,
                           position=position, help_text=None, in_price_matrix=False,
                           values=[_value(x, i, default=i == 0) for i, x in enumerate(labels)])


def _keep(when, option, value, note=None):
    return SimpleNamespace(id=uuid.uuid4(), when_value_id=when.id, action="only_values",
                           target_option_id=option.id, target_value_id=value.id, note=note)


def _card(*keeps):
    paper = _option("Paper Type", ["14 pt. Uncoated Cover", "16 pt. Gloss Cover"], 0)
    coating = _option("Coating", ["High Gloss UV Both Sides", "No Coating", "Matte"], 1)
    corners = _option("Corners", ["Square", "Round"], 2)
    product = SimpleNamespace(id=uuid.uuid4(), options=[paper, coating, corners], option_rules=[],
                              base_price=Decimal("20"))
    return product, paper, coating, corners


def _v(option, label):
    return next(v for v in option.values if v.label == label)


def _sel(**picks):
    return {k: str(v.id) for k, v in picks.items()}


def test_only_the_kept_choices_are_offered_while_the_trigger_is_picked():
    product, paper, coating, _ = _card()
    p14, none, matte = _v(paper, "14 pt. Uncoated Cover"), _v(coating, "No Coating"), _v(coating, "Matte")
    rules = [_keep(p14, coating, none), _keep(p14, coating, matte)]

    on = evaluate_rules(rules, {str(paper.id): str(p14.id)})
    assert on["only_values"] == {str(coating.id): {str(none.id), str(matte.id)}}
    off = evaluate_rules(rules, {str(paper.id): str(_v(paper, "16 pt. Gloss Cover").id)})
    assert off["only_values"] == {}


def test_two_triggers_leave_what_both_keep_and_nothing_left_hides_the_question():
    product, paper, coating, corners = _card()
    p14, round_ = _v(paper, "14 pt. Uncoated Cover"), _v(corners, "Round")
    none, matte, uv = (_v(coating, x) for x in ("No Coating", "Matte", "High Gloss UV Both Sides"))
    picks = {str(paper.id): str(p14.id), str(corners.id): str(round_.id)}

    both = evaluate_rules([_keep(p14, coating, none), _keep(p14, coating, matte),
                           _keep(round_, coating, matte), _keep(round_, coating, uv)], picks)
    assert both["only_values"][str(coating.id)] == {str(matte.id)}
    assert str(coating.id) not in both["hidden_options"]

    disagree = evaluate_rules([_keep(p14, coating, none), _keep(round_, coating, uv)], picks)
    assert str(coating.id) in disagree["hidden_options"]


def test_the_price_refuses_a_choice_the_rule_takes_off_the_page():
    product, paper, coating, corners = _card()
    p14, none, uv = _v(paper, "14 pt. Uncoated Cover"), _v(coating, "No Coating"), _v(coating, "High Gloss UV Both Sides")
    product.option_rules = [_keep(p14, coating, none, note="Uncoated paper takes no coating")]
    square = _v(corners, "Square")

    priced = compute_price(product, [], [], _sel(**{str(paper.id): p14, str(coating.id): none, str(corners.id): square}), 1)
    assert priced["total"] == 20.0
    with pytest.raises(ConfigurationError, match="Uncoated paper takes no coating"):
        compute_price(product, [], [], _sel(**{str(paper.id): p14, str(coating.id): uv, str(corners.id): square}), 1)
    # 16 pt paper: the rule is not in force, every coating sells.
    p16 = _v(paper, "16 pt. Gloss Cover")
    assert compute_price(product, [], [], _sel(**{str(paper.id): p16, str(coating.id): uv, str(corners.id): square}), 1)


def test_a_question_left_with_no_choice_it_sells_is_not_asked_for():
    """Kept, but switched off in the admin: nobody could answer it, so it is left out."""
    product, paper, coating, corners = _card()
    p14, foil = _v(paper, "14 pt. Uncoated Cover"), _value("Foil", 3, enabled=False, delta="9")
    coating.values.append(foil)
    product.option_rules = [_keep(p14, coating, foil)]
    priced = compute_price(product, [], [], _sel(**{str(paper.id): p14, str(corners.id): _v(corners, "Square")}), 1)
    assert priced["total"] == 20.0


def test_the_page_opens_on_a_choice_the_rule_keeps():
    product, paper, coating, _ = _card()
    p14, none = _v(paper, "14 pt. Uncoated Cover"), _v(coating, "No Coating")
    product.option_rules = [_keep(p14, coating, none)]
    opened = default_selections(product)          # 14 pt and UV are the first choices
    assert opened[str(paper.id)] == str(p14.id)
    assert opened[str(coating.id)] == str(none.id)


def test_the_pages_are_sent_every_row():
    product, paper, coating, _ = _card()
    rule = _keep(_v(paper, "14 pt. Uncoated Cover"), coating, _v(coating, "No Coating"), note="n")
    assert public_rules([rule]) == [{
        "when_value_id": str(rule.when_value_id), "action": "only_values",
        "target_option_id": str(coating.id), "target_value_id": str(rule.target_value_id), "note": "n",
    }]


def test_the_admin_sees_one_rule_with_its_choices_ticked():
    product, paper, coating, corners = _card()
    p14 = _v(paper, "14 pt. Uncoated Cover")
    product.option_rules = [
        _keep(p14, coating, _v(coating, "Matte"), note="Uncoated paper takes no coating"),
        _keep(p14, coating, _v(coating, "No Coating")),
        _keep(p14, corners, _v(corners, "Square")),
        SimpleNamespace(id=uuid.uuid4(), when_value_id=p14.id, action="hide_option",
                        target_option_id=corners.id, target_value_id=None, note=None),
    ]
    rows = _rule_rows(product)
    coat = next(r for r in rows if r["action"] == "only_values" and r["target_option"] == 1)
    assert coat["target_values"] == [1, 2]
    assert coat["target_value"] is None
    assert coat["note"] == "Uncoated paper takes no coating"
    assert next(r for r in rows if r["action"] == "only_values" and r["target_option"] == 2)["target_values"] == [0]
    assert next(r for r in rows if r["action"] == "hide_option")["target_values"] == []
    assert len(rows) == 3


def test_the_products_file_carries_the_rule_and_reads_it_back():
    product, paper, coating, _ = _card()
    p14 = _v(paper, "14 pt. Uncoated Cover")
    rules = [_keep(p14, coating, _v(coating, "No Coating")), _keep(p14, coating, _v(coating, "Matte"))]
    text = product_export._options_data(product.options, rules)
    said = json.loads(text)["rules"]
    assert said == [
        {"when": ["Paper Type", "14 pt. Uncoated Cover"], "action": "only_values", "option": "Coating", "value": "No Coating"},
        {"when": ["Paper Type", "14 pt. Uncoated Cover"], "action": "only_values", "option": "Coating", "value": "Matte"},
    ]
    assert product_import.parse_options(text)["rules"] == said
