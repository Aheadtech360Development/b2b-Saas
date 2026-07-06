---
id: 111
title: Retail MSRP Field and Guest Shopping
stage: general
date: 2026-04-24
surface: agent
model: claude-sonnet-4-6
feature: retail-msrp-guest-shopping
branch: main
user: umeradnan7106
command: manual
labels: ["msrp","retail-price","guest-cart","pricing","admin-products","variants"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/product.py
  - backend/app/schemas/product.py
  - backend/app/services/product_service.py
  - backend/app/api/v1/products.py
  - backend/app/api/v1/admin/products.py
  - backend/migrations/versions/n7o8p9q0r1s2_add_msrp_to_variants.py
  - frontend/src/types/product.types.ts
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
  - frontend/src/app/(admin)/admin/products/new/page.tsx
tests:
  - none
---

## Prompt

Currently the product page shows a 'Wholesale Pricing Locked' block for logged-out users and hides all pricing. We need to add a retail price to products (separate from wholesale price) and show it to guests. Changes needed:
1. Add a retail_price field to the product/variant model and admin product form so retail price can be set per variant alongside the existing wholesale price.
2. Logged-out users should see the full product page with retail pricing and be able to add to cart and checkout without logging in — same experience as a logged-in wholesale user but with retail prices.
3. The 'Wholesale Pricing Locked' black box should stay on the product page for logged-out users as an informational banner only, but should not block the product or the retail price.
4. Logged-in approved wholesale customers see wholesale price. Everyone else (guests and retail customers) sees retail price.

## Response snapshot

Added `msrp` (Numeric 10,2, nullable) field to product variants throughout the stack:

**Backend:**
- Migration `n7o8p9q0r1s2` adds `msrp` column to `product_variants`
- `ProductVariant` model: `msrp: Mapped[float | None]`
- `VariantOut` / `VariantCreate` schemas: `msrp: Decimal | None = None`
- `update_variant` admin endpoint: `"msrp"` added to `numeric_float` set
- `_variant_to_dict`: returns `msrp` field
- `_attach_pricing_and_stock`: added `is_guest` param — guests receive `effective_price = msrp` (fallback to `retail_price`)
- `list_with_filters_and_search` / `get_by_slug_with_variants`: propagate `is_guest` flag, update cache keys
- `products.py` API: set `is_guest = company_id is None`, pass to service

**Frontend:**
- `product.types.ts`: `msrp: string | null` on `ProductVariant`
- `ProductDetailClient.tsx`: replaced wholesale-locked black box with pricing block + slim upsell banner for guests; removed auth gate from color/size UI; added guest localStorage cart (`af_guest_cart`); per-variant prices use `effective_price`; login hint shown after Add to Cart for guests
- `admin/products/[slug]/edit/page.tsx`: MSRP column added to variants table header and each row; MSRP field added to bulk apply panel; `bulkApply` state and both apply functions updated
- `admin/products/new/page.tsx`: `msrp: string` in `VariantRow` interface; MSRP column and input added; `msrp` passed in POST payload when set

## Outcome

- ✅ Impact: Guests now see retail (MSRP) pricing and can interact with the full product page; admins can set MSRP per variant in both create and edit flows; wholesale customers continue to see tier-discounted wholesale prices
- 🧪 Tests: No automated tests added; manual verification needed after running migration
- 📁 Files: 10 files modified/created across backend and frontend
- 🔁 Next prompts: Run `alembic upgrade head` to apply migration; consider adding MSRP display to product list cards; consider guest checkout flow if full retail checkout is desired
- 🧠 Reflection: Priority chain for effective_price: guest-msrp > DG absolute override > DG discount_percent > flat tier discount

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: add MSRP column to admin product list table for quick visibility
