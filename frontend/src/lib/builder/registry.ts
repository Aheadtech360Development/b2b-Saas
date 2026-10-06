/**
 * Every element a merchant can put on a page: what it is called, where it
 * sits in the Add panel, what a new one looks like, and which settings the
 * right-hand panel shows for it.
 *
 * The types here must be exactly the server's (schema.py COMPONENTS) — a test
 * holds them together — because an element the editor offers and the server
 * refuses is a publish that fails for a reason the merchant cannot see.
 *
 * Settings are described in the merchant's words. Nothing here asks anybody
 * to type a menu id, a binding expression or a CSS font-family: a menu is
 * picked from the brand's menus, "the current product" is simply what a
 * product element shows, and fonts are chosen from a list.
 */
import { newId } from "./tree";
import type { BuilderNode, TemplateType } from "./types";

export type FieldKind =
  | "text" | "textarea" | "number" | "select" | "toggle" | "color" | "url" | "image"
  | "menu" | "products" | "collection" | "collections" | "global" | "items" | "html" | "css" | "richtext";

export interface Field {
  key: string;
  label: string;
  kind: FieldKind;
  help?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  /** For "items": the fields each item has. */
  itemFields?: Field[];
  /** Only shown when another setting has this value. */
  when?: { key: string; is: unknown[] };
}

export type Category = "layout" | "content" | "store" | "commerce" | "advanced";

export interface ComponentDef {
  type: string;
  label: string;
  category: Category;
  /** Lucide icon name. */
  icon: string;
  /** What it shows, in a few words, for the Add panel's tooltip. */
  blurb: string;
  /** The Add panel tile's label, when the name has a word too long for a
   *  tile: the same words with a soft hyphen where it may break. */
  tile?: string;
  container?: boolean;
  /** Templates it has something to show on. Elsewhere the editor says so. */
  context?: TemplateType[];
  fields: Field[];
  /** Which style groups the right-hand panel offers. */
  styles: ("spacing" | "typography" | "background" | "border" | "size" | "layout" | "columns" | "links" | "logosize")[];
  /** Style groups also shown under Content, for an element whose size is the first thing set. */
  inline?: ComponentDef["styles"];
  create: () => BuilderNode;
}

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6].map((l) => ({ value: String(l), label: `Heading ${l}` }));
const ALIGN = ["left", "center", "right"].map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }));

function node(type: string, props: Record<string, unknown> = {}, style: Record<string, unknown> = {},
              children?: BuilderNode[]): BuilderNode {
  const n: BuilderNode = { id: newId(), type, props, style: style as BuilderNode["style"] };
  if (children) n.children = children;
  return n;
}

function columns(count: number): BuilderNode {
  return {
    ...node("row", {}, { columns: count, gap: "32px" }, Array.from({ length: count }, () => node("column", {}, {}, []))),
    mobile: { columns: 1 },
  };
}

const TEXT_STYLES: ComponentDef["styles"] = ["typography", "spacing", "background", "border"];
const BOX_STYLES: ComponentDef["styles"] = ["spacing", "background", "border", "size"];

export const REGISTRY: ComponentDef[] = [
  // ── Layout ─────────────────────────────────────────────────────────────────
  {
    type: "section", label: "Section", category: "layout", icon: "PanelTop", container: true,
    blurb: "A full-width band of the page. Everything sits in one.",
    fields: [
      { key: "width", label: "Content width", kind: "select", options: [
        { value: "contained", label: "Contained (site width)" }, { value: "wide", label: "Wide" },
        { value: "full", label: "Full window width" }] },
      { key: "sticky", label: "Stay at the top while scrolling", kind: "toggle",
        help: "For a header. The section stays visible as the page scrolls." },
    ],
    styles: ["spacing", "background", "typography", "links", "border", "size", "layout"],
    create: () => node("section", { width: "contained" }, { paddingTop: "48px", paddingBottom: "48px" }, []),
  },
  {
    type: "row", label: "Columns", category: "layout", icon: "Columns3", container: true,
    blurb: "Side-by-side columns. Stack on phones by default.",
    fields: [],
    styles: ["columns", "spacing", "layout", "background", "typography", "links"],
    create: () => columns(2),
  },
  {
    type: "column", label: "Column", category: "layout", icon: "RectangleVertical", container: true,
    blurb: "One column of a row.",
    fields: [],
    styles: ["spacing", "background", "typography", "links", "border", "layout"],
    create: () => node("column", {}, {}, []),
  },
  {
    type: "stack", label: "Stack", category: "layout", icon: "Rows3", container: true,
    blurb: "Elements one after another — down, or across.",
    fields: [{ key: "direction", label: "Direction", kind: "select",
               options: [{ value: "column", label: "Down" }, { value: "row", label: "Across" }] }],
    styles: ["spacing", "layout", "background", "typography", "links", "border"],
    create: () => node("stack", { direction: "column" }, { gap: "12px" }, []),
  },
  {
    type: "spacer", label: "Spacer", category: "layout", icon: "MoveVertical",
    blurb: "Empty space, as tall as you like.",
    fields: [{ key: "height", label: "Height (px)", kind: "number", min: 4, max: 400, step: 4 }],
    styles: [],
    create: () => node("spacer", { height: 32 }),
  },
  {
    type: "divider", label: "Divider", category: "layout", icon: "Minus",
    blurb: "A thin line between things.",
    fields: [],
    styles: ["spacing", "border"],
    create: () => node("divider", {}, { marginTop: "16px", marginBottom: "16px" }),
  },

  // ── Content ────────────────────────────────────────────────────────────────
  {
    type: "heading", label: "Heading", category: "content", icon: "Heading",
    blurb: "A title for a section or a page.",
    fields: [
      { key: "text", label: "Text", kind: "textarea" },
      { key: "level", label: "Size", kind: "select", options: HEADING_LEVELS,
        help: "Heading 1 is the page's main title. Use it once per page." },
      { key: "href", label: "Link (optional)", kind: "url" },
    ],
    styles: TEXT_STYLES,
    create: () => node("heading", { text: "A clear headline", level: 2 }),
  },
  {
    type: "text", label: "Text", category: "content", icon: "Type",
    blurb: "A paragraph of plain text.",
    fields: [{ key: "text", label: "Text", kind: "textarea" }],
    styles: TEXT_STYLES,
    create: () => node("text", { text: "Say something your customers want to know." }),
  },
  {
    type: "rich_text", label: "Rich text", category: "content", icon: "SquarePilcrow",
    blurb: "Formatted text — bold, links, lists.",
    fields: [{ key: "html", label: "Text", kind: "richtext" }],
    styles: TEXT_STYLES,
    create: () => node("rich_text", { html: "<p>Write something here. <strong>Bold</strong> and <a href=\"/products\">links</a> work.</p>" }),
  },
  {
    type: "button", label: "Button", category: "content", icon: "RectangleHorizontal",
    blurb: "A link that looks like a button.",
    fields: [
      { key: "text", label: "Label", kind: "text" },
      { key: "href", label: "Goes to", kind: "url" },
      { key: "variant", label: "Style", kind: "select", options: [
        { value: "solid", label: "Solid" }, { value: "outline", label: "Outline" }, { value: "link", label: "Plain link" }] },
      { key: "newTab", label: "Open in a new tab", kind: "toggle" },
    ],
    styles: ["typography", "spacing", "background", "border"],
    create: () => node("button", { text: "Shop now", href: "/products", variant: "solid" }),
  },
  {
    type: "link", label: "Link", category: "content", icon: "Link",
    blurb: "A text link.",
    fields: [
      { key: "text", label: "Text", kind: "text" },
      { key: "href", label: "Goes to", kind: "url" },
      { key: "newTab", label: "Open in a new tab", kind: "toggle" },
    ],
    styles: TEXT_STYLES,
    create: () => node("link", { text: "Learn more", href: "/" }),
  },
  {
    type: "image", label: "Image", category: "content", icon: "Image",
    blurb: "A picture, optionally a link.",
    fields: [
      { key: "src", label: "Image", kind: "image" },
      { key: "alt", label: "Description (for screen readers and search)", kind: "text" },
      { key: "href", label: "Link (optional)", kind: "url" },
      { key: "fit", label: "Fit", kind: "select", options: [
        { value: "cover", label: "Fill the box" }, { value: "contain", label: "Show all of it" }] },
    ],
    styles: ["size", "spacing", "border"],
    create: () => node("image", { src: "", alt: "", fit: "cover" }, { borderRadius: "12px" }),
  },
  {
    type: "video", label: "Video", category: "content", icon: "Video",
    blurb: "A YouTube or Vimeo video.",
    fields: [{ key: "url", label: "Video address", kind: "url", help: "Paste a YouTube or Vimeo link." }],
    styles: ["size", "spacing", "border"],
    create: () => node("video", { url: "" }, { borderRadius: "12px" }),
  },
  {
    type: "icon", label: "Icon", category: "content", icon: "Star",
    blurb: "A small symbol.",
    fields: [
      { key: "name", label: "Icon", kind: "select", options: [
        "Star", "Truck", "ShieldCheck", "Clock", "Heart", "Check", "Phone", "Mail", "MapPin", "Sparkles", "Leaf", "Award",
      ].map((n) => ({ value: n, label: n })) },
      { key: "size", label: "Size (px)", kind: "number", min: 12, max: 120 },
      { key: "href", label: "Link (optional)", kind: "url" },
    ],
    styles: ["typography", "spacing"],
    create: () => node("icon", { name: "Star", size: 28 }),
  },
  {
    type: "faq", label: "FAQ", category: "content", icon: "MessageCircleQuestionMark",
    blurb: "Questions that open to show their answers.",
    fields: [{ key: "items", label: "Questions", kind: "items", itemFields: [
      { key: "q", label: "Question", kind: "text" }, { key: "a", label: "Answer", kind: "textarea" }] }],
    styles: ["typography", "spacing"],
    create: () => node("faq", { items: [
      { q: "How fast do orders ship?", a: "Orders placed before noon ship the same day." },
      { q: "Can I see a proof first?", a: "Yes — we email a proof before anything is printed." },
    ] }),
  },
  {
    type: "tabs", label: "Tabs", category: "content", icon: "PanelsTopLeft",
    blurb: "Content in tabs, one shown at a time.",
    fields: [{ key: "items", label: "Tabs", kind: "items", itemFields: [
      { key: "title", label: "Tab", kind: "text" }, { key: "body", label: "Content", kind: "textarea" }] }],
    styles: ["typography", "spacing"],
    create: () => node("tabs", { items: [{ title: "Details", body: "What it is." }, { title: "Care", body: "How to look after it." }] }),
  },
  {
    type: "testimonials", label: "Testimonials", category: "content", icon: "Quote",
    blurb: "What customers say.",
    fields: [
      { key: "items", label: "Quotes", kind: "items", itemFields: [
        { key: "quote", label: "Quote", kind: "textarea" }, { key: "name", label: "Who said it", kind: "text" }] },
      { key: "columns", label: "Across", kind: "number", min: 1, max: 4 },
    ],
    styles: ["typography", "spacing"],
    create: () => ({ ...node("testimonials", { items: [{ quote: "Exactly what we ordered, on time.", name: "A customer" }], columns: 3 }),
                     mobile: { columns: 1 } }),
  },
  {
    type: "gallery", label: "Gallery", category: "content", icon: "LayoutGrid",
    blurb: "A grid of pictures.",
    fields: [
      { key: "items", label: "Pictures", kind: "items", itemFields: [
        { key: "src", label: "Image", kind: "image" }, { key: "alt", label: "Description", kind: "text" }] },
      { key: "columns", label: "Across", kind: "number", min: 1, max: 6 },
    ],
    styles: ["spacing"],
    create: () => ({ ...node("gallery", { items: [], columns: 3 }), mobile: { columns: 2 } }),
  },
  {
    type: "banner", label: "Banner", category: "content", icon: "GalleryHorizontal",
    blurb: "A headline, a line and a button over a colour or a picture.",
    fields: [
      { key: "heading", label: "Headline", kind: "text" },
      { key: "text", label: "Line under it", kind: "textarea" },
      { key: "button", label: "Button label", kind: "text" },
      { key: "href", label: "Button goes to", kind: "url" },
      { key: "image", label: "Background picture (optional)", kind: "image" },
      { key: "align", label: "Align", kind: "select", options: ALIGN },
    ],
    styles: ["typography", "spacing", "background", "border", "size"],
    create: () => node("banner", { heading: "A promotion worth a look", text: "Tell people what is on.",
                                  button: "Shop now", href: "/products", align: "center" },
                       { backgroundColor: "#14161B", color: "#FFFFFF", paddingTop: "56px", paddingBottom: "56px", borderRadius: "16px" }),
  },
  {
    type: "newsletter", label: "Email signup", category: "content", icon: "MailPlus",
    blurb: "A box for an email address.",
    fields: [
      { key: "placeholder", label: "Placeholder", kind: "text" },
      { key: "button", label: "Button", kind: "text" },
      { key: "success", label: "Thank-you message", kind: "text" },
    ],
    styles: ["spacing"],
    create: () => node("newsletter", { placeholder: "Your email", button: "Subscribe", success: "Thanks — you're on the list." }),
  },

  // ── Store ──────────────────────────────────────────────────────────────────
  {
    type: "logo", label: "Logo", category: "store", icon: "BadgeCheck",
    blurb: "Your logo, linked to the home page.",
    fields: [
      { key: "image", label: "Logo image", kind: "image",
        help: "Pick one from your media library or upload one. Left empty, this shows the logo from your shop's branding." },
      { key: "alt", label: "Described as (for screen readers)", kind: "text" },
      { key: "align", label: "Alignment", kind: "select", options: [
        { value: "", label: "As the layout places it" }, ...ALIGN] },
      { key: "fallback", label: "If there is no logo, show", kind: "select",
        options: [{ value: "name", label: "The shop's name" }, { value: "none", label: "Nothing" }] },
    ],
    styles: ["logosize", "spacing"],
    inline: ["logosize", "spacing"],
    create: () => node("logo", { fallback: "name" }, { height: "40px" }),
  },
  {
    type: "store_name", label: "Shop name", category: "store", icon: "Store",
    blurb: "Your shop's name, as text.",
    fields: [{ key: "level", label: "Size", kind: "select", options: [{ value: "0", label: "Text" }, ...HEADING_LEVELS] }],
    styles: TEXT_STYLES,
    create: () => node("store_name", { level: "0" }),
  },
  {
    type: "menu", label: "Navigation menu", category: "store", icon: "Menu",
    blurb: "One of your menus, with its dropdowns. Becomes a drawer on phones.",
    fields: [
      { key: "title", label: "Title above the links", kind: "text",
        help: "For a footer column: “Shop”, “Help”, “Company”. Leave empty for none." },
      { key: "menuId", label: "Which menu", kind: "menu",
        help: "Choose a menu, edit its links, or make a new one — each footer column can have its own." },
      { key: "layout", label: "Layout", kind: "select", options: [
        { value: "horizontal", label: "Across (with dropdowns)" }, { value: "vertical", label: "Down (a list)" }] },
      { key: "mobile", label: "On phones", kind: "select", options: [
        { value: "drawer", label: "A menu button that opens a drawer" }, { value: "inline", label: "Show it as it is" }],
        when: { key: "layout", is: ["horizontal"] } },
    ],
    styles: ["typography", "links", "spacing", "layout"],
    create: () => node("menu", { menuId: "", layout: "horizontal", mobile: "drawer" }),
  },
  {
    type: "search", label: "Search", category: "store", icon: "Search",
    blurb: "Search your products.",
    fields: [{ key: "style", label: "Look", kind: "select", options: [
      { value: "icon", label: "An icon" }, { value: "field", label: "A search box" }] }],
    styles: ["spacing"],
    create: () => node("search", { style: "field" }),
  },
  {
    type: "cart_link", label: "Cart", category: "store", icon: "ShoppingCart",
    blurb: "A cart icon, with how many items are in it.",
    fields: [{ key: "showCount", label: "Show the number of items", kind: "toggle" }],
    styles: ["typography", "spacing"],
    create: () => node("cart_link", { showCount: true }),
  },
  {
    type: "cart_items", label: "Cart contents", category: "commerce", icon: "ShoppingCart", context: ["cart"],
    blurb: "The shopper's cart — lines, quantities, totals and checkout. The shop's own working cart.",
    fields: [],
    styles: ["spacing"],
    create: () => node("cart_items", {}),
  },
  {
    type: "account_link", label: "Account", category: "store", icon: "CircleUser",
    blurb: "Sign in, or the customer's account once they have.",
    fields: [],
    styles: ["typography", "spacing"],
    create: () => node("account_link", {}),
  },
  {
    type: "breadcrumbs", label: "Breadcrumbs", category: "store", icon: "ChevronsRight",
    blurb: "Home › Collection › Product — where the customer is.",
    fields: [],
    styles: ["typography", "spacing"],
    create: () => node("breadcrumbs", {}),
  },
  {
    type: "announcement_bar", label: "Announcement bar", tile: "Announce\u00ADment bar", category: "store", icon: "Megaphone",
    blurb: "A strip of news across the top.",
    fields: [{ key: "text", label: "Message", kind: "text" }, { key: "href", label: "Link (optional)", kind: "url" }],
    styles: ["typography", "spacing", "background"],
    create: () => node("announcement_bar", { text: "Free shipping on orders over $100" },
                       { backgroundColor: "#14161B", color: "#FFFFFF", textAlign: "center", paddingTop: "10px", paddingBottom: "10px" }),
  },

  // ── Commerce: the product being viewed ───────────────────────────────────
  {
    type: "product_title", label: "Product title", category: "commerce", icon: "Tag", context: ["product"],
    blurb: "The current product's name.",
    fields: [{ key: "level", label: "Size", kind: "select", options: HEADING_LEVELS }],
    styles: TEXT_STYLES,
    create: () => node("product_title", { level: 1 }),
  },
  {
    type: "product_price", label: "Product price", category: "commerce", icon: "BadgeDollarSign", context: ["product"],
    blurb: "The current product's price — it follows the options the customer picks.",
    fields: [],
    styles: TEXT_STYLES,
    create: () => node("product_price", {}, { fontSize: "22px" }),
  },
  {
    type: "product_description", label: "Product description", category: "commerce", icon: "AlignLeft", context: ["product"],
    blurb: "The current product's description.",
    fields: [],
    styles: TEXT_STYLES,
    create: () => node("product_description", {}),
  },
  {
    type: "product_gallery", label: "Product images", category: "commerce", icon: "Images", context: ["product"],
    blurb: "The current product's pictures.",
    fields: [{ key: "layout", label: "Layout", kind: "select", options: [
      { value: "thumbs-below", label: "Main picture, thumbnails below" }, { value: "single", label: "One picture" },
      { value: "grid", label: "All pictures in a grid" }] }],
    styles: ["spacing", "border"],
    create: () => node("product_gallery", { layout: "thumbs-below" }),
  },
  {
    type: "product_buy", label: "Add to cart", category: "commerce", icon: "ShoppingBag", context: ["product"],
    blurb: "Options, quantity, Add to cart and Buy now — for the current product.",
    fields: [
      { key: "showQuantity", label: "Show quantity", kind: "toggle" },
      { key: "showBuyNow", label: "Show Buy now", kind: "toggle" },
      { key: "label", label: "Button label", kind: "text" },
    ],
    styles: ["spacing", "typography"],
    create: () => node("product_buy", { showQuantity: true, showBuyNow: true, label: "Add to cart" }),
  },
  {
    type: "product_rating", label: "Star rating", category: "commerce", icon: "Star", context: ["product"],
    blurb: "The product's average stars and how many reviews it has.",
    fields: [
      { key: "showCount", label: "Show the number of reviews", kind: "toggle" },
      { key: "hideEmpty", label: "Hide until the product has a review", kind: "toggle" },
    ],
    styles: ["typography", "spacing"],
    create: () => node("product_rating", { showCount: true, hideEmpty: true }, { fontSize: "14px" }),
  },
  {
    type: "product_reviews", label: "Reviews", category: "commerce", icon: "MessageSquareText", context: ["product"],
    blurb: "What customers wrote about this product, and a form to write one.",
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      { key: "limit", label: "Reviews shown", kind: "number", min: 1, max: 20 },
      { key: "allowWrite", label: "Let signed-in customers write a review", kind: "toggle" },
    ],
    styles: ["typography", "spacing", "background", "border"],
    create: () => node("product_reviews", { heading: "Customer reviews", limit: 6, allowWrite: true }),
  },

  // ── Commerce: lists ───────────────────────────────────────────────────────
  {
    type: "product_grid", label: "Product grid", category: "commerce", icon: "Grid3x3",
    blurb: "A grid of products — newest, from a collection, or ones you pick.",
    fields: [
      { key: "source", label: "Which products", kind: "select", options: [
        { value: "newest", label: "The newest" }, { value: "collection", label: "From a collection" },
        { value: "manual", label: "Ones I pick" }, { value: "related", label: "Others like the current product" },
        { value: "search", label: "Search results" }] },
      { key: "collectionId", label: "Collection", kind: "collection", when: { key: "source", is: ["collection"] } },
      { key: "productIds", label: "Products", kind: "products", when: { key: "source", is: ["manual"] } },
      { key: "limit", label: "How many", kind: "number", min: 1, max: 48 },
      { key: "columns", label: "Across", kind: "number", min: 1, max: 6 },
    ],
    styles: ["spacing", "columns"],
    create: () => ({ ...node("product_grid", { source: "newest", limit: 8, columns: 4 }), mobile: { columns: 2 } }),
  },
  {
    type: "collection_grid", label: "Collection grid", category: "commerce", icon: "LayoutDashboard",
    blurb: "Your collections, as cards.",
    fields: [
      { key: "collectionIds", label: "Collections (leave empty for all)", kind: "collections" },
      { key: "limit", label: "How many", kind: "number", min: 1, max: 24 },
      { key: "columns", label: "Across", kind: "number", min: 1, max: 6 },
    ],
    styles: ["spacing", "columns"],
    create: () => ({ ...node("collection_grid", { collectionIds: [], limit: 4, columns: 4 }), mobile: { columns: 2 } }),
  },

  // ── Commerce: the collection being viewed ────────────────────────────────
  {
    type: "collection_title", label: "Collection title", category: "commerce", icon: "FolderOpen", context: ["collection"],
    blurb: "The current collection's name.",
    fields: [{ key: "level", label: "Size", kind: "select", options: HEADING_LEVELS }],
    styles: TEXT_STYLES,
    create: () => node("collection_title", { level: 1 }),
  },
  {
    type: "collection_description", label: "Collection description", category: "commerce", icon: "AlignLeft", context: ["collection"],
    blurb: "The current collection's description.",
    fields: [],
    styles: TEXT_STYLES,
    create: () => node("collection_description", {}),
  },
  {
    type: "collection_image", label: "Collection image", category: "commerce", icon: "Image", context: ["collection"],
    blurb: "The current collection's picture.",
    fields: [],
    styles: ["size", "spacing", "border"],
    create: () => node("collection_image", {}, { borderRadius: "16px" }),
  },
  {
    type: "collection_products", label: "Collection products", category: "commerce", icon: "Grid2x2", context: ["collection"],
    blurb: "The current collection's products, 12 at a time, with sorting and Load more.",
    fields: [
      { key: "showSort", label: "Let customers sort", kind: "toggle" },
    ],
    styles: ["spacing"],
    create: () => node("collection_products", { showSort: true }),
  },

  // ── Structure ─────────────────────────────────────────────────────────────
  {
    type: "page_title", label: "Page title", category: "store", icon: "Heading1", context: ["page"],
    blurb: "The title of the page using this template.",
    fields: [{ key: "level", label: "Size", kind: "select", options: HEADING_LEVELS }],
    styles: TEXT_STYLES,
    create: () => node("page_title", { level: 1 }),
  },
  {
    type: "page_content", label: "Page content", category: "store", icon: "FileText", context: ["page"],
    blurb: "Where each page's own content goes, inside this template.",
    fields: [],
    styles: ["spacing"],
    create: () => node("page_content", {}),
  },
  {
    type: "global_ref", label: "Shared section", category: "advanced", icon: "Link2",
    blurb: "A section shared across pages. Edit it once, it changes everywhere.",
    fields: [{ key: "ref", label: "Which shared section", kind: "global" }],
    styles: [],
    create: () => node("global_ref", { ref: "" }),
  },
  {
    type: "html", label: "Custom HTML", category: "advanced", icon: "Code",
    blurb: "Your own markup. Scripts are removed.",
    fields: [
      { key: "html", label: "HTML", kind: "html",
        help: "Scripts, forms, iframes and event handlers are removed before this is shown." },
      { key: "css", label: "CSS for this block only", kind: "css",
        help: "Applies inside this block and nowhere else on the page." },
    ],
    styles: ["spacing"],
    create: () => node("html", { html: "<div class=\"note\"><p>Your HTML here.</p></div>", css: ".note { padding: 16px; }" }),
  },
];

export const BY_TYPE: Record<string, ComponentDef> = Object.fromEntries(REGISTRY.map((c) => [c.type, c]));

export function createNode(type: string): BuilderNode | null {
  return BY_TYPE[type]?.create() ?? null;
}

export function labelOf(node: BuilderNode): string {
  return node.name || BY_TYPE[node.type]?.label || node.type;
}

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: "layout", label: "Layout" },
  { key: "content", label: "Content" },
  { key: "commerce", label: "Products & collections" },
  { key: "store", label: "Shop" },
  { key: "advanced", label: "Advanced" },
];

/**
 * Ready-made pieces for the Add panel and the canvas's + menu.
 *
 * A "section" is a whole band of the page. A "block" is smaller — a boxed
 * note, a checklist, steps — and goes anywhere, including beside a product's
 * title or under its Add to cart. Both are made of ordinary elements, so once
 * placed every word, colour and icon is edited like anything else.
 */
export interface Preset {
  key: string;
  label: string;
  blurb: string;
  kind: "section" | "block";
  /** Templates it is made for; absent means anywhere. */
  context?: TemplateType[];
  create: () => BuilderNode;
}

const BOX = {
  paddingTop: "18px", paddingRight: "20px", paddingBottom: "18px", paddingLeft: "20px",
  backgroundColor: "var(--b-surface,#F7F7F5)", borderWidth: "1px", borderStyle: "solid",
  borderColor: "var(--b-border,#E6E6E6)", borderRadius: "12px",
};

/** Room above a block, so one dropped under a title or a price does not touch it. */
const AIR = "14px";

function named(name: string, n: BuilderNode): BuilderNode {
  return { ...n, name };
}

function line(icon: string, text: string): BuilderNode {
  return node("stack", { direction: "row" }, { gap: "10px", alignItems: "flex-start" }, [
    node("icon", { name: icon, size: 18 }, { color: "var(--b-primary,#14161B)", marginTop: "2px" }),
    node("text", { text }, { fontSize: "15px" }),
  ]);
}

/** One footer column: a title over a menu's links, listed down. */
export function menuColumn(title: string, menuId = ""): BuilderNode {
  return named(`${title} links`, node("menu", { title, menuId, layout: "vertical" }));
}

/**
 * A column of plain text under a title — "Talk to us", with an email address,
 * a phone number and a town. For the last column of a footer, where a menu
 * would be the wrong thing: these are not links to pages.
 */
export function textColumn(title = "Talk to us"): BuilderNode {
  // Sized and spaced to sit level with a menu column beside it: the title on
  // the same line as a menu's title, the first line of text on the same line
  // as a menu's first link.
  return named(title, node("stack", { direction: "column" }, { gap: "10px" }, [
    node("heading", { text: title, level: 4 }, { fontSize: "15.75px", lineHeight: "1.6" }),
    node("rich_text", { html: "<p>hello@yourshop.com</p><p>(000) 000-0000</p><p>City, State</p>" },
      { fontSize: "15px", fontWeight: 500, paddingTop: "6px" }),
  ]));
}

/**
 * A footer column's share of the row. Columns sit side by side while there is
 * room for them at a width worth reading; the ones that no longer fit move to
 * the next line by themselves, last first. Nothing is set per device.
 */
export function asFooterColumn(n: BuilderNode): BuilderNode {
  return { ...n, style: { ...(n.style ?? {}), flexGrow: 1, flexBasis: "160px" } };
}

/**
 * The simple footer: a brand column — logo, tagline, a few words — then a
 * column for each menu, as many as the merchant adds, and a column of text to
 * finish. The brand column is the widest. They are a row that wraps: a tablet
 * shows as many as fit and puts the rest underneath, a phone ends up with the
 * brand on a line of its own and the columns in ones or twos below it.
 */
export function simpleFooter(menus: { title: string; menuId?: string }[] = [{ title: "Shop" }, { title: "Help" }, { title: "Company" }],
                             storeName = ""): BuilderNode {
  return named("Footer", node("section", { width: "contained" },
    { paddingTop: "56px", paddingBottom: "32px", backgroundColor: "#F7F7F5" }, [
      named("Footer columns", node("stack", { direction: "row" },
        { flexWrap: "wrap", gap: "32px", alignItems: "flex-start" }, [
          named("Brand", node("stack", { direction: "column" }, { gap: "10px", flexGrow: 3, flexBasis: "280px" }, [
            node("logo", { fallback: "name" }, { height: "36px" }),
            named("Tagline", node("text", { text: "Printed well, shipped fast." }, { fontWeight: 600, fontSize: "15px" })),
            named("About", node("text", { text: "A sentence or two about your shop — what you make and who for." },
              { color: "var(--b-muted,#5B6170)", fontSize: "14px" })),
          ])),
          ...menus.map((m) => asFooterColumn(menuColumn(m.title, m.menuId ?? ""))),
          asFooterColumn(textColumn()),
        ])),
      node("divider", {}, { marginTop: "36px", marginBottom: "18px" }),
      named("Small print", node("text", { text: `© ${storeName || "Your shop"}. All rights reserved.` },
        { color: "var(--b-muted,#5B6170)", fontSize: "12px" })),
    ]));
}

export const PRESETS: Preset[] = [
  {
    key: "hero", label: "Hero", kind: "section", blurb: "A big headline, a line and two buttons, beside a picture.",
    create: () => node("section", { width: "contained", name: "Hero" }, { paddingTop: "88px", paddingBottom: "88px" }, [
      { ...node("row", {}, { columns: 2, gap: "48px", alignItems: "center" }, [
        node("column", {}, {}, [
          node("heading", { text: "Your best headline", level: 1 }),
          node("text", { text: "One line that says why someone should stay." }, { fontSize: "18px", marginTop: "14px", color: "#5B6170" }),
          node("stack", { direction: "row" }, { gap: "12px", marginTop: "28px" }, [
            node("button", { text: "Shop now", href: "/products", variant: "solid" }),
            node("button", { text: "Learn more", href: "/about", variant: "outline" }),
          ]),
        ]),
        node("column", {}, {}, [node("image", { src: "", fit: "cover", placeholder: true }, { borderRadius: "16px", aspectRatio: "4 / 3" })]),
      ]), mobile: { columns: 1 } },
    ]),
  },
  {
    key: "features", label: "Three features", kind: "section", blurb: "Three reasons to buy, side by side.",
    create: () => node("section", { width: "contained" }, { paddingTop: "64px", paddingBottom: "64px" }, [
      { ...node("row", {}, { columns: 3, gap: "32px" }, ["Fast", "Careful", "Fair"].map((t, i) =>
        node("column", {}, {}, [
          node("icon", { name: ["Truck", "ShieldCheck", "Award"][i], size: 28 }),
          node("heading", { text: `${t} by default`, level: 3 }, { marginTop: "12px" }),
          node("text", { text: "A sentence about why this matters to a customer." }, { marginTop: "8px", color: "#5B6170" }),
        ]))), mobile: { columns: 1 } },
    ]),
  },
  {
    key: "products", label: "Product row", kind: "section", blurb: "A heading and a row of products.",
    create: () => node("section", { width: "contained" }, { paddingTop: "64px", paddingBottom: "64px" }, [
      node("heading", { text: "Best sellers", level: 2 }, { textAlign: "center" }),
      { ...node("product_grid", { source: "newest", limit: 4, columns: 4 }, { marginTop: "28px" }), mobile: { columns: 2 } },
    ]),
  },
  {
    key: "faq", label: "FAQ", kind: "section", blurb: "A heading and common questions.",
    create: () => node("section", { width: "contained" }, { paddingTop: "64px", paddingBottom: "64px", maxWidth: "820px" }, [
      node("heading", { text: "Questions, answered", level: 2 }),
      { ...BY_TYPE.faq!.create(), style: { marginTop: "24px" } },
    ]),
  },
  {
    key: "cta", label: "Call to action", kind: "section", blurb: "A coloured band with one button.",
    create: () => node("section", { width: "contained" }, { paddingTop: "48px", paddingBottom: "48px" }, [BY_TYPE.banner!.create()]),
  },
  {
    key: "product_main", label: "Product details", kind: "section", context: ["product"],
    blurb: "Pictures beside the title, stars, price, options, Add to cart and description.",
    create: () => named("Product", node("section", { width: "contained" }, { paddingTop: "32px", paddingBottom: "48px" }, [
      { ...node("row", {}, { columns: 2, gap: "48px", alignItems: "flex-start" }, [
        node("column", {}, {}, [BY_TYPE.product_gallery!.create()]),
        node("column", {}, { gap: "14px" }, [
          BY_TYPE.product_title!.create(),
          BY_TYPE.product_rating!.create(),
          node("product_price", {}, { fontSize: "22px" }),
          node("product_buy", { showQuantity: true, showBuyNow: true, label: "Add to cart" }, { marginTop: "10px" }),
          node("product_description", {}, { marginTop: "14px" }),
        ]),
      ]), mobile: { columns: 1 } },
    ])),
  },
  {
    key: "product_reviews", label: "Reviews section", kind: "section", context: ["product"],
    blurb: "The product's reviews in a band of their own.",
    create: () => named("Reviews", node("section", { width: "contained" }, { paddingTop: "56px", paddingBottom: "56px" }, [
      BY_TYPE.product_reviews!.create(),
    ])),
  },
  {
    key: "collection_intro", label: "Collection header", kind: "section", context: ["collection"],
    blurb: "The collection's picture beside its name and description.",
    create: () => named("Collection header", node("section", { width: "contained" }, { paddingTop: "40px", paddingBottom: "24px" }, [
      { ...node("row", {}, { columns: 2, gap: "40px", alignItems: "center" }, [
        node("column", {}, {}, [node("collection_image", {}, { borderRadius: "14px" })]),
        node("column", {}, { gap: "12px" }, [
          node("collection_title", { level: 1 }),
          node("collection_description", {}, { color: "#5B6170" }),
        ]),
      ]), mobile: { columns: 1 } },
    ])),
  },

  // ── Blocks: smaller pieces that go anywhere ──
  {
    key: "info_box", label: "Info box", kind: "block",
    blurb: "A boxed heading and a few points — “Why us”, materials, care.",
    create: () => named("Info box", node("stack", { direction: "column" }, { ...BOX, gap: "10px", marginTop: AIR }, [
      node("stack", { direction: "row" }, { gap: "10px", alignItems: "center" }, [
        node("icon", { name: "Sparkles", size: 20 }, { color: "var(--b-primary,#14161B)" }),
        node("heading", { text: "Why customers choose us", level: 3 }, { fontSize: "18px" }),
      ]),
      node("rich_text", { html: "<ul><li>Soft, pre-shrunk fabric that keeps its shape</li><li>Prints bright on light and dark colours</li><li>Made to take DTF transfers cleanly</li></ul>" },
           { fontSize: "15px" }),
    ])),
  },
  {
    key: "notice", label: "Notice", kind: "block",
    blurb: "One line that stands out — shipping or processing times, a heads-up.",
    create: () => named("Notice", node("stack", { direction: "row" },
      { gap: "10px", alignItems: "center", paddingTop: "12px", paddingRight: "16px", paddingBottom: "12px", paddingLeft: "16px",
        backgroundColor: "#FFF8EB", color: "#7A4A00", borderRadius: "10px", marginTop: AIR }, [
      node("icon", { name: "Truck", size: 18 }),
      node("text", { text: "Ships in 2–3 business days. Rush orders ship the next day." }, { fontSize: "14px", fontWeight: 600 }),
    ])),
  },
  {
    key: "checklist", label: "Best for", kind: "block",
    blurb: "A heading and ticked lines: what it is best for, what is included.",
    create: () => named("Best for", node("stack", { direction: "column" }, { gap: "10px", marginTop: AIR }, [
      node("heading", { text: "Best for", level: 3 }, { fontSize: "18px" }),
      line("Check", "Full-colour designs on cotton and blends"),
      line("Check", "Small runs and one-offs, no screens needed"),
      line("Check", "Hats, bags and hard-to-print spots"),
    ])),
  },
  {
    key: "steps", label: "How it works", kind: "block",
    blurb: "Numbered steps side by side that fold onto more rows when space runs out.",
    create: () => named("How it works", node("stack", { direction: "column" }, { gap: "14px", marginTop: AIR }, [
      node("heading", { text: "How it works", level: 3 }, { fontSize: "18px" }),
      named("Steps", node("stack", { direction: "column" }, { display: "grid", gridAuto: "fit", gridMin: "170px", gap: "12px" },
        [["Upload", "Send your artwork — PNG with a transparent background works best."],
         ["We print", "Your transfers are printed and checked within a day."],
         ["Press", "Heat-press at 300°F for 12 seconds, then peel."]].map(([title, text], i) =>
          node("stack", { direction: "column" }, { ...BOX, gap: "6px" }, [
            node("heading", { text: `${i + 1}. ${title}`, level: 4 }, { fontSize: "16px" }),
            node("text", { text }, { fontSize: "14px", color: "#5B6170" }),
          ])))),
    ])),
  },
  {
    key: "menu_column", label: "Menu column", kind: "block",
    blurb: "A title and a list of links from one of your menus — a footer column.",
    create: () => menuColumn("Shop"),
  },
  {
    key: "footer_simple", label: "Footer", kind: "section",
    blurb: "Your logo and a line about the shop, then a column for each menu. Add or remove columns freely.",
    create: () => simpleFooter(),
  },
  {
    key: "trust", label: "Trust badges", kind: "block",
    blurb: "Three small promises in a row — shipping, quality, support.",
    create: () => named("Trust badges", node("stack", { direction: "column" },
      { display: "grid", gridAuto: "fit", gridMin: "140px", gap: "10px", marginTop: AIR },
      [["Truck", "Fast shipping"], ["ShieldCheck", "Quality guaranteed"], ["Heart", "Real people to help"]].map(([icon, text]) =>
        node("stack", { direction: "row" }, { gap: "8px", alignItems: "center" }, [
          node("icon", { name: icon, size: 18 }, { color: "var(--b-primary,#14161B)" }),
          node("text", { text }, { fontSize: "14px", fontWeight: 600 }),
        ])))),
  },
];

/** Whether something made for these templates belongs on this one. */
export function fitsTemplate(context: TemplateType[] | undefined, here: TemplateType | null): boolean {
  return !context?.length || (!!here && context.includes(here));
}
