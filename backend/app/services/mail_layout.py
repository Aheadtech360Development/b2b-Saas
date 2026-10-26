"""Every email's look: the owner's design "PrintCoPilot Documents and Emails".

One card on a light page: the sender's logo and name across the top, a
heading, a line or two, a small box of facts (order, total, tracking...), one
or two buttons, and a footer saying who sent it and why.

A shop's mail to its customers wears the shop: its name, logo and colour, from
the request's brand identity (core/database.use_brand_identity). Mail from the
platform to a shop's owner wears PrintCoPilot.

Email clients are not browsers: tables, inline styles, no classes, no web font
relied on. The preview is the hidden line an inbox shows after the subject.
"""
from __future__ import annotations

import html
from dataclasses import dataclass
from typing import Sequence

PLATFORM_NAME = "PrintCoPilot"
PLATFORM_LOGO = "https://www.printcopilot.co/wordmark-horizontal_color_600w.png"
PLATFORM_COLOR = "#0C1F3F"
# The design's own accent, for a shop that has not chosen a colour.
DEFAULT_COLOR = "#0F766E"

INK = "#1B2430"
BODY = "#3A4A5E"
MUTED = "#5A6A7E"
LINE = "#E3E8EF"
PAGE = "#F6F7F8"
FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"


@dataclass(frozen=True)
class Button:
    label: str
    url: str
    primary: bool = True


@dataclass(frozen=True)
class Fact:
    label: str
    value: str
    url: str | None = None


def esc(value: object) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def ink_on(color: str) -> str:
    """Dark text on a light colour, white on a dark one."""
    c = (color or "").lstrip("#")
    if len(c) != 6:
        return "#ffffff"
    try:
        r, g, b = (int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))
    except ValueError:
        return "#ffffff"

    def lin(v: float) -> float:
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    return INK if lum > 0.45 else "#ffffff"


def shop_identity() -> tuple[str, str, str, str]:
    """(name, logo, colour, address) of the shop this request belongs to."""
    from app.core.tenant_context import get_current_brand_color
    from app.services.email_service import _brand_logo, _current_brand_from_context, _tenant_email_cfg
    from app.core.config import settings

    name = _current_brand_from_context() or getattr(settings, "EMAIL_FROM_NAME", "") or "Our shop"
    try:
        logo = _brand_logo()
    except Exception:  # noqa: BLE001
        logo = ""
    try:
        color = get_current_brand_color() or DEFAULT_COLOR
    except Exception:  # noqa: BLE001
        color = DEFAULT_COLOR
    try:
        address = (_tenant_email_cfg().get("address") or "").strip()
    except Exception:  # noqa: BLE001
        address = ""
    return name, logo, color, address


def paragraphs(lines: Sequence[str]) -> str:
    return "".join(
        f'<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:{BODY}">{esc(line)}</p>'
        for line in lines if line
    )


def _facts(facts: Sequence[Fact]) -> str:
    rows = []
    for f in facts:
        if f.value in (None, ""):
            continue
        value = (f'<a href="{esc(f.url)}" style="color:{INK};text-decoration:underline">{esc(f.value)}</a>'
                 if f.url else esc(f.value))
        rows.append(
            '<tr>'
            f'<td style="padding:5px 0;font-size:15px;color:{BODY}">{esc(f.label)}</td>'
            f'<td align="right" style="padding:5px 0;font-size:15px;color:{INK};font-weight:600">{value}</td>'
            '</tr>'
        )
    if not rows:
        return ""
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="border:1px solid {LINE};border-radius:10px;border-collapse:separate;margin:6px 0 20px">'
        f'<tr><td style="padding:12px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
        + "".join(rows) +
        '</table></td></tr></table>'
    )


def _note(note: str | None) -> str:
    if not note:
        return ""
    return (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px">'
        f'<tr><td style="background:{PAGE};border-left:3px solid {LINE};border-radius:6px;padding:12px 16px;'
        f'font-size:15px;line-height:1.55;color:{INK};white-space:pre-wrap">{esc(note)}</td></tr></table>'
    )


def _buttons(buttons: Sequence[Button], color: str) -> str:
    if not buttons:
        return ""
    # Each button is its own small table set to the left, so on a narrow
    # screen the second goes under the first instead of squeezing both.
    cells = []
    for b in buttons:
        if not b.url:
            continue
        if b.primary:
            style = (f"display:inline-block;background:{color};color:{ink_on(color)};border:1px solid {color};"
                     "padding:13px 24px;border-radius:8px;font-weight:600;font-size:15px;text-decoration:none;"
                     "white-space:nowrap")
        else:
            style = (f"display:inline-block;background:#ffffff;color:{INK};border:1px solid #D5DCE6;"
                     "padding:13px 24px;border-radius:8px;font-weight:600;font-size:15px;text-decoration:none;"
                     "white-space:nowrap")
        cells.append(f'<table role="presentation" align="left" cellpadding="0" cellspacing="0" '
                     f'style="margin:0 10px 10px 0"><tr><td><a href="{esc(b.url)}" style="{style}">'
                     f'{esc(b.label)}</a></td></tr></table>')
    if not cells:
        return ""
    return ('<div style="margin:6px 0 4px">' + "".join(cells)
            + '<div style="clear:both;line-height:0;font-size:0">&nbsp;</div></div>')


def frame(content_html: str, *, preview: str = "", platform: bool = False, reason: str = "your order") -> str:
    """Prepared content in the design's card: for the emails that build their
    own body (EmailService._base_template's callers)."""
    return _page(content_html, preview=preview, platform=platform, reason=reason)


def render(
    *,
    heading: str,
    lines: Sequence[str] = (),
    intro_html: str | None = None,
    facts: Sequence[Fact] = (),
    note: str | None = None,
    after: Sequence[str] = (),
    extra_html: str = "",
    buttons: Sequence[Button] = (),
    preview: str = "",
    platform: bool = False,
    reason: str = "your order",
) -> str:
    """One email, in the design's card.

    `lines` are plain sentences (escaped here). `intro_html` is the shop's own
    opening from Settings, Notifications (already safe HTML); it takes the
    place of `lines`. `after` are sentences under the facts; `extra_html` a
    prepared block (a pickup address, say) under those.
    """
    color = PLATFORM_COLOR if platform else shop_identity()[2]
    body = (
        f'<h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;font-weight:600;color:{INK}">{esc(heading)}</h1>'
        + (intro_html if intro_html else paragraphs(lines))
        + _note(note)
        + _facts(facts)
        + paragraphs(after)
        + (extra_html or "")
        + _buttons(buttons, color)
    )
    return _page(body, preview=preview, platform=platform, reason=reason)


def _page(body: str, *, preview: str, platform: bool, reason: str) -> str:
    if platform:
        name, logo, color, address = PLATFORM_NAME, PLATFORM_LOGO, PLATFORM_COLOR, ""
        reason = reason if reason != "your order" else "your account"
    else:
        name, logo, color, address = shop_identity()

    if logo:
        mark = (f'<img src="{esc(logo)}" alt="{esc(name)}" height="36" '
                f'style="display:block;height:36px;width:auto;max-width:180px;border:0">')
        title = "" if platform else (
            f'<td style="padding-left:12px;font-size:18px;font-weight:600;color:{INK}">{esc(name)}</td>')
        header = f'<table role="presentation" cellpadding="0" cellspacing="0"><tr><td>{mark}</td>{title}</tr></table>'
    else:
        header = f'<div style="font-size:18px;font-weight:600;color:{INK}">{esc(name)}</div>'

    hidden = ""
    if preview:
        hidden = (f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">{esc(preview)}'
                  + "&nbsp;&zwnj;" * 40 + '</div>')

    sender = f"{name}{', ' + address if address else ''}"
    # "Northwind Print Co." ends its own sentence.
    footer = f"{sender}{'' if sender.endswith('.') else '.'} You are getting this because of {reason}."
    return (
        f'<!doctype html><html><head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        f'<body style="margin:0;padding:0;background:{PAGE}">{hidden}'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{PAGE};font-family:{FONT}">'
        f'<tr><td align="center" style="padding:24px 12px">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'style="max-width:560px;background:#ffffff;border:1px solid {LINE};border-radius:12px;border-collapse:separate">'
        f'<tr><td style="padding:20px 28px;border-bottom:1px solid {LINE}">{header}</td></tr>'
        f'<tr><td style="padding:28px 28px 18px">{body}</td></tr>'
        f'<tr><td style="padding:16px 28px;border-top:1px solid {LINE};font-size:13px;line-height:1.5;color:{MUTED}">{esc(footer)}</td></tr>'
        '</table></td></tr></table></body></html>'
    )


def money(value: object) -> str:
    try:
        return f"${float(value or 0):,.2f}"
    except (TypeError, ValueError):
        return "$0.00"
