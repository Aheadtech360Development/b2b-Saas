---
id: 608
title: T-shirt designer on the shop's products
stage: green
date: 2026-11-06
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner hands over Hassam's t-shirt builder and asks for it as a Shopify-style product customizer, switched on per product from the admin, with no room for mistakes
labels: ["t-shirt-designer", "product-customizer", "products", "storefront", "admin"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - (merge of origin/tshirt-builder 0fe0bc0, Hassam: designer, tshirt_designs tables, PHR)
 - backend/migrations/versions/0076_tshirt_designs.py (renumbered from 0073 at the merge)
 - backend/migrations/versions/0077_product_designer.py
 - backend/app/models/product.py
 - backend/app/services/tshirt_designer.py
 - backend/app/api/v1/admin/tshirt_designer.py
 - backend/app/api/v1/tshirt_designs.py
 - backend/app/api/v1/products.py
 - backend/app/core/features.py
 - backend/app/core/permissions.py
 - backend/app/core/tenant_settings.py
 - backend/app/main.py
 - backend/app/schemas/product.py
 - backend/app/services/product_service.py
 - backend/app/services/theme_product.py
 - backend/tests/test_tshirt_designer.py
 - backend/tests/test_retail_plan.py
 - frontend/src/app/(admin)/admin/tshirt-designer/page.tsx
 - frontend/src/components/admin/products/DesignerCard.tsx
 - frontend/src/components/admin/products/ProductsFrame.tsx
 - frontend/src/components/layout/AdminSidebar.tsx
 - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
 - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
 - frontend/src/components/builder/render.tsx
 - frontend/src/lib/builder/baseCss.ts
 - frontend/src/components/designer/Designer.tsx
 - frontend/src/components/designer/Chrome.tsx
 - frontend/src/components/designer/Steps.tsx
 - frontend/src/components/designer/context.ts
 - frontend/src/components/designer/send.ts
 - frontend/src/components/designer/panels/NamesPanel.tsx
 - frontend/src/components/designer/panels/ProductPanel.tsx
 - frontend/src/lib/designer/catalog.ts
 - frontend/src/lib/designer/pricing.ts
 - frontend/src/lib/designer/types.ts
 - frontend/src/stores/designer.store.ts
 - frontend/src/services/tshirtDesigns.service.ts
 - frontend/src/types/product.types.ts
 - frontend/src/__tests__/tshirt-designer.test.tsx
tests:
 - backend tests/test_tshirt_designer.py (11) + Hassam's test_tshirt_designs.py (9); with features, plans, permissions, builder, gang sheet and other related tests 198 passed; test_builder_schema script 79 passed
 - frontend tshirt-designer.test.tsx (13), Hassam's designer tests (20); with every builder and product page test 358 passed; tsc clean in src
 - local database (printcopilot_local, migrated 0076 + 0077): row security on tshirt_designs; a product put in the designer, a made-to-order one refused, catalogue with colours, sizes and prices, a guest asked for an email, a guest design priced by the server ($234, the browser said $0.01), a size not on sale refused, the shop sees it with the email, prices saved and checked, set-up list, both product pages flagged; all put back (20/20)
 - browser look on the local site, desktop 1440 and phone 390: the product page's Design your own (moved to lead the buy area, above the sizes table, after the first look showed it below the fold), the designer on the shop's own tee in its sizes and prices (2XL +$2.00), admin Products with the checklist, Prices, Designs, the product edit card; no sideways scroll; the local product put back afterwards
 - next build
---

## Prompt

hassam ka kam khatam hochuka ha saiha ab mera kam yaha se start ha saiha koi issue nh ana chayiebasically mei tumhein ek idea dedeta hn amein krna kia ha bascially shopify hamein mukhtalif apps deta ha t shirt options ya prodcut customizers ke to ye bacially wo hi ha saiha mere bhai to iska funcdamental ye ha ke hamein iska option admin sidebar mei dena hoga ya tum dekhlena jesa flow rkhna admin prodcut bnaega saiha bhai aur agar uski prodcut type blank ha aur wo chahata ha ke ispe ake bnde jo hain wo apne designs wagera laga skein ya krskein to ye t shirt customizer ka toggle on krde ya ham ye bhi krskty ke t shirt customizer ke widget mei jake waha add prodcuts hon aur waha jake prodcuts add krein jo hamne products mei bnai huin to uspe customizer lag jae kch bhi jo flow ziada behtar aur pro lagy saiha kro aur mjhy batao proper koi galti ki gunjaish nh ha saiha janeman

(follow-up while it was being built) continue plz

## Response snapshot

Merged Hassam's branch (migration renumbered 0073 → 0076, his local Claude settings left out, fabric installed). Built the customizer the way Shopify apps work, both of the owner's ideas as one setting: Products → T-shirt designer (Products: Add products from the catalog, garment shape and embroidery per product; Prices: per printed side by quantity break, embroidery minimum, names and numbers, starting prices until the shop saves its own; Designs: what customers sent, with pictures, print files, quote and status) and a T-shirt designer card on a stocked product's own page. A switched-on product's page offers Design your own (builder and app product pages; on the app page it leads the buy area, above the sizes table), and the designer draws it in its own colours, sizes and variant prices. The server prices every design itself, refuses what cannot be ordered, and a guest leaves a name and email. In print plans only (not Retail), per the gang sheet rule. Not yet: add to cart and checkout (phase two); designs are quotes the shop answers.

## Outcome

- ✅ Impact: a shop switches the designer on for its own blank products and receives priced designs with print files.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push on the owner's yes; phase two, cart and checkout for designed shirts.
- 🧠 Reflection: the designer never asked a guest for an email, and shop settings are global unless their key is listed: both caught before they shipped.
