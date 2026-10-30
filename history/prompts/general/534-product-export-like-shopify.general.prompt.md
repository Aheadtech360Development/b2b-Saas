---
id: 534
title: Product export with every field, laid out like Shopify
stage: general
date: 2026-10-30
surface: agent
model: claude-opus-5-5
feature: none
branch: fix/product-export
user: Aheadtech360Development
command: Screenshot of Products (Import / Export) with the ask that the export carry every field like Shopify's, for option products, apparel and anything else
labels: ["products", "export", "csv", "shopify-format", "live-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/product_export.py (new)
 - backend/app/services/product_service.py (export_to_csv calls it)
 - backend/tests/test_product_export.py (new, 8)
 - history/prompts/general/534-product-export-like-shopify.general.prompt.md
tests:
 - backend test_product_export 8 passed (apparel, images past the variants, made to order with options, gang sheet sizes, untracked, draft, the file, amounts); ruff clean on the new files
 - local DB: the demo shop's file through ProductService.export_to_csv: 29 products, 243 rows, 61 columns, every variant SKU, one first row per handle
---

## Prompt

bhai ab ek aur cheez ai ha dekho ek issue bnkr aya ha ye dekho bs ek bar make sure krlo jb ham koi prodcut export krty hain to usme sb sku wagera sari fields ati han na category sku product weright jis tarah shopify sb deta ha bs ye ek bar make sure krlo options wali prodcut ho ya apparel ya koi aur poora proper zara isko dekho jani kia issue ha har cheez as same shopify jesi export hori ho saiha merir jan

(screenshot: admin Products, Catalog tab, Import / Export / Add product)

## Response snapshot

The issue: Export wrote eight columns (name, slug, moq, status, sku, color, size, price): no description, category, weight, images, stock, cost, compare-at price, tags, SEO, vendor, type, and nothing of a made to order product's options or a gang sheet's sizes. Rebuilt on Shopify's current product CSV (help.shopify.com "Using CSV files to import and export products"): Shopify's columns first, under its names and in its order, then ours. Layout as Shopify's: a row per variant, product fields on the first row, images one per row with extra rows for images past the last variant, "Title / Default Title" for a product with no options. Stocked: Color and Size as Option1/Option2, SKU, price, compare-at, cost, stock (tracked) or continue selling (not tracked), grams (variant's, else the product's), the colour's image as the variant image. Made to order: one row at the base price, every option and value with its price in Options, quantity breaks, price table size. Gang sheets: a row per sheet size with its price. Categories in Shopify's Collection column. Ours after: kind, minimum order, product code, short description, fabric, gender, care, supplier, variant status, colour hex, MSRP, country of origin. UTF-8 with a BOM for Excel. Not changed: Import still takes its own template.

## Outcome

- ✅ Impact: the products file carries every field the product has, in a layout Shopify reads.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push on the owner's yes, then one export on the live site; import of this file (Shopify format) if wanted.
- 🧠 Reflection: an export is only as good as its widest product; check it against every product kind, not the first one.
