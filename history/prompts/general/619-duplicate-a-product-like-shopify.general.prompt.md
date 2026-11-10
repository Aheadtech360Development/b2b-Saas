---
id: 619
title: Duplicate a product like Shopify
stage: general
date: 2026-11-10
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks for Shopify's product duplication, wired end to end
labels: ["products", "admin", "catalog"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/product_duplicate.py
 - backend/app/api/v1/admin/products.py
 - backend/tests/test_product_duplicate.py
 - frontend/src/components/admin/products/DuplicateProductModal.tsx
 - frontend/src/services/admin.service.ts
 - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
 - frontend/src/app/(admin)/admin/products/page.tsx
 - frontend/src/__tests__/duplicate-product.test.tsx
tests:
 - backend/tests/test_product_duplicate.py (5 passed)
 - frontend/src/__tests__/duplicate-product.test.tsx (3 passed)
 - local walk dup_walk.py on printcopilot_local (44 checks pass, copies deleted, temporary rows removed)
 - frontend tsc --noEmit clean; next build passed
---

## Prompt

acha ab jaldi se suno blkl saiha ab isme jo kam krna hana mjhy wo ye krna ha ke mere bhai isme na mjhy product duplication ka option dna ha jsee poora shopify mei hota ha full on wired plz meri jan jaldi se kro blkl jaldi se proper end to end wired

(then: chalo jani continue kro bhae)

## Response snapshot

Products → a product → Duplicate (next to Export / Import), and in Products a single ticked product shows Duplicate in the selection bar. The dialog is Shopify's: Title ("Copy of …"), Status (Draft / Active), copy Images (on) and Inventory quantities (off). POST /admin/products/{id}/duplicate copies every product field (column list read from the model, so new columns come along), variants under new SKUs ("-COPY", "-COPY2"), images, flyers, categories, collections (at the end of each), options and choices with their rules, price grid and quantity breaks re-pointed at the copy's own choices, wholesale prices per group (product and variant), and the product's own gang sheet sizes. Left behind: reviews, the supplier link (S&S/SanMar), the accounting link, and stock unless asked (then only the shop's own locations). The copy opens in the editor with "Duplicated. This is the copy: the original is unchanged."

## Outcome

- ✅ Impact: an admin can copy any product kind in one step and edit the copy.
- 🧪 Tests: 5 backend unit tests, 3 frontend tests, a 44-check local DB walk through the real API (stocked, made to order, gang sheet; refusals; real Delete of the copies; originals unchanged).
- 📁 Files: one service, one endpoint, one dialog, two pages, service call, two test files.
- 🔁 Next prompts: the owner's yes to push (with 0be1eaf).
- 🧠 Reflection: a beforeEach that returns a mock is run again by vitest as cleanup; wrap it in braces.
