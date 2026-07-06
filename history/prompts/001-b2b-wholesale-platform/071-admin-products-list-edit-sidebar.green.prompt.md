---
id: "071"
title: "Complete Admin Products Section — List, Edit, Sidebar"
stage: green
date: "2026-04-06"
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
command: "build complete admin products section"
labels: ["admin", "products", "catalog", "variants", "sidebar", "migration"]
links:
  spec: "null"
  ticket: "null"
  adr: "null"
  pr: "null"
files:
  - frontend/src/app/(admin)/admin/products/page.tsx
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
  - frontend/src/components/layout/AdminSidebar.tsx
  - frontend/src/types/product.types.ts
  - frontend/src/services/admin.service.ts
  - backend/app/models/product.py
  - backend/app/schemas/product.py
  - backend/app/api/v1/admin/products.py
  - backend/app/services/product_service.py
  - backend/migrations/versions/f6e5d4c3b2a1_add_product_organization_fields.py
tests: []
---

## Prompt

Build complete Admin Products section for AF Apparels.

PART 1: Products List Page — search/filter bar, status filter, vendor/type filters, bulk select toolbar (Set Active/Draft/Archive/Delete/Bulk Edit), products table with image, status badge, inventory count, category, type, vendor; bulk edit modal; pagination.

PART 2: Product Detail/Edit Page — 2-column layout (65/35). Left: title, description, media grid with upload/delete, variants section grouped by color with expand/collapse, inline variant editing (SKU, price, compare price, stock). Right sidebar: status card with save/preview, product organization (type, vendor, category, MOQ, tags), SEO edit/preview with Google-style card, danger zone delete.

PART 3: Backend — add product_type, vendor, tags (PG ARRAY) to products; compare_price to variants; migration; GET /admin/products/{slug}, DELETE /admin/products/{id}, DELETE images/{id}, DELETE variants/{id} endpoints.

PART 4: Sidebar — Products collapsible dropdown (All Products, Collections, Inventory, Purchase Orders).

## Response

### Backend
- `Product` model: added `product_type` (String 100), `vendor` (String 255), `tags` (ARRAY String 100), imported `ARRAY` from `sqlalchemy.dialects.postgresql`
- `ProductVariant` model: added `compare_price` (Numeric 10,2 nullable)
- Migration `f6e5d4c3b2a1_add_product_organization_fields`: adds 4 columns, down_revision = `e1f2a3b4c5d6`; fixed ID collision with existing `a1b2c3d4e5f6_add_order_comments.py`
- `ProductDetail` schema: added `product_type`, `vendor`, `tags` optional fields
- `VariantOut` schema: added `compare_price`
- `ProductCreate`/`ProductUpdate` schemas: accept new fields
- Admin products router: added `GET /export-csv` BEFORE `GET /{slug}` to avoid path param conflict; added `DELETE /{id}`, `DELETE /{id}/images/{img_id}`, `DELETE /{id}/variants/{v_id}`
- `apply_bulk_action`: extended status_map to accept `"active"/"draft"/"archived"` directly (in addition to `"publish"/"unpublish"/"delete"`)

### Frontend
- `ProductDetail` type: added `product_type`, `vendor`, `tags` fields
- `ProductVariant` type: added `compare_price`
- `adminService`: added `getProduct(slug)`, `deleteProduct(id)`, `deleteImage(pid, imgId)`, `deleteVariant(pid, vid)`
- Products list page: full rewrite in AF Apparels inline style system; search, status filter, multi-select, bulk toolbar, table with image thumbnails, status badge, inventory/variant counts; bulk edit modal with status/vendor/type inputs per-product; pagination
- Product edit page: full rewrite; fetches by slug from `/api/v1/admin/products/{slug}`; 2-column grid; grouped variants by color with color swatch; onBlur auto-save for variant fields; image upload/delete grid; tag input (Enter/comma); SEO edit/preview toggle; delete product with confirmation
- AdminSidebar: Products collapsible dropdown matching Orders pattern; `isProductsActive` = pathname starts with `/admin/products` or `/admin/inventory`; auto-opens on navigation

### Build
- 50 pages compiled cleanly (0 TypeScript errors)
- Pre-existing `/checkout/review` dynamic error unrelated
- `/admin/products/[slug]/edit` compiles as `ƒ` (dynamic, correct)
