"""SanMar, read from the files SanMar puts on its SFTP for each customer.

SanMar has no catalogue API like S&S's. A customer with an integration login
gets the whole catalogue as files in `SanMarPDD/`, refreshed daily:

* SanMar_SDL_N.zip: one row per SKU (about 160,000 rows, 4,000 styles): title,
  brand (MILL), category, colour, size, the customer's own prices (piece: 1 to
  5, dozen: 6 and up, case), MSRP, GTIN and full image links.
* SanMar_EPDD_csv.zip: the same SKUs with QTY, the stock of every warehouse
  together; a SKU is listed once for each category it is in. Its descriptions
  keep the breaks between features, which SDL_N's run together.

They are read with the brand's own login over SFTP (port 2200: the FTP port
offers no encryption and is never used), kept on disk for a few hours per
brand, and read in a thread so a 600 MB file never stalls the web server.

The rows are turned into the shapes S&S's API returns (styles, SKU rows), so
the supplier pipeline (ss_products, jobs, Match Fields, pricing rules, stock
settings) serves both suppliers without a second copy of it.
"""
from __future__ import annotations

import asyncio
import csv
import hashlib
import html
import io
import json
import logging
import os
import re
import tempfile
import time
import uuid
import zipfile
from pathlib import Path
from collections.abc import Iterator
from typing import Any

from app.core.redis import redis_get, redis_set
from app.services.size_order import sort_sizes
from app.services.suppliers.ss_catalog import CatalogUnavailable

logger = logging.getLogger(__name__)

HOST = "ftp.sanmar.com"
PORT = 2200
# SanMar's SFTP host key, read 2026-11-03. Pinned: the brand's login is only
# ever sent to a server that proves it holds this key.
HOST_KEY = (
    "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCju+iwnPc19J3BmciSFih+d9VqZ1XOnC6DkvQmOg5fY1saS0jnI3fUuPZx0VSR"
    "/ulmckZBrGgPwNWXXlgvL+fbFpJkwQdXY5gvZI8XmyXigP0AQ6ZMtL+yOeodZLwc0ZXq7HB0O6hG3fql3v6zqx4SUzqjq+lrICVP"
    "THSFScwg4RymKKSOaKCARE/91UaDKzvBXEmqwsSvkxwA0ZCsHQtO+WB19guGCGCQZqsxit4SBAECfu+fwq6SHtkQe+gesC0YkL6uN0U"
    "TN2+pZ35Xpb9wu37kS6XsC8ZFZKEe2VuAngdeNy+qJD5tcH3DW8B/0EPs9ar+8gi+nVf9NuhKzayZ"
)
PRODUCTS_FILE = "SanMarPDD/SanMar_SDL_N.zip"
STOCK_FILE = "SanMarPDD/SanMar_EPDD_csv.zip"
# SanMar writes both once a day; stock is fetched again sooner.
PRODUCTS_TTL = 12 * 3600
STOCK_TTL = 6 * 3600
STYLES_KEY = "sanmar:styles:v1:{account}"
STYLES_TTL = 12 * 3600

# A description cell can run long; the module default (128 KB) is plenty, but
# one oversized cell must not end a 160,000-row read.
csv.field_size_limit(max(csv.field_size_limit(), 4_000_000))

_locks: dict[str, asyncio.Lock] = {}
_memo: dict[str, tuple[float, list[dict]]] = {}
_warming: set[asyncio.Task] = set()


def from_connection(conn: dict, tenant_id: Any = None) -> SanMarService:
    """A client for one brand's saved SanMar login."""
    return SanMarService(conn.get("ftp_username"), conn.get("ftp_password"), tenant_id=tenant_id)


def warm_styles(conn: dict, tenant_id: Any) -> None:
    """Read the catalogue in the background once a brand connects, so its first
    Browse does not wait the minute or two SanMar's files take."""
    async def run() -> None:
        svc = from_connection(conn, tenant_id=tenant_id)
        try:
            await svc.all_styles()
        except Exception as exc:
            logger.warning("SanMar catalogue warm-up failed: %s", exc)
        finally:
            await svc.close()

    task = asyncio.create_task(run())
    _warming.add(task)
    task.add_done_callback(_warming.discard)


# ── Cleaning SanMar's cells ──────────────────────────────────────────────────

def _text(value: Any) -> str:
    return re.sub(r"\s+", " ", html.unescape(str(value or ""))).strip()


def _num(value: Any) -> float | None:
    text = str(value or "").strip().replace("$", "").replace(",", "")
    try:
        return round(float(text), 4) if text else None
    except ValueError:
        return None


def _int(value: Any) -> int:
    n = _num(value)
    return int(n) if n is not None else 0


def _url(value: Any) -> str | None:
    text = str(value or "").strip()
    return text if text.lower().startswith(("https://", "http://")) else None


def _code(value: Any) -> str:
    """A colour or size as it can sit in a SKU: letters and digits, upper case."""
    return re.sub(r"[^A-Za-z0-9]+", "", str(value or "")).upper()


def _discontinued(row: dict) -> bool:
    return _text(row.get("PRODUCT_STATUS")).lower() == "discontinued"


def categories(value: Any) -> list[str]:
    """SDL_N joins a style's categories with ";" ("T-Shirts ;Women's")."""
    out: list[str] = []
    for part in re.split(r"[;,]", html.unescape(str(value or ""))):
        part = part.strip()
        if part and part not in out:
            out.append(part)
    return out


def title(raw: Any, brand: str, style: str) -> str:
    """"Jerzees -  Dri-Power 50/50 Cotton/Poly T-Shirt.  29M" → the words between
    the brand and the style number, as S&S's titles read."""
    text = re.sub(r"[®™]", "", _text(raw))
    text = re.sub(r"\s+", " ", text).strip()
    if brand and text.lower().startswith(brand.lower()):
        text = text[len(brand):].lstrip(" -–:")
    if style:
        text = re.sub(rf"[\s.,-]*\b{re.escape(style)}\s*$", "", text, flags=re.I)
    return text.strip(" .-") or _text(raw)


def description(raw: Any) -> str:
    """SanMar's description cell as HTML: the opening sentence as a paragraph,
    then one point per feature. Features are set apart by two or more spaces
    (and sometimes "|"), with no other mark between them."""
    text = html.unescape(str(raw or "")).replace("\r", " ").replace("\n", " ")
    parts = []
    for chunk in text.split("|"):
        for part in re.split(r"\s{2,}", chunk):
            part = re.sub(r"\s+", " ", part).strip(" |")
            if part:
                parts.append(part)
    if not parts:
        return ""
    intro = ""
    if len(parts[0]) > 60 and parts[0].rstrip().endswith((".", "!")):
        intro, parts = parts[0], parts[1:]
    out = f"<p>{html.escape(intro)}</p>" if intro else ""
    if parts:
        out += "<ul>" + "".join(f"<li>{html.escape(p)}</li>" for p in parts) + "</ul>"
    return out


def sku_of(row: dict) -> str:
    """The store SKU of a SanMar row: style, SanMar's own colour name (the one
    orders must use) and size, e.g. 29M-WHITE-S."""
    style = _text(row.get("STYLE#"))
    color = _code(row.get("SANMAR_MAINFRAME_COLOR")) or _code(row.get("COLOR_NAME"))
    return f"{style}-{color}-{_code(row.get('SIZE'))}"[:100]


# ── Reading the files ────────────────────────────────────────────────────────

def csv_rows(path: Path) -> Iterator[dict]:
    """The rows of the one CSV inside a SanMar zip, read as they come."""
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if n.lower().endswith((".csv", ".txt"))]
        if not names:
            raise ValueError(f"{path.name} holds no CSV")
        with z.open(names[0]) as raw:
            yield from csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline=""))


def sku_row(row: dict, qty: int | None) -> dict:
    """One SanMar row in the shape of an S&S SKU row (ss_products, mapping)."""
    front_flat, front_model = _url(row.get("FRONT_FLAT_IMAGE_URL")), _url(row.get("FRONT_MODEL_IMAGE_URL"))
    piece = _num(row.get("PIECE_PRICE"))
    style = _text(row.get("STYLE#"))
    return {
        "styleID": style,
        "partNumber": style,
        "sku": sku_of(row),
        "gtin": _text(row.get("GTIN")),
        "colorName": _text(row.get("COLOR_NAME")) or _text(row.get("SANMAR_MAINFRAME_COLOR")),
        "sizeName": _text(row.get("SIZE")),
        "sizeIndex": _int(row.get("SIZE_INDEX")),
        # The brand's own price for one to five pieces: what a store sells one at a time.
        "customerPrice": piece,
        "piecePrice": piece,
        "dozenPrice": _num(row.get("DOZENS_PRICE")),
        "casePrice": _num(row.get("CASE_PRICE")),
        "retailPrice": _num(row.get("MSRP")) or _num(row.get("SUGGESTED_PRICE")),
        "mapPrice": _num(row.get("MAP_PRICING")),
        "unitWeight": _num(row.get("PIECE_WEIGHT")),
        "caseQty": _int(row.get("CASE_SIZE")),
        "countryOfOrigin": "",
        "qty": qty or 0,
        "warehouses": [],
        "colorFrontImage": front_flat or front_model,
        "colorBackImage": _url(row.get("BACK_FLAT_IMAGE_URL")),
        "colorOnModelFrontImage": front_model,
        "colorOnModelBackImage": _url(row.get("BACK_MODEL_IMAGE_URL")),
        # SanMar's own keys, for orders.
        "mainframeColor": _text(row.get("SANMAR_MAINFRAME_COLOR")),
        "inventoryKey": _text(row.get("INVENTORY_KEY")),
        "uniqueKey": _text(row.get("UNIQUE_KEY")),
        "status": _text(row.get("PRODUCT_STATUS")),
    }


def build_styles(products: Path, stock: Path | None) -> list[dict]:
    """Every style SanMar still sells, in the trimmed shape S&S's are cached in
    (ss_catalog), with its variant count, sizes and colours, and the clean
    description from the stock file."""
    styles: dict[str, dict] = {}
    sizes: dict[str, set[str]] = {}
    colors: dict[str, set[str]] = {}
    for r in csv_rows(products):
        style = _text(r.get("STYLE#"))
        if not style or _discontinued(r):
            continue
        s = styles.get(style)
        if s is None:
            brand = _text(r.get("MILL"))
            s = styles[style] = {
                "style_id": style, "part_number": style, "brand": brand, "style_name": style,
                "title": title(r.get("PRODUCT_TITLE"), brand, style),
                "category": ", ".join(categories(r.get("CATEGORY_NAME"))),
                "description": "",
                "image": _url(r.get("FRONT_MODEL_IMAGE_URL")) or _url(r.get("FRONT_FLAT_IMAGE_URL")),
                "brand_image": None,
                "status": _text(r.get("PRODUCT_STATUS")),
                "stats": {"variants": 0, "sizes": [], "colors": 0},
            }
            sizes[style], colors[style] = set(), set()
        s["stats"]["variants"] += 1
        sizes[style].add(_text(r.get("SIZE")))
        colors[style].add(_text(r.get("COLOR_NAME")))
    for style, s in styles.items():
        # On the size chart: SanMar's SIZE_INDEX numbers sizes within each of its
        # own groups (S and 2XL can share one), not across the style.
        s["stats"]["sizes"] = [z for z in sort_sizes(sizes[style]) if z]
        s["stats"]["colors"] = len(colors[style])
    if stock is not None:
        missing = set(styles)
        for r in csv_rows(stock):
            style = _text(r.get("STYLE#"))
            if style in missing:
                text = description(r.get("PRODUCT_DESCRIPTION"))
                if text:
                    styles[style]["description"] = text[:8000]
                    missing.discard(style)
                    if not missing:
                        break
    return sorted(styles.values(), key=lambda s: (s["brand"].lower(), s["style_name"].lower()))


def stock_by_key(stock: Path, wanted: set[str]) -> dict[str, int]:
    """QTY by SanMar's unique key for the styles asked for. A SKU listed under
    several categories carries the same figure on each line."""
    out: dict[str, int] = {}
    for r in csv_rows(stock):
        if _text(r.get("STYLE#")) in wanted:
            out.setdefault(_text(r.get("UNIQUE_KEY")), _int(r.get("QTY")))
    return out


def sku_rows(products: Path, stock: Path, wanted: set[str]) -> list[dict]:
    """The SKU rows of the styles asked for, with stock: by colour as SanMar
    lists them, each colour's sizes on the size chart."""
    qty = stock_by_key(stock, wanted)
    rows = [sku_row(r, qty.get(_text(r.get("UNIQUE_KEY")), 0))
            for r in csv_rows(products)
            if _text(r.get("STYLE#")) in wanted and not _discontinued(r)]
    colour_at: dict[tuple[str, str], int] = {}
    style_sizes: dict[str, set[str]] = {}
    for r in rows:
        colour_at.setdefault((r["styleID"], r["colorName"]), len(colour_at))
        style_sizes.setdefault(r["styleID"], set()).add(r["sizeName"])
    size_at = {style: {z: i for i, z in enumerate(sort_sizes(found))} for style, found in style_sizes.items()}
    rows.sort(key=lambda r: (colour_at[(r["styleID"], r["colorName"])], size_at[r["styleID"]].get(r["sizeName"], 999)))
    return rows


def inventory_rows(stock: Path, wanted: set[str]) -> list[dict]:
    """Stock rows (style, SKU, QTY) for the styles asked for, from the stock
    file alone: it carries the colour and size a SKU is made of."""
    seen: set[str] = set()
    out = []
    for r in csv_rows(stock):
        if _text(r.get("STYLE#")) not in wanted or _discontinued(r):
            continue
        key = _text(r.get("UNIQUE_KEY"))
        if key in seen:
            continue
        seen.add(key)
        out.append({"styleID": _text(r.get("STYLE#")), "sku": sku_of(r), "qty": _int(r.get("QTY")), "warehouses": []})
    return out


# ── The client ───────────────────────────────────────────────────────────────

class SanMarService:
    """One brand's SanMar files. The SFTP connection is opened when first
    needed and closed by `close()`."""

    country = "US"

    def __init__(self, username: str | None, password: str | None, *, tenant_id: Any = None) -> None:
        self.username = (username or "").strip()
        self.password = password or ""
        # The account the files belong to, without naming it on disk.
        self.account = hashlib.sha256(f"{tenant_id or ''}:{self.username}".encode()).hexdigest()[:16]
        self._conn = None
        self._rows: dict[str, list[dict]] = {}
        self._inventory: dict[str, list[dict]] = {}

    @property
    def has_credentials(self) -> bool:
        return bool(self.username and self.password)

    async def _connection(self):
        import asyncssh

        if self._conn is not None:
            return self._conn
        if not self.has_credentials:
            raise CatalogUnavailable("Connect your SanMar account first: FTP username and password.")
        try:
            self._conn = await asyncssh.connect(
                HOST, port=PORT, username=self.username, password=self.password,
                known_hosts=asyncssh.import_known_hosts(f"[{HOST}]:{PORT} {HOST_KEY}\n"),
                connect_timeout=60,
            )
        except asyncssh.PermissionDenied as exc:
            raise CatalogUnavailable("SanMar rejected this login. Check the FTP username and password.") from exc
        except asyncssh.HostKeyNotVerifiable as exc:
            logger.error("SanMar's SFTP host key no longer matches the pinned one")
            raise CatalogUnavailable("SanMar's server could not be verified, so the login was not sent. "
                                     "Please contact support.") from exc
        except (OSError, TimeoutError, asyncssh.Error) as exc:
            logger.warning("SanMar SFTP connect failed: %s", exc)
            raise CatalogUnavailable("Couldn't reach SanMar just now. Please try again.") from exc
        return self._conn

    async def _fetch(self, remote: str, ttl: int) -> Path:
        """The file on this server's disk, downloaded again when older than `ttl`.
        A failed download falls back to the copy already here, if any."""
        folder = Path(tempfile.gettempdir()) / "printcopilot-sanmar" / self.account
        folder.mkdir(parents=True, exist_ok=True)
        local = folder / Path(remote).name
        lock = _locks.setdefault(str(local), asyncio.Lock())
        async with lock:
            if local.exists() and time.time() - local.stat().st_mtime < ttl:
                return local
            part = local.with_name(f"{local.name}.{uuid.uuid4().hex[:8]}.part")
            try:
                conn = await self._connection()
                async with conn.start_sftp_client() as sftp:
                    await sftp.get(remote, str(part))
                os.replace(part, local)
            except Exception as exc:
                part.unlink(missing_ok=True)
                if local.exists():
                    logger.warning("SanMar download of %s failed, using the copy from %s: %s",
                                   remote, time.ctime(local.stat().st_mtime), exc)
                    return local
                if isinstance(exc, CatalogUnavailable):
                    raise
                logger.warning("SanMar download of %s failed: %s", remote, exc)
                raise CatalogUnavailable("Couldn't read SanMar's product files just now. Please try again.") from exc
        return local

    async def check_credentials(self) -> dict:
        """Log in and look at the product file: proves the login reaches it."""
        conn = await self._connection()
        try:
            async with conn.start_sftp_client() as sftp:
                attrs = await sftp.stat(PRODUCTS_FILE)
        except Exception as exc:
            logger.warning("SanMar product file not readable: %s", exc)
            raise CatalogUnavailable("Logged in, but SanMar's product files are not in this account. "
                                     "Ask SanMar to turn on the product data download (SanMarPDD).") from exc
        return {"size": attrs.size, "modified": attrs.mtime}

    async def _cached_styles(self, key: str) -> list[dict] | None:
        hit = _memo.get(key)
        if hit and time.monotonic() - hit[0] < 600:
            return hit[1]
        try:
            cached = await redis_get(key)
        except Exception:
            cached = None
        if cached:
            try:
                styles = json.loads(cached)
                _memo[key] = (time.monotonic(), styles)
                return styles
            except ValueError:
                pass
        return None

    async def all_styles(self) -> list[dict]:
        """Every style, trimmed. Memory, then Redis, then SanMar's files: read
        once at a time per account, however many screens ask together."""
        key = STYLES_KEY.format(account=self.account)
        styles = await self._cached_styles(key)
        if styles is not None:
            return styles
        async with _locks.setdefault(key, asyncio.Lock()):
            styles = await self._cached_styles(key)
            if styles is not None:
                return styles
            products = await self._fetch(PRODUCTS_FILE, PRODUCTS_TTL)
            stock = await self._fetch(STOCK_FILE, STOCK_TTL)
            styles = await asyncio.to_thread(build_styles, products, stock)
            if styles:
                try:
                    await redis_set(key, json.dumps(styles), expire=STYLES_TTL)
                except Exception:
                    pass
                _memo[key] = (time.monotonic(), styles)
        return styles

    async def style_stats(self, styles: list[dict]) -> dict[str, dict]:
        """Variant count, sizes and colours per style: read with the style list."""
        return {s["style_id"]: s["stats"] for s in styles if s.get("stats")}

    async def prefetch(self, parts: list[str]) -> None:
        """Read the SKU rows of every style a job is about to work through in one
        pass over each file, rather than one pass per batch of ten."""
        want = {str(p) for p in parts if p} - set(self._rows)
        if not want:
            return
        products = await self._fetch(PRODUCTS_FILE, PRODUCTS_TTL)
        stock = await self._fetch(STOCK_FILE, STOCK_TTL)
        rows = await asyncio.to_thread(sku_rows, products, stock, want)
        for style in want:
            self._rows[style] = []
        for r in rows:
            self._rows[r["styleID"]].append(r)

    async def prefetch_inventory(self, parts: list[str]) -> None:
        want = {str(p) for p in parts if p} - set(self._inventory)
        if not want:
            return
        stock = await self._fetch(STOCK_FILE, STOCK_TTL)
        rows = await asyncio.to_thread(inventory_rows, stock, want)
        for style in want:
            self._inventory[style] = []
        for r in rows:
            self._inventory[r["styleID"]].append(r)

    async def fetch_products_for_parts(self, part_numbers: list[str], fields: str | None = None) -> list[dict]:
        await self.prefetch(part_numbers)
        return [r for p in part_numbers for r in self._rows.get(str(p), [])]

    async def fetch_inventory_for_parts(self, part_numbers: list[str]) -> list[dict]:
        await self.prefetch_inventory(part_numbers)
        return [r for p in part_numbers for r in self._inventory.get(str(p), [])]

    async def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            try:
                await self._conn.wait_closed()
            except Exception:
                pass
            self._conn = None
