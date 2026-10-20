"""Partner emails open with the platform's logo, not its name in text: the
owner's rule for every PrintCoPilot header, the site's, the console's and the
partner portal's alike. The name stays only when there is no address to load
the logo from. No database or network."""
from app.core.config import get_settings
from app.services.partners import mail


def test_partner_mail_opens_with_the_logo(monkeypatch):
    monkeypatch.setattr(get_settings(), "PLATFORM_NAME", "")
    monkeypatch.setattr(get_settings(), "FRONTEND_URL", "https://www.printcopilot.co/")
    html = mail._page("Welcome", ["Hi"])
    assert '<img src="https://www.printcopilot.co/wordmark-horizontal_color_600w.png"' in html
    assert 'alt="PrintCoPilot"' in html and ">Partners</p>" in html
    assert "PrintCoPilot Partners" not in html


def test_without_an_address_the_name_stays(monkeypatch):
    monkeypatch.setattr(get_settings(), "PLATFORM_NAME", "")
    monkeypatch.setattr(get_settings(), "FRONTEND_URL", "")
    html = mail._page("Welcome", ["Hi"])
    assert "<img" not in html and "PrintCoPilot Partners" in html
