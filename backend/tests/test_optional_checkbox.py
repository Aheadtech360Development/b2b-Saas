"""An optional tick box ("Add lamination +$5") opens unticked, so its cost is
not in the opening price (dev fix list, item 7, 2026-11-20). A required one,
or one whose choice the shop made the default, opens chosen as before.
No database.
"""
from types import SimpleNamespace as NS

from app.services.configurator_service import default_selections


def value(vid, default=False):
    return NS(id=vid, position=0, enabled=True, is_default=default)


def option(oid, kind, required=False, values=()):
    return NS(id=oid, position=0, is_active=True, input_type=kind, required=required, values=list(values))


def test_an_optional_tick_box_opens_unticked():
    p = NS(options=[option("lam", "checkbox", values=[value("yes")])], option_rules=[])
    assert default_selections(p) == {}


def test_a_required_or_defaulted_tick_box_opens_ticked():
    required = NS(options=[option("lam", "checkbox", required=True, values=[value("yes")])], option_rules=[])
    assert default_selections(required) == {"lam": "yes"}
    defaulted = NS(options=[option("lam", "checkbox", values=[value("yes", default=True)])], option_rules=[])
    assert default_selections(defaulted) == {"lam": "yes"}


def test_other_questions_still_open_on_their_first_choice():
    p = NS(options=[option("size", "radio", values=[value("small"), value("large")])], option_rules=[])
    assert default_selections(p) == {"size": "small"}
