---
id: 536
title: Brand logos on storefront product cards
stage: general
date: 2026-10-30
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/brand-logos
user: Aheadtech360Development
command: Manager's ClickUp task "Printcopilot - Add feature to show case Supplier Logo on Product Cards" with a reference of cards showing GILDAN / LYFE / AF Apparels logos beside the price
labels: ["storefront", "product-cards", "brands", "ss-activewear", "website-builder"]
links:
  spec: null
  ticket: ClickUp "Printcopilot - Add feature to show case Supplier Logo on Product Cards" (In Build)
  adr: null
  pr: null
files:
 - backend/app/services/brand_logos.py (new: the per-shop brand_logos setting, card brand, S&S remember, admin overview/save, S&S Brands fill)
 - backend/app/core/tenant_settings.py (brand_logos is per shop)
 - backend/app/services/theme_data.py (every builder product card carries brand and brand_logo)
 - backend/app/services/ss_activewear_service.py (fetch_brands: S&S Brands API)
 - backend/app/services/suppliers/ss_products.py (import and sync keep the style's brand logo)
 - backend/app/services/suppliers/ss_catalog.py (as_ss keeps brand_image)
 - backend/app/api/v1/admin/products.py (GET/PUT /brands, POST /brands/from-ss, before /{slug})
 - backend/tests/test_brand_logos.py (new, 9)
 - frontend/src/components/builder/render.tsx (the brand beside the price: logo, or name)
 - frontend/src/lib/builder/baseCss.ts, frontend/src/lib/builder/types.ts
 - frontend/src/app/(admin)/admin/products/brands/page.tsx (new: Products → Brands)
 - frontend/src/components/admin/products/ProductsFrame.tsx (Brands tab), frontend/src/services/admin.service.ts
 - frontend/src/__tests__/brand-logos.test.tsx (new, 6)
 - history/prompts/general/536-brand-logos-on-product-cards.general.prompt.md
tests:
 - backend test_brand_logos 9 passed; ruff clean on the new files
 - frontend brand-logos 6 + builder-search + builder-site + builder-layout-compat passed; tsc 0 source errors
 - through the app on the local demo shop (three products given a vendor for the check, then cleared): brands listed from vendors (Gildan and GILDAN one brand), logo saved as the shop's own, a javascript: logo refused 422, no S&S key 409 with a plain message, signed out 401, builder cards of the brand carry its logo, a hidden brand's cards carry none
---

## Prompt

ye dekho mera manager ye kehra ha ke bhai isme mjhy ye chayie ke mere bhai ye jo suupllier catalog se ssactivewear ke products arhy hain na wo hamein proper uspe brands ka name label chayie plz to isko bhi dekhlo poora end to end

(screenshots: product cards with GILDAN, LYFE and AF Apparels logos beside "As Low As" prices; the manager's ClickUp task "Printcopilot - Add feature to show case Supplier Logo on Product Cards")

## Response snapshot

Every product card on the store (website builder grids, collection pages, search) now shows the product's brand beside the price: its logo, or its name when there is no logo. A product's brand is its Vendor, which S&S imports already fill with the S&S brand. Logos: every S&S style imported or synced keeps its brand's logo (S&S's own image, kept under S&S's brand name), and Products → Brands has "Get logos from S&S" (S&S Brands API) for products imported before. On that tab the shop sees every brand with its products count, adds or changes a logo from the media library (its own brand too), removes one, hides a brand from cards, or turns brands off for the whole store. S&S never writes over a logo the shop chose or removed. Not covered: the old product list page of shops not on the website builder.

## Outcome

- ✅ Impact: S&S products show their brand (Gildan, BELLA + CANVAS…) on every card, as the manager's reference.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push on the owner's yes; on live, Products → Brands → Get logos from S&S once for Innterflow's existing products.
- 🧠 Reflection: keep the logo under the supplier's brand name, not the product's vendor field, so a shop that renames vendors never shows the wrong logo.
