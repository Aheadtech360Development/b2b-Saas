"""The site a brand starts from when it opens the builder for the first time.

Real builder structures, not pages drawn in code: every one of these can be
selected, edited, moved and deleted in the editor like anything the merchant
adds themselves. The commerce parts carry no products — they say "the current
product" or "this collection" and are filled from the store at render time.

The brand's name, colours and menus are read from what it already has, so the
first thing it sees looks like its own shop rather than a demo.
"""
from __future__ import annotations

import itertools
from typing import Any

from app.services.builder.schema import SCHEMA_VERSION


class _Ids:
    """Short, unique ids for one document."""

    def __init__(self, prefix: str = "n") -> None:
        self._count = itertools.count(1)
        self._prefix = prefix

    def __call__(self) -> str:
        return f"{self._prefix}{next(self._count):04d}"


# A footer column's share of its row: side by side while there is room, onto the
# next line when there is not. (Mirrors asFooterColumn in the editor's registry.)
_COLUMN = {"flexGrow": 1, "flexBasis": "160px"}


def _node(ids: _Ids, ntype: str, props: dict | None = None, style: dict | None = None,
          children: list | None = None, **extra: Any) -> dict[str, Any]:
    node: dict[str, Any] = {"id": ids(), "type": ntype, "props": props or {}, "style": style or {}}
    if children is not None:
        node["children"] = children
    node.update(extra)
    return node


def _section(ids: _Ids, children: list, style: dict | None = None, name: str = "", **extra: Any) -> dict:
    return _node(ids, "section", {"width": "contained"}, {"paddingTop": "64px", "paddingBottom": "64px", **(style or {})},
                 children, **({"name": name} if name else {}), **extra)


def _row(ids: _Ids, columns: list[list], style: dict | None = None, mobile_columns: int = 1) -> dict:
    return _node(ids, "row", {}, {"columns": len(columns), "gap": "32px", **(style or {})},
                 [_node(ids, "column", {}, {}, col) for col in columns],
                 mobile={"columns": mobile_columns})


def starter_document(*, store_name: str = "", primary: str = "", header_menu: str = "",
                     footer_menu: str = "") -> dict[str, Any]:
    ids = _Ids()
    ink = "#14161B"
    primary = primary or ink

    # One line at every width: the logo, the menu (a button that opens a
    # drawer on phones) and the shop's icons. A grid of columns put the icons
    # on a second line on a phone; a row that spreads its three items does not.
    header = _node(ids, "section", {"width": "contained", "sticky": False}, {
        "paddingTop": "14px", "paddingBottom": "14px", "backgroundColor": "#FFFFFF",
        "borderColor": "#ECECEC",
    }, [
        _node(ids, "stack", {"direction": "row"}, {
            "justifyContent": "space-between", "alignItems": "center", "gap": "16px", "flexWrap": "nowrap",
        }, [
            _node(ids, "logo", {"fallback": "name"}, {"height": "40px"}),
            _node(ids, "menu", {"menuId": header_menu, "layout": "horizontal", "mobile": "drawer"},
                  {"justifyContent": "center"}),
            _node(ids, "stack", {"direction": "row"}, {"justifyContent": "flex-end", "gap": "4px", "flexWrap": "nowrap"}, [
                _node(ids, "search", {"style": "icon"}),
                _node(ids, "cart_link", {"showCount": True}),
                # Log in and Sign up by name, for the shop's own customers; on a
                # phone they sit inside the menu. (Mirrors the editor's registry.)
                _node(ids, "auth_buttons", {"loginLabel": "Log in", "signupLabel": "Sign up", "accountLabel": "My account",
                                            "loginStyle": "outline", "signupStyle": "solid"}),
            ]),
        ]),
    ], name="Header")

    announcement = _node(ids, "announcement_bar", {
        "text": "Order by 12 PM for same-day production", "href": "",
    }, {"backgroundColor": primary, "color": "#FFFFFF", "textAlign": "center",
        "paddingTop": "10px", "paddingBottom": "10px", "fontSize": "13px"}, name="Announcement")

    # The footer: five columns — the brand (logo, a line, a few words), three
    # menus, and a column of text. They are a row that wraps: side by side
    # while there is room, the last onto the next line when there is not, so a
    # phone stacks them without anything being set for it. Delete one and the
    # rest grow into its room. (Mirrors simpleFooter in the editor's registry.)
    footer = _node(ids, "section", {"width": "contained"}, {
        "paddingTop": "56px", "paddingBottom": "32px", "backgroundColor": "#F7F7F5",
    }, [
        _node(ids, "stack", {"direction": "row"}, {
            "flexWrap": "wrap", "gap": "32px", "alignItems": "flex-start",
        }, [
            _node(ids, "stack", {"direction": "column"}, {"gap": "10px", "flexGrow": 3, "flexBasis": "280px"}, [
                _node(ids, "logo", {"fallback": "name"}, {"height": "36px"}),
                _node(ids, "text", {"text": "Printed well, shipped fast."},
                      {"fontWeight": 600, "fontSize": "15px"}, name="Tagline"),
                _node(ids, "text", {"text": "A sentence or two about your shop — what you make and who for."},
                      {"color": "var(--b-muted,#5B6170)", "fontSize": "14px"}, name="About"),
            ], name="Brand"),
            # Three menu columns: the shop's own footer menu in the first, the
            # other two named and waiting for a menu to be chosen.
            _node(ids, "menu", {"title": "Products", "menuId": footer_menu or header_menu, "layout": "vertical"},
                  dict(_COLUMN), name="Products links"),
            _node(ids, "menu", {"title": "Support", "menuId": "", "layout": "vertical"},
                  dict(_COLUMN), name="Support links"),
            _node(ids, "menu", {"title": "Company", "menuId": "", "layout": "vertical"},
                  dict(_COLUMN), name="Company links"),
            # And one that is not links: how to reach the shop.
            _node(ids, "stack", {"direction": "column"}, {**_COLUMN, "gap": "10px"}, [
                _node(ids, "heading", {"text": "Talk to us", "level": 4}, {"fontSize": "15.75px", "lineHeight": "1.6"}),
                _node(ids, "rich_text", {"html": "<p>hello@yourshop.com</p><p>(000) 000-0000</p><p>City, State</p>"},
                      {"fontSize": "15px", "fontWeight": 500, "paddingTop": "6px"}),
            ], name="Talk to us"),
        ], name="Footer columns"),
        _node(ids, "divider", {}, {"marginTop": "36px", "marginBottom": "18px"}),
        _node(ids, "text", {"text": f"© {store_name or 'Our store'}. All rights reserved."},
              {"color": "var(--b-muted,#5B6170)", "fontSize": "12px"}, name="Small print"),
    ], name="Footer")

    home = _node(ids, "stack", {}, {}, [
        _section(ids, [
            _row(ids, [
                [_node(ids, "heading", {"text": f"Welcome to {store_name or 'our shop'}", "level": 1}),
                 _node(ids, "text", {"text": "Quality prints, fair prices, and orders that ship when we say they will."},
                       {"fontSize": "18px", "color": "#5B6170", "marginTop": "14px"}),
                 _node(ids, "stack", {"direction": "row"}, {"gap": "12px", "marginTop": "28px"}, [
                     _node(ids, "button", {"text": "Shop all", "href": "/products", "variant": "solid"}),
                     _node(ids, "button", {"text": "Get a quote", "href": "/quote", "variant": "outline"}),
                 ])],
                [_node(ids, "image", {"src": "", "alt": "", "placeholder": True},
                       {"borderRadius": "16px", "aspectRatio": "4 / 3", "objectFit": "cover"})],
            ], {"alignItems": "center"}),
        ], {"paddingTop": "88px", "paddingBottom": "88px"}, name="Hero"),
        _section(ids, [
            _node(ids, "heading", {"text": "Shop by collection", "level": 2}, {"textAlign": "center"}),
            _node(ids, "collection_grid", {"collectionIds": [], "limit": 4, "columns": 4},
                  {"marginTop": "32px"}, mobile={"columns": 2}),
        ], name="Collections"),
        _section(ids, [
            _node(ids, "heading", {"text": "New arrivals", "level": 2}, {"textAlign": "center"}),
            _node(ids, "product_grid", {"source": "newest", "limit": 8, "columns": 4},
                  {"marginTop": "32px"}, mobile={"columns": 2}),
        ], {"backgroundColor": "#FAFAF8"}, name="Products"),
        _section(ids, [
            _node(ids, "banner", {
                "heading": "Need it by Friday?", "text": "Same-day production on orders before noon.",
                "button": "Start an order", "href": "/products", "image": "",
            }, {"backgroundColor": primary, "color": "#FFFFFF", "borderRadius": "20px",
                "paddingTop": "56px", "paddingBottom": "56px"}),
        ], name="Promotion"),
        _section(ids, [
            _node(ids, "heading", {"text": "What customers say", "level": 2}, {"textAlign": "center"}),
            _node(ids, "testimonials", {"items": [
                {"quote": "Colours came out exactly as the proof. Will order again.", "name": "A happy customer"},
                {"quote": "Fast, careful, and they caught a problem with my file.", "name": "A repeat customer"},
                {"quote": "The easiest print order I have placed.", "name": "A new customer"},
            ], "columns": 3}, {"marginTop": "32px"}, mobile={"columns": 1}),
        ], name="Testimonials"),
    ], name="Home")

    page_default = _node(ids, "stack", {}, {}, [
        _section(ids, [
            _node(ids, "page_title", {"level": 1}),
            _node(ids, "page_content", {}, {"marginTop": "24px"}),
        ], {"paddingTop": "56px"}, name="Page"),
    ])
    page_landing = _node(ids, "stack", {}, {}, [
        _section(ids, [
            _node(ids, "page_title", {"level": 1}, {"textAlign": "center", "fontSize": "52px"}),
        ], {"paddingTop": "96px", "paddingBottom": "48px", "backgroundColor": "#FAFAF8"}, name="Landing hero"),
        _section(ids, [_node(ids, "page_content", {})], name="Content"),
    ])
    page_full = _node(ids, "stack", {}, {}, [
        _node(ids, "section", {"width": "full"}, {"paddingTop": "0px", "paddingBottom": "0px"},
              [_node(ids, "page_content", {})], name="Full width"),
    ])

    product_default = _node(ids, "stack", {}, {}, [
        _section(ids, [
            _node(ids, "breadcrumbs", {}),
            _row(ids, [
                [_node(ids, "product_gallery", {"layout": "thumbs-below"})],
                [_node(ids, "product_title", {"level": 1}),
                 _node(ids, "product_price", {"showCompare": True}, {"marginTop": "10px", "fontSize": "22px"}),
                 _node(ids, "product_buy", {"showQuantity": True, "showBuyNow": True}, {"marginTop": "24px"}),
                 _node(ids, "product_description", {}, {"marginTop": "28px"})],
            ], {"marginTop": "20px", "alignItems": "flex-start"}),
        ], {"paddingTop": "32px"}, name="Product"),
        _section(ids, [
            _node(ids, "heading", {"text": "You may also like", "level": 2}),
            _node(ids, "product_grid", {"source": "related", "limit": 4, "columns": 4},
                  {"marginTop": "24px"}, mobile={"columns": 2}),
        ], name="Related"),
    ])
    product_minimal = _node(ids, "stack", {}, {}, [
        _section(ids, [
            _node(ids, "product_gallery", {"layout": "single"}),
            _node(ids, "product_title", {"level": 1}, {"marginTop": "24px", "textAlign": "center"}),
            _node(ids, "product_price", {}, {"textAlign": "center", "marginTop": "8px"}),
            _node(ids, "product_buy", {"showQuantity": True}, {"marginTop": "24px", "maxWidth": "480px",
                                                                "marginLeft": "auto", "marginRight": "auto"}),
            _node(ids, "product_description", {}, {"marginTop": "32px"}),
        ], {"maxWidth": "760px"}, name="Product"),
    ])

    collection_default = _node(ids, "stack", {}, {}, [
        _section(ids, [
            _node(ids, "breadcrumbs", {}),
            _node(ids, "collection_title", {"level": 1}, {"marginTop": "12px"}),
            _node(ids, "collection_description", {}, {"marginTop": "10px", "color": "#5B6170"}),
            _node(ids, "collection_products", {"columns": 4, "pageSize": 12, "showSort": True},
                  {"marginTop": "32px"}, mobile={"columns": 2}),
        ], {"paddingTop": "40px"}, name="Collection"),
    ])

    search = _node(ids, "stack", {}, {}, [
        _section(ids, [
            _node(ids, "heading", {"text": "Search", "level": 1}),
            _node(ids, "search", {"style": "field"}, {"marginTop": "20px", "maxWidth": "560px"}),
            _node(ids, "product_grid", {"source": "search", "limit": 24, "columns": 4},
                  {"marginTop": "32px"}, mobile={"columns": 2}),
        ], name="Search"),
    ])
    cart = _node(ids, "stack", {}, {}, [
        _section(ids, [
            _node(ids, "heading", {"text": "Your cart", "level": 1}),
            _node(ids, "cart_items", {}, {"marginTop": "20px"}),
        ], {"paddingTop": "40px", "paddingBottom": "64px"}, name="Cart"),
    ])
    not_found = _node(ids, "stack", {}, {}, [
        _section(ids, [
            _node(ids, "heading", {"text": "We could not find that page", "level": 1}, {"textAlign": "center"}),
            _node(ids, "text", {"text": "It may have moved, or the link may be out of date."},
                  {"textAlign": "center", "color": "#5B6170", "marginTop": "12px"}),
            _node(ids, "stack", {"direction": "row"}, {"justifyContent": "center", "marginTop": "28px"}, [
                _node(ids, "button", {"text": "Back to the shop", "href": "/", "variant": "solid"}),
            ]),
        ], {"paddingTop": "120px", "paddingBottom": "120px"}, name="Not found"),
    ])

    about = _node(ids, "stack", {}, {}, [
        _node(ids, "rich_text", {"html": "<p>Tell your customers who you are, what you print, and why they "
                                         "can trust you with their order.</p>"}),
    ])

    def tpl(name: str, tree: dict) -> dict:
        return {"name": name, "tree": tree}

    return {
        "schema": SCHEMA_VERSION,
        "settings": {
            "colors": {"primary": primary, "text": ink, "muted": "#5B6170", "background": "#FFFFFF",
                       "surface": "#FAFAF8", "border": "#ECECEC"},
            "fonts": [{"family": "Inter", "source": "google", "weights": [400, 500, 600, 700],
                       "styles": ["normal"]}],
            "typography": {
                "heading": {"family": "Inter", "weight": 700},
                "body": {"family": "Inter", "weight": 400},
                "button": {"family": "Inter", "weight": 600},
                "scale": {
                    "h1": {"desktop": 52, "tablet": 42, "mobile": 34, "lineHeight": 1.1, "letterSpacing": -0.02},
                    "h2": {"desktop": 36, "tablet": 30, "mobile": 26, "lineHeight": 1.15, "letterSpacing": -0.01},
                    "h3": {"desktop": 26, "tablet": 22, "mobile": 20, "lineHeight": 1.25},
                    "h4": {"desktop": 18, "tablet": 17, "mobile": 16, "lineHeight": 1.35},
                    "h5": {"desktop": 16, "tablet": 15, "mobile": 15, "lineHeight": 1.4},
                    "h6": {"desktop": 14, "tablet": 14, "mobile": 13, "lineHeight": 1.4},
                    "body": {"desktop": 16, "tablet": 16, "mobile": 15, "lineHeight": 1.6},
                    "small": {"desktop": 13, "tablet": 13, "mobile": 12, "lineHeight": 1.5},
                    "button": {"desktop": 15, "tablet": 15, "mobile": 15, "lineHeight": 1},
                },
            },
            "layout": {"containerWidth": 1200, "radius": 10, "buttonRadius": 10, "sectionSpacing": 64},
        },
        "parts": {"header": header, "footer": footer, "announcement": announcement},
        "templates": {
            "home": {"default": tpl("Home", home)},
            "page": {"default": tpl("Default page", page_default),
                     "landing": tpl("Landing page", page_landing),
                     "full_width": tpl("Full width", page_full)},
            "product": {"default": tpl("Default product", product_default),
                        "minimal": tpl("Minimal product", product_minimal)},
            "collection": {"default": tpl("Default collection", collection_default)},
            "search": {"default": tpl("Search", search)},
            "cart": {"default": tpl("Cart", cart)},
            "not_found": {"default": tpl("Page not found", not_found)},
        },
        "pages": {"about": {"title": "About us", "template": "default",
                            "seo": {"title": "", "description": "", "image": ""}, "tree": about}},
        "assignments": {"product": {"default": "default", "byId": {}},
                        "collection": {"default": "default", "byId": {}},
                        "page": {"default": "default"}},
        "globals": {},
        "saved": {},
    }
