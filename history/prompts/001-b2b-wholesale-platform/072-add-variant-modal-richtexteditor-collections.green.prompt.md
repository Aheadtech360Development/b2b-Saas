---
name: "072 - Add Variant Modal, RichTextEditor, Collections Card Grid"
description: "Fix Add Variant button, add TipTap rich text editor, rewrite collections as Shopify-style card grid"
type: green
id: "072"
title: "Add Variant Modal, RichTextEditor, Collections Card Grid"
stage: green
date: "2026-04-06"
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: "Fix Add Variant + Build Shopify-style Collections + Rich Text Editor"
labels: ["admin", "products", "variants", "rich-text", "collections", "tiptap"]
links:
  spec: "specs/001-b2b-wholesale-platform/spec.md"
  ticket: null
  adr: null
  pr: null
---

## Prompt

Fix Add Variant + Build Shopify-style Collections + Rich Text Editor for AF Apparels.

**Fix 1 — Add Variant button:**
- Currently navigates away instead of opening a modal
- Need backend POST endpoint for creating variants
- Modal with color, size, SKU, retail price fields

**Fix 2 — Rich Text Editor:**
- Replace description textarea with Shopify-style TipTap rich text editor
- Full toolbar: heading, bold/italic/underline/strike, lists, alignment, link, blockquote, code, undo/redo
- Character count footer

**Fix 3 — Collections page:**
- Replace stub with full Shopify-style card grid
- Live API integration (load/create/edit/delete)
- Create/edit modal with name, slug (URL prefix display), description

## Response

### Fix 1 — Add Variant Modal + Backend Endpoint

**Backend (`backend/app/schemas/product.py`):**
- Added `VariantCreate` schema with sku, color, size, retail_price, compare_price, status fields

**Backend (`backend/app/api/v1/admin/products.py`):**
- Added `POST /{product_id}/variants` endpoint returning `VariantOut`
- Added categories CRUD: `POST /categories`, `PATCH /categories/{id}`, `DELETE /categories/{id}`

**Frontend (`frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx`):**
- Added `showAddVariant`, `newVariant`, `addingVariant` state
- Added `handleAddVariant()` calling `apiClient.post(\`/api/v1/admin/products/${product.id}/variants\`, ...)`
- Fixed "Add Variant" button: `onClick={() => setShowAddVariant(true)}` instead of `router.push`
- Added full Add Variant modal JSX at end of return

### Fix 2 — TipTap Rich Text Editor

**New file (`frontend/src/components/admin/RichTextEditor.tsx`):**
- TipTap editor with StarterKit, Underline, TextAlign, Link, Placeholder extensions
- `immediatelyRender: false` for SSR safety in Next.js
- `useEffect` to sync external value changes
- Toolbar: heading select, B/I/U/S, bullet/ordered lists, left/center/right align, link, blockquote, code, undo/redo
- Character count footer

**`frontend/src/app/globals.css`:**
- Appended `.rich-editor-content .ProseMirror` styles for editor content isolation

**Product edit page:**
- Replaced `<textarea>` with `<RichTextEditor value={...} onChange={...} />`

### Fix 3 — Collections Card Grid

**`frontend/src/app/(admin)/admin/products/collections/page.tsx`:**
- Full rewrite as Shopify-style 3-column card grid
- Loads from `GET /api/v1/products/categories`
- Each card: image placeholder, name, product count, slug, description, active badge, Edit/Delete overlay buttons
- Create/Edit modal: name (auto-generates slug), slug with `/products?category=` prefix display, description textarea
- POST to `/api/v1/admin/products/categories`
- PATCH to `/api/v1/admin/products/categories/{id}`
- DELETE to `/api/v1/admin/products/categories/{id}` with confirmation

## Files Modified

 - backend/app/schemas/product.py
 - backend/app/api/v1/admin/products.py
 - frontend/package.json (tiptap deps added)
 - frontend/package-lock.json
 - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
 - frontend/src/app/(admin)/admin/products/collections/page.tsx
 - frontend/src/app/globals.css
 - frontend/src/components/admin/RichTextEditor.tsx (NEW)

## Tests

 - npm run build — passed with no TypeScript errors

## Outcome

All three fixes implemented and committed (b40c289). Build passes cleanly.
