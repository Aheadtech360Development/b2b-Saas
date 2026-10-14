"""JavaScript in a Custom HTML block: the brand's own script, on its live site.

The block's HTML has every script taken out of it (sanitize.py), because a
script in markup runs with the shopper's session. The manager asked for
JavaScript in the block all the same, so it has a field of its own, `js`, kept
apart from the HTML and never mixed into it:

- Only an Administrator (or the platform) can add or change it. Managers and
  Editors can work in the builder too, and a script on the storefront runs on
  the same address as the admin, where an Administrator's session lives: an
  Editor must not be able to put one there.
- It runs on the storefront only, once the page has loaded, and never inside
  the builder's editor (frontend: components/builder/islands/BlockScript.tsx).
- What the script does is the brand's own business, as with the custom code
  box in Tracking & Analytics. It is limited in size, not checked.
"""
from __future__ import annotations

from typing import Any

MAX_SCRIPT = 20_000

# The roles that may write a script: the shop's Administrator, the platform.
FULL_ADMIN_ROLES = {"tenant_admin", "platform_admin"}


def scripts_in(doc: Any) -> set[str]:
    """Every Custom HTML block's script, in every tree of a builder document.

    The script itself, not where it is: copying or moving a block that has the
    Administrator's script in it is not writing one. Whoever may do that may
    already change the block's HTML the script works on, so it gives nothing
    more away.
    """
    from app.services.builder.schema import all_trees, iter_nodes

    found: set[str] = set()
    if not isinstance(doc, dict):
        return found
    for _path, tree, _ttype in all_trees(doc):
        for node, _where, _depth in iter_nodes(tree):
            if node.get("type") != "html":
                continue
            props = node.get("props")
            script = props.get("js") if isinstance(props, dict) else None
            if isinstance(script, str) and script.strip():
                found.add(script)
    return found


def new_scripts(incoming: Any, *known: Any) -> set[str]:
    """The scripts in `incoming` that none of the `known` documents had: added,
    or changed. Taking one out is not in it: that is never a risk."""
    seen: set[str] = set()
    for doc in known:
        seen |= scripts_in(doc)
    return scripts_in(incoming) - seen


def may_write_scripts(role: Any, scopes: Any, is_platform_admin: bool) -> bool:
    """An Administrator, by the built-in role (a role with its own list of
    sections is a partial one), or the platform."""
    if is_platform_admin:
        return True
    return role in FULL_ADMIN_ROLES and not scopes
