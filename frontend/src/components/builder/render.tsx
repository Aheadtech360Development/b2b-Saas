/**
 * Draws a builder tree.
 *
 * One renderer for the storefront and the editor, so what the merchant sees
 * while editing is what a shopper gets. No hooks and no context here: it runs
 * as a server component on the storefront (the HTML arrives finished) and
 * inside the editor's client tree alike. What needs the browser — a menu
 * drawer, the cart count, tabs — is a small island component, server-rendered
 * in its first state.
 *
 * Every element's outermost tag carries data-b, its id. That is what its
 * styles are scoped to (style.ts) and what the editor finds it by.
 *
 * Data never comes from the tree. A product element shows "the product being
 * viewed", which the server read for this request and handed over beside the
 * tree; an element whose data is not there (a deleted menu, a product taken
 * off sale) draws nothing on the storefront, and says why in the editor.
 */
import type { CSSProperties, ReactNode } from "react";
import { knownColor, resolveColor } from "@/lib/colors";
import {
  Award, Check, CircleUser, Clock, Heart, Leaf, Mail, MapPin, Phone, ShieldCheck, Sparkles, Star, Truck,
  type LucideIcon,
} from "lucide-react";
import type { BuilderNode, CollectionCard, MenuItem, ProductCard, SitePayload } from "@/lib/builder/types";
import { cleanHtml, safeHref, safeSrc, scopeCss } from "@/lib/builder/sanitize";
import { layoutMark } from "@/lib/builder/layout";
import MenuNav from "./islands/MenuNav";
import CartLink from "./islands/CartLink";
import CartIsland from "./islands/CartIsland";
import Reviews, { Stars } from "./islands/Reviews";
import { Newsletter, ProductGallery, SortSelect, Tabs } from "./islands/Interactive";
import { ContactForm } from "./islands/ContactForm";
import { SearchBox, SearchIcon } from "./islands/SearchBox";
import { splitDescription } from "@/lib/builder/descSections";

export interface RenderCtx {
  data: SitePayload["data"];
  globals: Record<string, BuilderNode | null>;
  page: { title: string; tree: BuilderNode | null } | null;
  query: string;
  /** The collection sort the shopper chose. */
  sort?: string;
  route: string;
  /** The editor: placeholders for empty things, notes for missing data. */
  edit?: boolean;
  /** Markup in the tree was already cleaned by the server. */
  trusted?: boolean;
  /** Shared sections being drawn, so one that includes itself stops. */
  stack?: string[];
  /** Inside the page's own content, where page_content means nothing. */
  inPage?: boolean;
}

const ICONS: Record<string, LucideIcon> = {
  Star, Truck, ShieldCheck, Clock, Heart, Check, Phone, Mail, MapPin, Sparkles, Leaf, Award,
};

type Props = Record<string, unknown>;

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const level = (v: unknown, fallback = 2) => Math.max(1, Math.min(6, Math.round(num(v, fallback)))) as 1 | 2 | 3 | 4 | 5 | 6;
const money = (v: unknown) => {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? "" : `$${n.toFixed(2)}`;
};

function Heading({ lvl, id, className, children }: { lvl: 1 | 2 | 3 | 4 | 5 | 6; id: string; className: string; children: ReactNode }) {
  const Tag = `h${lvl}` as const;
  return <Tag data-b={id} className={className}>{children}</Tag>;
}

/** A note in the editor, nothing on the storefront. */
function note(ctx: RenderCtx, id: string, text: string): ReactNode {
  return ctx.edit ? <div data-b={id} className="b-note">{text}</div> : null;
}

function html(ctx: RenderCtx, markup: unknown): string {
  const raw = str(markup);
  return ctx.trusted ? raw : cleanHtml(raw);
}

function link(href: unknown, newTab?: unknown) {
  const h = safeHref(href);
  return {
    href: h || "#",
    ...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {}),
  };
}

function children(node: BuilderNode, ctx: RenderCtx): ReactNode {
  const kids = node.children ?? [];
  if (!kids.length) {
    return ctx.edit ? <div className="b-drop" data-drop={node.id}>Drop elements here</div> : null;
  }
  return kids.map((child) => <Node key={child.id} node={child} ctx={ctx} />);
}

function videoEmbed(url: string): string {
  const u = url.trim();
  let m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/.exec(u);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  m = /vimeo\.com\/(?:video\/)?(\d{5,12})/.exec(u);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  return "";
}

function ProductCards({ id, cards, ctx, empty }: { id: string; cards: ProductCard[] | undefined; ctx: RenderCtx; empty: string }) {
  if (!cards) {
    return ctx.edit ? <div data-b={id || undefined} className="b-empty">Loading products…</div> : null;
  }
  if (!cards.length) return ctx.edit ? <div data-b={id || undefined} className="b-empty">{empty}</div> : null;
  return (
    <div data-b={id || undefined} className="b-grid">
      {cards.map((c, i) => (
        <a key={`${c.url}-${i}`} className="b-card" href={safeHref(c.url) || "#"}>
          <div className="b-card-img">
            {safeSrc(c.image) && <img src={c.image} alt={c.title} loading="lazy" />}
            {c.badge && <span className="b-badge">{c.badge}</span>}
          </div>
          <div className="b-card-title">{c.title}</div>
          {c.price && <div className="b-card-meta">{c.price}</div>}
        </a>
      ))}
    </div>
  );
}

/**
 * What a search found, for the shopper: how many, the products, or — in words —
 * that nothing matched. A blank page after a search reads as a broken one.
 */
function SearchResults({ id, cards, ctx }: { id: string; cards: ProductCard[]; ctx: RenderCtx }) {
  const found = ctx.data.search;
  const query = (found?.query ?? ctx.query ?? "").trim();
  if (!query) {
    return <p data-b={id} className="b-search-note" data-search="idle">Type what you are looking for — a product&apos;s name, its code, or a word that describes it.</p>;
  }
  if (!cards.length) {
    return (
      <div data-b={id} className="b-search-note" data-search="none" role="status">
        <b>No products match “{query}”.</b>
        <span>Check the spelling, or try fewer or different words.</span>
        <a href="/products">See all products</a>
      </div>
    );
  }
  const total = Math.max(found?.total ?? cards.length, cards.length);
  return (
    <div data-b={id} data-search="found">
      <p className="b-search-count" role="status">
        {total === 1 ? "1 product" : `${total} products`} for “{query}”{total > cards.length ? ` — showing the first ${cards.length}` : ""}
      </p>
      <ProductCards id="" cards={cards} ctx={ctx} empty="" />
    </div>
  );
}

function CollectionCards({ id, cards, ctx }: { id: string; cards: CollectionCard[] | undefined; ctx: RenderCtx }) {
  if (!cards) return ctx.edit ? <div data-b={id} className="b-empty">Loading collections…</div> : null;
  if (!cards.length) return ctx.edit ? <div data-b={id} className="b-empty">No collections to show yet.</div> : null;
  return (
    <div data-b={id || undefined} className="b-grid">
      {cards.map((c, i) => (
        <a key={`${c.url}-${i}`} className="b-card b-ccard" href={safeHref(c.url) || "#"}>
          <div className="b-card-img">{safeSrc(c.image) && <img src={c.image} alt={c.title} loading="lazy" />}</div>
          <div className="b-card-title">{c.title}</div>
          {c.count && <div className="b-card-meta">{c.count}</div>}
        </a>
      ))}
    </div>
  );
}

interface BuyProduct {
  id: string; name: string; from_price: number | null; pricing_mode: string; gang_sheet: boolean;
  design_upload?: boolean; gang_sheet_type?: string;
  images: { url: string; alt: string }[];
  colours: { label: string; hex: string }[];
  sizes: { label: string }[];
  options: { id: string; name: string; values: { id: string; label: string; hex?: string; default?: boolean }[] }[];
  sheets?: { sheet_id: string; label: string; price: number }[];
  description?: string; summary?: string;
}

/**
 * The buying controls, drawn with the same marks the imported-theme product
 * page carries (variant-group, data-label, data-theme-buy …), so the same
 * code that makes those work — ThemeProductBuy, mounted once on the page —
 * makes these work: one cart, one set of rules for stock and prices.
 */
function BuyBox({ id, p, product }: { id: string; p: Props; product: BuyProduct }) {
  type Choice = { label: string; valueId?: string; sheetId?: string; hex?: string; selected: boolean };
  const groups: { name: string; optionId?: string; swatch: boolean; items: Choice[] }[] = [];
  if (product.gang_sheet && product.sheets?.length) {
    groups.push({ name: "Sheet size", swatch: false,
      items: product.sheets.map((s, i) => ({ label: s.label, sheetId: s.sheet_id, selected: i === 0 })) });
  } else if (product.pricing_mode === "configurable" || product.options?.length) {
    for (const o of product.options ?? []) {
      const hasDefault = o.values.some((v) => v.default);
      groups.push({
        name: o.name, optionId: o.id, swatch: o.values.some((v) => v.hex),
        // In a question answered with swatches, a choice left without a colour is drawn from its name.
        items: o.values.map((v, i) => ({ label: v.label, valueId: v.id,
          hex: v.hex || (o.values.some((x) => x.hex) ? knownColor(v.label) ?? undefined : undefined),
          selected: hasDefault ? !!v.default : i === 0 })),
      });
    }
  } else {
    if (product.colours?.length) {
      // A colour with no hex of its own — or the grey once saved as a stand-in — is drawn from its name.
      const colours = product.colours.map((c) => ({ label: c.label, hex: resolveColor(c.label, c.hex) ?? "" }));
      groups.push({ name: "Color", swatch: colours.some((c) => c.hex),
        items: colours.map((c, i) => ({ label: c.label, hex: c.hex, selected: i === 0 })) });
    }
    if (product.sizes?.length) {
      groups.push({ name: "Size", swatch: false,
        items: product.sizes.map((s, i) => ({ label: s.label, selected: i === 0 })) });
    }
  }

  const gang = product.gang_sheet;
  const artwork = !gang && !!product.design_upload;
  const label = str(p.label) || (gang ? "Start designing" : "Add to cart");
  const showQty = p.showQuantity !== false;

  return (
    <div data-b={id} className="b-buy">
      {groups.map((g) => (
        <div key={g.name} className="variant-group" data-option-id={g.optionId}>
          <label className="vlabel">{g.name}</label>
          <div className="b-choices">
            {g.items.map((c) => (
              <button key={`${c.label}-${c.valueId ?? c.sheetId ?? ""}`} type="button"
                      className={`${g.swatch && c.hex ? "b-swatch" : "b-choice"}${c.selected ? " selected" : ""}`}
                      data-label={c.label} data-value-id={c.valueId} data-sheet-id={c.sheetId}
                      title={g.swatch ? c.label : undefined} aria-label={g.swatch ? c.label : undefined}
                      style={g.swatch && c.hex && /^#[0-9a-f]{3,8}$/i.test(c.hex) ? { background: c.hex } : undefined}>
                {g.swatch && c.hex ? null : c.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="b-buy-row">
        {showQty && (
          <div className="qty-box b-qty" data-theme-qty="1">
            <button type="button" aria-label="One fewer">−</button>
            <input type="number" min={1} defaultValue={1} aria-label="Quantity" inputMode="numeric" />
            <button type="button" aria-label="One more">+</button>
          </div>
        )}
        {artwork ? (
          <button type="button" className="b-btn b-btn-solid" data-theme-buy="artwork">Upload artwork &amp; add to cart</button>
        ) : (
          <button type="button" className="b-btn b-btn-solid" data-theme-buy={gang ? "builder" : "cart"}>{label}</button>
        )}
      </div>
      {!gang && !artwork && p.showBuyNow !== false && (
        <button type="button" className="b-btn b-btn-outline" data-theme-buy="cart" data-then="/cart">Buy it now</button>
      )}
    </div>
  );
}

export function Node({ node, ctx }: { node: BuilderNode; ctx: RenderCtx }): ReactNode {
  const p = (node.props ?? {}) as Props;
  const id = node.id;
  const data = ctx.data;
  const product = data.product as unknown as BuyProduct | null;

  switch (node.type) {
    // ── Layout ──
    case "section": {
      const width = ["contained", "wide", "full"].includes(str(p.width)) ? str(p.width) : "contained";
      return (
        <section data-b={id} className="b-section" data-sticky={p.sticky ? "" : undefined} data-lay={layoutMark(node)}>
          <div className={`b-in b-in-${width}`}>{children(node, ctx)}</div>
        </section>
      );
    }
    case "row":
      return <div data-b={id} className="b-row" data-lay={layoutMark(node)}>{children(node, ctx)}</div>;
    case "column":
      return <div data-b={id} className="b-col" data-lay={layoutMark(node)}>{children(node, ctx)}</div>;
    case "stack":
      return <div data-b={id} className="b-stack" data-dir={p.direction === "row" ? "row" : "column"} data-lay={layoutMark(node)}>{children(node, ctx)}</div>;
    case "spacer":
      return <div data-b={id} className="b-spacer" aria-hidden style={{ height: Math.max(0, Math.min(800, num(p.height, 32))) }} />;
    case "divider":
      return <hr data-b={id} className="b-divider" />;

    // ── Content ──
    case "heading": {
      const text = str(p.text);
      const href = safeHref(p.href);
      return <Heading lvl={level(p.level)} id={id} className="b-heading">{href ? <a href={href}>{text}</a> : text}</Heading>;
    }
    case "text":
      return <p data-b={id} className="b-text">{str(p.text)}</p>;
    case "rich_text":
      return <div data-b={id} className="b-rich" dangerouslySetInnerHTML={{ __html: html(ctx, p.html) }} />;
    case "button": {
      const variant = ["solid", "outline", "link"].includes(str(p.variant)) ? str(p.variant) : "solid";
      return <a data-b={id} className={`b-btn b-btn-${variant}`} {...link(p.href, p.newTab)}>{str(p.text, "Button")}</a>;
    }
    case "link":
      return <a data-b={id} className="b-link" {...link(p.href, p.newTab)}>{str(p.text, "Link")}</a>;
    case "image": {
      const src = safeSrc(p.src);
      if (!src) {
        if (ctx.edit) return <div data-b={id} className="b-empty b-img-ph">Choose an image in the panel on the right.</div>;
        // A starter picture slot nobody has filled yet: a soft panel in the
        // brand's colour, so the layout keeps its shape instead of a hole.
        return p.placeholder ? <div data-b={id} className="b-img-ph" aria-hidden /> : null;
      }
      const fit: CSSProperties = { objectFit: p.fit === "contain" ? "contain" : "cover" };
      const href = safeHref(p.href);
      if (href) {
        return <a data-b={id} className="b-imglink" href={href}><img src={src} alt={str(p.alt)} loading="lazy" style={fit} /></a>;
      }
      return <img data-b={id} className="b-img" src={src} alt={str(p.alt)} loading="lazy" style={fit} />;
    }
    case "video": {
      const embed = videoEmbed(str(p.url));
      if (!embed) return ctx.edit ? <div data-b={id} className="b-empty">Paste a YouTube or Vimeo link in the panel on the right.</div> : null;
      return (
        <div data-b={id} className="b-video">
          <iframe src={embed} title="Video" loading="lazy" allowFullScreen
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                  style={ctx.edit ? { pointerEvents: "none" } : undefined} />
        </div>
      );
    }
    case "icon": {
      const Icon = ICONS[str(p.name)] ?? Star;
      const size = Math.max(12, Math.min(160, num(p.size, 28)));
      const href = safeHref(p.href);
      return href
        ? <a data-b={id} className="b-icon" href={href}><Icon size={size} aria-hidden /></a>
        : <span data-b={id} className="b-icon"><Icon size={size} aria-hidden /></span>;
    }
    case "faq": {
      const items = (Array.isArray(p.items) ? p.items : []) as { q?: string; a?: string }[];
      return (
        <div data-b={id} className="b-faq">
          {items.filter((i) => i && (i.q || i.a)).map((i, n) => (
            <details key={n}><summary>{i.q}</summary><div className="b-faq-a">{i.a}</div></details>
          ))}
          {!items.length && ctx.edit && <div className="b-empty">Add questions in the panel on the right.</div>}
        </div>
      );
    }
    case "tabs":
      return <Tabs id={id} items={(Array.isArray(p.items) ? p.items : []) as { title: string; body: string }[]} />;
    case "testimonials": {
      const items = (Array.isArray(p.items) ? p.items : []) as { quote?: string; name?: string }[];
      return (
        <div data-b={id} className="b-quotes">
          {items.filter((i) => i && i.quote).map((i, n) => (
            <figure key={n} className="b-quote">
              <blockquote>“{i.quote}”</blockquote>
              {i.name && <figcaption>{i.name}</figcaption>}
            </figure>
          ))}
        </div>
      );
    }
    case "gallery": {
      const items = ((Array.isArray(p.items) ? p.items : []) as { src?: string; alt?: string }[]).filter((i) => safeSrc(i?.src));
      if (!items.length) return ctx.edit ? <div data-b={id} className="b-empty">Add pictures in the panel on the right.</div> : null;
      return (
        <div data-b={id} className="b-gallery">
          {items.map((i, n) => <img key={n} src={i.src} alt={str(i.alt)} loading="lazy" />)}
        </div>
      );
    }
    case "banner": {
      const image = safeSrc(p.image);
      const align = ["left", "center", "right"].includes(str(p.align)) ? str(p.align) : "center";
      const href = safeHref(p.href);
      return (
        <div data-b={id} className="b-banner" data-align={align} data-img={image ? "" : undefined}
             style={image ? { backgroundImage: `url("${image}")` } : undefined}>
          {str(p.heading) && <h2>{str(p.heading)}</h2>}
          {str(p.text) && <p>{str(p.text)}</p>}
          {str(p.button) && <a className="b-btn b-btn-solid" href={href || "#"}>{str(p.button)}</a>}
        </div>
      );
    }
    case "newsletter":
      return <Newsletter id={id} placeholder={str(p.placeholder)} button={str(p.button)} success={str(p.success)} edit={ctx.edit} />;
    case "contact_form":
      return <ContactForm id={id} formName={str(p.formName)} fields={p.fields} button={str(p.button)} success={str(p.success)}
                          buttonWidth={str(p.buttonWidth)} edit={ctx.edit}
                          look={{ fieldBorder: p.fieldBorder as string, fieldBg: p.fieldBg as string, fieldRadius: p.fieldRadius as number,
                                  labelColor: p.labelColor as string, buttonBg: p.buttonBg as string, buttonColor: p.buttonColor as string,
                                  buttonRadius: p.buttonRadius as number, focusColor: p.focusColor as string }} />;

    // ── Shop ──
    case "logo": {
      // The picture chosen for this logo, else the shop's own from its branding.
      const logo = safeSrc(p.image) || safeSrc(data.store?.logo);
      // Its size is a style like any other — per device, and never a fixed cap.
      // Width and height land on the link; the picture fills what was set and
      // keeps its shape in the other direction.
      const sized = (key: "width" | "height" | "maxWidth") =>
        [node.style, node.tablet, node.mobile].some((s) => s && s[key] !== undefined && s[key] !== "");
      const w = sized("width");
      const h = sized("height");
      // A logo from before sizes were styles carries a height in pixels: it is
      // kept, with the modest widest size it always had, until a size is set.
      const legacy = !w && !h ? Math.max(16, Math.min(200, num(p.height, 40))) : undefined;
      const align = ["left", "center", "right"].includes(str(p.align)) ? str(p.align) : undefined;
      // The home page unless the shop chose somewhere else for it.
      const to = { ...link(p.href, p.newTab), href: safeHref(p.href) || "/" };
      if (logo) {
        return (
          <a data-b={id} className="b-logo" {...to} data-align={align} data-w={w ? "" : undefined} data-h={h ? "" : undefined}
             data-auto={!w && !sized("maxWidth") ? "" : undefined}>
            <img src={logo} alt={str(p.alt) || data.store?.name || "Home"} style={legacy ? { height: legacy } : undefined} />
          </a>
        );
      }
      if (p.fallback === "none") return note(ctx, id, "No logo yet — choose one in the panel on the right, or upload one under Settings → Branding.");
      return <a data-b={id} className="b-storename" {...to} data-align={align}>{data.store?.name || "Your shop"}</a>;
    }
    case "store_name": {
      const name = data.store?.name || "Your shop";
      const l = Math.round(num(p.level, 0));
      return l >= 1 && l <= 6
        ? <Heading lvl={level(l)} id={id} className="b-heading">{name}</Heading>
        : <span data-b={id} className="b-storename">{name}</span>;
    }
    case "menu": {
      const menuId = str(p.menuId);
      if (!menuId) {
        if (!ctx.edit) return null;
        return (
          <div data-b={id} className="b-menu" data-layout={p.layout === "vertical" ? "vertical" : "horizontal"}>
            {str(p.title).trim() && <div className="b-menu-title">{str(p.title).trim()}</div>}
            <div className="b-note">Choose which menu these links come from, in the panel on the right.</div>
          </div>
        );
      }
      const items = data.menus?.[menuId] as MenuItem[] | undefined;
      if (!items) return note(ctx, id, ctx.edit ? "This menu is loading, or no longer exists. Choose another." : "");
      return (
        <MenuNav id={id} items={items} edit={ctx.edit} title={str(p.title).trim()}
                 layout={p.layout === "vertical" ? "vertical" : "horizontal"}
                 mobile={p.mobile === "inline" ? "inline" : "drawer"}
                 label={str(p.title).trim() || str(p.label) || "Menu"} />
      );
    }
    case "search":
      // Both suggest products while the shopper types; see SearchBox.
      if (p.style === "icon") {
        return <SearchIcon id={id} placeholder={str(p.placeholder) || "Search products"} edit={ctx.edit} />;
      }
      return <SearchBox id={id} query={ctx.query} placeholder={str(p.placeholder) || "Search products"} edit={ctx.edit}
                        autoFocus={!ctx.edit && ctx.route === "search" && !ctx.query} />;
    case "cart_link":
      return <CartLink id={id} showCount={p.showCount !== false} edit={ctx.edit} />;
    case "cart_items":
      return <CartIsland id={id} edit={ctx.edit} />;
    case "account_link":
      return <a data-b={id} className="b-iconlink" href="/account" aria-label="Your account"><CircleUser size={21} aria-hidden /></a>;
    case "breadcrumbs": {
      const trail: { label: string; href?: string }[] = [{ label: "Home", href: "/" }];
      if (data.product) {
        trail.push({ label: "Products", href: "/products" });
        trail.push({ label: str((data.product as Props).name) });
      } else if (data.collection) {
        trail.push({ label: data.collection.name });
      } else if (ctx.page) {
        trail.push({ label: ctx.page.title });
      } else if (ctx.route === "search") {
        trail.push({ label: "Search" });
      }
      return (
        <nav data-b={id} className="b-crumbs" aria-label="Breadcrumb">
          {trail.map((t, i) => (
            <span key={i} style={{ display: "contents" }}>
              {i > 0 && <span aria-hidden>›</span>}
              {t.href && i < trail.length - 1 ? <a href={t.href}>{t.label}</a> : <span aria-current={i === trail.length - 1 ? "page" : undefined}>{t.label}</span>}
            </span>
          ))}
        </nav>
      );
    }
    case "announcement_bar": {
      const href = safeHref(p.href);
      const text = str(p.text);
      if (!text) return note(ctx, id, "Write the announcement in the panel on the right.");
      return href
        ? <a data-b={id} className="b-announce" href={href}>{text}</a>
        : <div data-b={id} className="b-announce">{text}</div>;
    }

    // ── The product being viewed ──
    case "product_title":
      if (!product) return note(ctx, id, "The product's name shows here, on each product's page.");
      return <Heading lvl={level(p.level, 1)} id={id} className="b-heading">{product.name}</Heading>;
    case "product_price":
      if (!product) return note(ctx, id, "The product's price shows here.");
      return <div data-b={id} className="b-price" data-theme-price="1">{money(product.from_price)}</div>;
    case "product_description": {
      if (!product) return note(ctx, id, "The product's description shows here.");
      if (!product.description) return note(ctx, id, "This product has no description yet.");
      const clean = html(ctx, product.description);
      // Long and written with headings: a section for each, opened one at a time.
      const parts = str(p.layout) === "plain" ? null : splitDescription(clean);
      if (!parts) return <div data-b={id} className="b-rich" dangerouslySetInnerHTML={{ __html: clean }} />;
      return (
        <div data-b={id} className="b-desc">
          {parts.intro && <div className="b-rich" dangerouslySetInnerHTML={{ __html: parts.intro }} />}
          <div className="b-desc-acc">
            {parts.sections.map((s, i) => (
              <details key={i} open={(i === 0 && !p.allClosed) || undefined}>
                <summary><span dangerouslySetInnerHTML={{ __html: s.title }} /></summary>
                <div className="b-rich b-desc-body" dangerouslySetInnerHTML={{ __html: s.html }} />
              </details>
            ))}
          </div>
        </div>
      );
    }
    case "product_gallery":
      if (!product) return note(ctx, id, "The product's pictures show here.");
      return <ProductGallery id={id} images={product.images ?? []} layout={str(p.layout, "thumbs-below")} />;
    case "product_buy":
      if (!product) return note(ctx, id, "Options, quantity and Add to cart show here, for each product.");
      return <BuyBox id={id} p={p} product={product} />;
    case "product_rating": {
      if (!product) return note(ctx, id, "The product's stars and review count show here.");
      // In the editor the numbers arrive a moment after the element is placed.
      if (!data.reviews && ctx.edit) return <div data-b={id} className="b-note">Loading this product’s rating…</div>;
      const total = data.reviews?.total ?? 0;
      const avg = data.reviews?.avg ?? 0;
      if (!total) {
        if (p.hideEmpty !== false) return ctx.edit ? <div data-b={id} className="b-note">Stars show here once this product has a review.</div> : null;
        return <div data-b={id} className="b-rating"><Stars value={0} /> <span className="b-rcount">No reviews yet</span></div>;
      }
      return (
        <a data-b={id} className="b-rating" href="#reviews">
          <Stars value={avg} /> <b>{avg.toFixed(1)}</b>
          {p.showCount !== false && <span className="b-rcount">({total} {total === 1 ? "review" : "reviews"})</span>}
        </a>
      );
    }
    case "product_reviews": {
      if (!product) return note(ctx, id, "This product's reviews show here, with a form to write one.");
      const r = data.reviews;
      return <Reviews id={id} productId={String(product.id ?? "")} heading={str(p.heading)} items={r?.items ?? []}
                      total={r?.total ?? 0} avg={r?.avg ?? 0} allowWrite={p.allowWrite !== false} edit={ctx.edit}
                      loading={!!ctx.edit && !r} />;
    }

    // ── Lists ──
    case "product_grid":
      if (p.source === "search" && !ctx.edit) return <SearchResults id={id} cards={data.grids?.[id] ?? []} ctx={ctx} />;
      return <ProductCards id={id} cards={data.grids?.[id]} ctx={ctx}
                           empty={p.source === "search" ? "Search results show here." : "No products match yet."} />;
    case "collection_grid":
      return <CollectionCards id={id} cards={data.collectionGrids?.[id]} ctx={ctx} />;

    // ── The collection being viewed ──
    case "collection_title":
      if (!data.collection) return note(ctx, id, "The collection's name shows here.");
      return <Heading lvl={level(p.level, 1)} id={id} className="b-heading">{data.collection.name}</Heading>;
    case "collection_description":
      if (!data.collection) return note(ctx, id, "The collection's description shows here.");
      if (!data.collection.description) return null;
      return <div data-b={id} className="b-rich" dangerouslySetInnerHTML={{ __html: html(ctx, data.collection.description) }} />;
    case "collection_image":
      if (!data.collection) return note(ctx, id, "The collection's picture shows here.");
      if (!safeSrc(data.collection.image)) return null;
      return <img data-b={id} className="b-cimg" src={data.collection.image} alt={data.collection.name} />;
    case "collection_products": {
      const pageData = data.collectionPage;
      if (!pageData) return note(ctx, id, "The collection's products show here, with sorting and Load more.");
      const sort = ctx.sort === "name" ? "name" : "";
      // All products opened from an old ?category= link: the next page is that category's too.
      const more = new URLSearchParams();
      if (ctx.route === "products" && data.collection?.slug) more.set("category", data.collection.slug);
      more.set("page", String(pageData.page + 1));
      if (sort) more.set("sort", sort);
      return (
        <div data-b={id}>
          {p.showSort !== false && (
            <div className="b-cbar">
              <span>{pageData.total} {pageData.total === 1 ? "product" : "products"}</span>
              <SortSelect value={sort} edit={ctx.edit} />
            </div>
          )}
          <ProductCards id="" cards={pageData.items} ctx={ctx} empty="This collection has no products yet." />
          {pageData.has_more && (
            <div className="b-more">
              <a className="b-btn b-btn-outline" href={`?${more.toString()}`} rel="next">Load more</a>
            </div>
          )}
        </div>
      );
    }

    // ── Structure ──
    case "page_title":
      if (!ctx.page) return note(ctx, id, "The page's title shows here.");
      return <Heading lvl={level(p.level, 1)} id={id} className="b-heading">{ctx.page.title}</Heading>;
    case "page_content": {
      if (ctx.inPage) return null;
      if (!ctx.page) return note(ctx, id, "Each page's own content goes here, inside this template.");
      if (!ctx.page.tree) return note(ctx, id, "This page has no content yet.");
      return <div data-b={id} className="b-page">{<Node node={ctx.page.tree} ctx={{ ...ctx, inPage: true }} />}</div>;
    }
    case "global_ref": {
      const ref = str(p.ref);
      if (!ref) return note(ctx, id, "Choose which shared section to show.");
      const stack = ctx.stack ?? [];
      if (stack.includes(ref) || stack.length > 4) return note(ctx, id, "A shared section cannot include itself.");
      const tree = ctx.globals?.[ref];
      if (!tree) return note(ctx, id, "This shared section no longer exists.");
      return <div data-b={id} className="b-global"><Node node={tree} ctx={{ ...ctx, stack: [...stack, ref] }} /></div>;
    }
    case "html": {
      const css = ctx.trusted ? str(p.css) : scopeCss(str(p.css), `.bsite [data-b="${id}"]`);
      return (
        <div data-b={id} className="b-html">
          {css && <style dangerouslySetInnerHTML={{ __html: css.replace(/<\/?style/gi, "") }} />}
          <div dangerouslySetInnerHTML={{ __html: html(ctx, p.html) }} />
        </div>
      );
    }
    default:
      return note(ctx, id, `“${node.type}” is not something this version of the builder can show.`);
  }
}

/** A whole tree, or nothing. */
export function Tree({ tree, ctx }: { tree: BuilderNode | null | undefined; ctx: RenderCtx }): ReactNode {
  return tree ? <Node node={tree} ctx={ctx} /> : null;
}
