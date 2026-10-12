---
id: 393
title: Admin redesign Products list, add and editor
stage: general
date: 2026-10-12
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: build the Products list, the Add product page and the product's own page from the screenshots, consistent in layout, following the platform's existing product types
labels: ["admin-redesign", "products", "product-types", "gang-sheets", "local-only"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/product_catalog.py (new)
 - backend/app/api/v1/admin/catalog.py (new)
 - backend/app/main.py
 - backend/app/core/permissions.py
 - backend/tests/test_product_catalog.py (new)
 - frontend/src/lib/productKinds.ts (new)
 - frontend/src/components/admin/products/ProductsFrame.tsx (new)
 - frontend/src/components/admin/GangSheetProductEditor.tsx (new)
 - frontend/src/app/(admin)/admin/products/page.tsx
 - frontend/src/app/(admin)/admin/products/new/page.tsx
 - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
 - frontend/src/components/admin/ProductOptionsBuilder.tsx
 - frontend/src/components/layout/AdminSidebar.tsx
 - frontend/src/app/(admin)/admin/gang-sheets/page.tsx
 - frontend/src/app/(admin)/admin/production/page.tsx
 - frontend/src/app/(admin)/admin/products/collections/page.tsx
 - frontend/src/app/(admin)/admin/products/categories/page.tsx
 - frontend/src/app/(admin)/admin/products/reviews/page.tsx
 - frontend/src/app/(admin)/admin/inventory/page.tsx
 - frontend/src/app/(admin)/admin/purchase-orders/page.tsx
 - frontend/src/app/(admin)/admin/suppliers/page.tsx
 - frontend/src/app/(admin)/admin-shell.css
 - frontend/src/__tests__/product-kinds.test.ts (new)
 - frontend/src/__tests__/product-edit-template-cards.test.tsx
tests:
 - backend, pytest --noconftest — test_product_catalog.py (5 new) with the Production, order and Home tests — 55 passed
 - frontend, vitest — product-kinds.test.ts (3 new), product-edit-template-cards.test.tsx (8; router stand-in now offers the address; the template_id case changes the title first) — 11 passed
 - frontend, tsc — only the 2 old errors in api-client.test.ts
 - browser engine, localhost, demo shop — the list (tabs and counts, Draft tab, Type Gang sheet, Needs attention, search, a status set and set back); added through the steps: a made-to-order product, a gang sheet product (8 standard sizes saved, published) and a stocked item (4 variants, one image); the editor's six tabs, the Save bar's Discard and Save, Publish; Collections, Inventory and Gang sheet setup inside the Products tabs; no sideways scroll at phone width; no page errors
 - NOT run — upload by size and upload your own sheet through the steps; a staff account without the inventory permission; the full website suite and a production build
---

## Prompt

(with four screenshots: "6. Products list", "7. Add product (step 1)", "8. Product editor (Pricing and options)" top and bottom)

acha ab ye product ka page add a product page aur inner page saiha ye proper dekhlo layout design consistensy ka dihan rkhna saiha aur abhi dekhlena hamare platform mei na ye scene ha abhi ke multiple type ke products hain to proper existing abhi wala dekhna usi hisab se bnana saiha jani

## Response snapshot

Committed on the local branch (07e15af), not pushed.

- Five kinds of product, read from the existing fields (no new column): stocked, made to order, gang sheet, upload by size, upload your own sheet.
- The catalog: one server answer with kind, price from, stock and what needs a look; search, Status, Type, Needs attention, status tabs; bulk status, edit and delete. Products and Production are one line each in the sidebar; Products' screens are its tabs.
- Adding a product: Type, Basics, Pricing, Images, Publish; the product is a draft from the basics on, priced by the part its own page uses.
- The editor: six tabs, every old section kept, one Save bar with Discard, no trip back to the list on save; publishing beside it; apparel-only fields for stocked items only.
- One gang sheet pricing editor for every place; "Upload your own sheet" now saves its sheet sizes (it showed area tiers that were never saved).

## Outcome

- ✅ Impact: 8 of the owner's designs are done: Home, Orders list, Order page, Production queue, Print job, Products list, Add product, Product editor.
- 🧪 Tests: as listed, with what was not run.
- 📁 Files: 24, one commit on the local branch.
- 🔁 Next prompts: the owner's yes on the added Categories and Reviews tabs and the Gang sheet setup tab moving under Products; designs for the options builder's own look; the next screens.
- 🧠 Reflection: the type is not a column, and should not become one: pricing_mode and the gang sheet builder already decide how a product sells, so the list and the steps read those.

## Evaluation notes (flywheel)

- Failure modes observed: three sections moved into a JSX branch needed a fragment (caught before anything ran: the composer worked from the committed file and was run again); a hand-typed test PNG was not a real image (the upload's 500 came from it, not from the page).
- Graders run and results (PASS/FAIL): backend 55 PASS; frontend 11 PASS; tsc PASS; local walk PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add an upload by size product through the steps.
