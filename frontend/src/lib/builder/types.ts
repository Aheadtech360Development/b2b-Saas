/**
 * The shape of a builder site, as the editor holds it and the storefront
 * receives it. Mirrors backend/app/services/builder/schema.py — that module is
 * the authority on what is allowed; these types only describe it.
 *
 * A site is structure and references, never rendered HTML and never product
 * data: an element says "the current product" or "this collection", and the
 * storefront is handed the records separately, read at request time.
 */

export type Breakpoint = "desktop" | "tablet" | "mobile";

/** Style settings for one breakpoint, in the editor's camelCase. */
export type NodeStyle = Partial<Record<
  | "color" | "backgroundColor" | "backgroundImage" | "backgroundSize" | "backgroundPosition"
  | "backgroundRepeat" | "padding" | "paddingTop" | "paddingRight" | "paddingBottom" | "paddingLeft"
  | "margin" | "marginTop" | "marginRight" | "marginBottom" | "marginLeft" | "gap" | "width"
  | "maxWidth" | "minHeight" | "height" | "borderRadius" | "border" | "borderColor" | "borderWidth"
  | "borderStyle" | "boxShadow" | "textAlign" | "fontFamily" | "fontSize" | "fontWeight" | "fontStyle"
  | "lineHeight" | "letterSpacing" | "textTransform" | "textDecoration" | "justifyContent"
  | "alignItems" | "flexDirection" | "flexWrap" | "objectFit" | "aspectRatio" | "opacity" | "overflow"
  | "columns"
  // ── Layout engine: a container's own layout ──
  | "display" | "rowGap" | "columnGap" | "alignContent" | "justifyItems" | "gridAutoFlow"
  // Not CSS one-to-one: turned into grid-template-* by style.ts.
  | "gridColumns" | "gridRows" | "gridAuto" | "gridMin" | "gridTemplate"
  // ── Layout engine: where a child sits in its parent ──
  | "alignSelf" | "justifySelf" | "flexGrow" | "flexShrink" | "flexBasis" | "minWidth" | "order"
  | "gridColumn" | "gridRow" | "gridColumnSpan" | "gridRowSpan",
  string | number
>>;

/** The layout modes a container can be put in; absent means its own default. */
export type LayoutMode = "flex" | "grid";

export interface BuilderNode {
  id: string;
  type: string;
  /** What the merchant called it in the layers list, when they renamed it. */
  name?: string;
  props?: Record<string, unknown>;
  /** Desktop, and the default every other breakpoint starts from. */
  style?: NodeStyle;
  tablet?: NodeStyle;
  mobile?: NodeStyle;
  hide?: Partial<Record<Breakpoint, boolean>>;
  children?: BuilderNode[];
}

export interface FontEntry {
  family: string;
  source: "system" | "google" | "custom";
  weights?: number[];
  styles?: ("normal" | "italic")[];
}

export interface TypeScaleStep {
  desktop: number;
  tablet?: number;
  mobile?: number;
  lineHeight?: number;
  letterSpacing?: number;
  transform?: string;
  weight?: number;
}

export interface SiteSettings {
  colors?: Record<string, string>;
  fonts?: FontEntry[];
  typography?: {
    heading?: { family?: string; weight?: number };
    body?: { family?: string; weight?: number };
    button?: { family?: string; weight?: number };
    scale?: Record<string, TypeScaleStep>;
  };
  layout?: { containerWidth?: number; radius?: number; buttonRadius?: number; sectionSpacing?: number };
}

export type TemplateType = "home" | "page" | "product" | "collection" | "search" | "cart" | "not_found";
export type PartKey = "header" | "footer" | "announcement";

export interface Template { name: string; tree: BuilderNode | null }

export interface SitePage {
  title: string;
  template?: string;
  seo?: { title?: string; description?: string; image?: string };
  tree: BuilderNode | null;
}

export interface SiteDoc {
  schema: number;
  settings: SiteSettings;
  parts: Partial<Record<PartKey, BuilderNode | null>>;
  templates: Partial<Record<TemplateType, Record<string, Template>>>;
  pages: Record<string, SitePage>;
  assignments: {
    product?: { default?: string; byId?: Record<string, string> };
    collection?: { default?: string; byId?: Record<string, string> };
    page?: { default?: string };
  };
  globals: Record<string, { name: string; tree: BuilderNode | null }>;
  saved: Record<string, { name: string; tree: BuilderNode | null }>;
}

/** A product card, as the store's own product helpers describe one. */
export interface ProductCard { title: string; url: string; image: string; price: string; badge: string; text: string }
export interface CollectionCard { title: string; url: string; image: string; text?: string; count?: string }

export interface MenuItem { label: string; href: string; children?: MenuItem[] }

/** One approved review of the product being viewed. */
export interface ReviewItem {
  rating: number; title: string; body: string; name: string; company: string;
  verified: boolean; image: string; reply: string; date: string;
}

/** What the storefront (or the editor's preview) is handed for one page. */
export interface SitePayload {
  mode: "visual_builder";
  version: number | null;
  route: string;
  templateType: TemplateType;
  templateId: string;
  notFound: boolean;
  settings: SiteSettings;
  fonts: {
    google: { family: string; weights: number[]; italic: boolean }[];
    custom: { family: string; weight: number; style: string; url: string; format: string }[];
  };
  parts: Partial<Record<PartKey, BuilderNode | null>>;
  template: BuilderNode | null;
  page: { slug: string; title: string; seo: Record<string, string>; tree: BuilderNode | null } | null;
  globals: Record<string, BuilderNode | null>;
  query: string;
  data: {
    product: Record<string, unknown> | null;
    collection: { name: string; slug: string; description: string; image: string } | null;
    collectionPage: { items: ProductCard[]; total: number; page: number; page_size: number; has_more: boolean } | null;
    menus: Record<string, MenuItem[]>;
    grids: Record<string, ProductCard[]>;
    collectionGrids: Record<string, CollectionCard[]>;
    store: { name: string; logo: string };
    /** The product's reviews, on a page that shows its stars or its reviews. */
    reviews?: { total: number; avg: number; items: ReviewItem[] } | null;
  };
}

export type SiteResponse = SitePayload | { mode: "legacy" };

export function isBuilder(r: SiteResponse | null | undefined): r is SitePayload {
  return !!r && r.mode === "visual_builder";
}
