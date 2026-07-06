/** Product category (tree node). */
export interface Category {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  children?: Category[];
}

/** Product image with multiple sizes. */
export interface ProductImage {
  id: string;
  url_thumbnail: string;     // 150px
  url_medium: string;        // 400px
  url_large: string;         // 800px
  url_thumbnail_webp: string | null;
  url_medium_webp: string | null;
  url_large_webp: string | null;
  alt_text: string | null;
  is_primary: boolean;
  position: number;
}

/** Product variant (SKU, color, size). */
export interface ProductVariant {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  retail_price: string;
  compare_price: string | null;
  msrp: string | null; // kept for guest pricing; hidden from admin UI
  cost_per_item: string | null;
  country_of_origin: string | null;
  weight_grams: number | null;
  effective_price: string | null;
  status: "active" | "discontinued" | "out_of_stock";
  stock_quantity: number;
}

/** Product list item (card view) — matches backend ProductListItem schema. */
export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  status: "draft" | "active" | "archived";
  moq: number;
  primary_image: ProductImage | null;
  variants: ProductVariant[];
  categories: Pick<Category, "id" | "name" | "slug">[];
  fabric?: string | null;
  product_code?: string | null;
  weight?: string | null;
}

/** Full product detail — matches backend ProductDetail schema. */
export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  moq: number;
  images: ProductImage[];
  variants: ProductVariant[];
  categories: Pick<Category, "id" | "name" | "slug">[];
  assets?: ProductAsset[];
  meta_title: string | null;
  meta_description: string | null;
  product_type: string | null;
  vendor: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  fabric?: string | null;
  product_code?: string | null;
  weight?: string | null;
  highlight_text?: string | null;
  review_count?: number;
  avg_rating?: number;
}

/** Product asset (flyer, spec sheet). */
export interface ProductAsset {
  id: string;
  asset_type: "flyer" | "spec_sheet" | "size_chart" | "other";
  url: string;
  file_name: string;
}

/** Filters for product listing. */
export interface ProductFilters {
  q?: string;
  category?: string;
  size?: string;
  color?: string;
  price_min?: number;
  price_max?: number;
  page?: number;
  page_size?: number;
}
