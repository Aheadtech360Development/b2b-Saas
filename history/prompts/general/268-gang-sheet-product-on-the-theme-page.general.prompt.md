---
id: 268
title: Gang sheet product on the theme page
stage: green
date: 2026-09-23
surface: agent
model: claude-opus-5
feature: none
branch: main
user: Aheadtech360Development
command: (direct request)
labels: ["gang-sheets", "theme", "storefront", "pricing"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/theme_product.py
 - backend/app/services/theme_data.py
 - frontend/src/components/storefront/ThemeProductBuy.tsx
 - frontend/src/components/storefront/UploadBySizeModal.tsx
 - frontend/src/components/storefront/GangSheetStudio.tsx
 - frontend/src/app/(customer)/gang-sheets/page.tsx
tests:
 - scratchpad/t_gang_sheet_theme.py (new, 41 checks — page → builder → sheet → cart → order → print job)
 - scratchpad/t_theme_product.py (62 checks, gang-sheet section added)
 - scratchpad/t_theme.py, t_storefront_audit.py, t_filters.py, t_collections.py (regression, all passed)
 - frontend: tsc --noEmit clean, hook scan 0 problems, next build ✓
---

## Prompt

ab jo ye product hana meri jan ispe gang sheet wala template assign kro saiha meri jan jaldi se  saiha meri jan aur poora wire krna iska button wagera jo open gang sheet builder arha hana iske prices wagera yaha sary sheets set up hain ye dekhlena ek bar poora audit  ye original prces aur sizes aein saiha proper aur title aur images saiha janu

(with four screenshots: the Gang Sheets → Products tab showing "Gang Sheet Builder" Enabled / type "Gang Sheet" / 11 sizes; the admin product list row showing 0 variants; the Gang Sheets dashboard; and the Sizes & Prices table — 2 feet $15 through 15 feet $76, all 22" wide.)

## Response snapshot

The layout was already chosen structurally — a product with `gang_sheet_enabled` scores into the design's DTF page, the one whose button says "Open Gang Sheet Builder". What was missing was everything behind it: a gang-sheet product has no variants, so `theme_product.load()` found no prices and no choices, `_fill_price` removed the price line, `_fill_choices` removed both example rows, and the button fell through to `/products/<slug>` — which, under a theme, is the page the shopper was already on.

Backend (`theme_product.py`):
- `load()` reads this product's own `gang_sheet_sizes` (active only, in `sort_order`), each with its price — flat for a fixed size, `price_per_inch × min_length_in` for a custom-length one — and uses the cheapest as `from_price` when there are no variant prices. Also returns `gang_sheet_type`, `gang_sheet_config` and a `builder_href`.
- `_fill_choices()` builds one "Sheet Size" row from those sheets using the design's own `.btn-select-row` markup; the design's print-type toggle and example lengths go with the other examples.
- `_fill_price()` shows the price of the sheet that starts selected rather than "Starting at" a size nobody picked.
- `_build_group()` marks each item with `data-sheet-id` and `data-price`.
- `fill_product_block()` marks the button `data-theme-buy="builder"` and points its href at this product's builder.

Backend (`theme_data.py`): `_cards()` batches a cheapest-sheet lookup so a gang-sheet product's card on the home page and in collections is priced too, instead of showing nothing.

Frontend (`ThemeProductBuy.tsx`): choosing a sheet size repriced the line (× quantity); the button opens `/gang-sheets?product=&size=&qty=` preserving the `?tenant=` fallback. An upload-by-size product opens `UploadBySizeModal` in place — its prop was narrowed to the two fields it actually uses. `/gang-sheets` reads `?qty=` and the studio opens on it.

## Outcome

- ✅ Impact: the design's gang-sheet page now sells the real product — its title, photo, sheet sizes, prices and builder — with nothing left from the wireframe.
- 🧪 Tests: new end-to-end audit (41 checks) covering page → sizes → builder → submitted sheet → cart line → NET 30 order → admin orders → job moved to in_review; plus brand isolation, inactive sizes, and a product with no sizes set up. All neighbouring theme suites re-run green.
- 📁 Files: 2 backend services, 4 frontend files.
- 🔁 Next prompts: the "Upload Artwork & Order" flow the user said they would specify; Stripe card checkout still needs manual verification on the live store.
- 🧠 Reflection: the layout matching was already right; the bug was that every filler assumed a variant matrix. Reading the price from where the brand actually set it (Gang Sheets → Sheet Sizes) removed the whole class of "page says one thing, builder says another".

## Evaluation notes (flywheel)

- Failure modes observed: `/products/<slug>` as a builder destination is a no-op under a theme (caught by reading the route, not by a test); the first audit run failed on fixtures, not product code (wrong route names, NET 30 not enabled, sheet needed a saved layout — all correct behaviour).
- Graders run and results: t_gang_sheet_theme PASS, t_theme_product PASS, t_theme PASS, t_storefront_audit PASS, t_filters PASS, t_collections PASS, tsc PASS, next build PASS.
- Prompt variant: n/a
- Next experiment: the design's "Choose your path" cards and discount ladder still carry `[$X]` placeholders — decide whether those become editable-only or get wired to real figures.
