---
id: "094"
title: Cart images, discounts, reviews system, color fix
stage: green
date: 2026-04-17
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: implement 5 changes
labels: ["cart","reviews","discount","images","color-swatches"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/schemas/cart.py
  - backend/app/services/cart_service.py
  - backend/app/schemas/company.py
  - backend/app/services/company_service.py
  - backend/app/models/product.py
  - backend/app/schemas/review.py
  - backend/app/api/v1/products.py
  - backend/app/api/v1/reviews.py
  - backend/app/middleware/auth_middleware.py
  - backend/app/main.py
  - backend/migrations/product_reviews_table.sql
  - frontend/src/types/order.types.ts
  - frontend/src/app/(customer)/cart/page.tsx
  - frontend/src/app/(admin)/admin/orders/drafts/page.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
  - frontend/src/components/layout/Header.tsx
  - frontend/src/app/(customer)/reviews/page.tsx
tests:
  - " - none"
---

## Prompt

1. Cart page product images missing — fix cart to show product image left of title. Also fix draft order browse products where image space exists but image doesn't render.
2. Draft order company discount not applied — prices in step 2 browse products don't reflect the company's assigned pricing tier discount.
3. Cart strikethrough pricing — discount is applied correctly but not visible. Show original price with strikethrough and discounted price.
4. Logged-out color swatches — clicking a color updates the product image for logged-in users but not logged-out. Fix color swatches to update main image when clicked regardless of auth state.
5. Review system — build full review system: real customer reviews submitted on the website appear in the Reviews tab of each product. Add a Reviews page to the Resources dropdown in the navigation.

## Response snapshot

1. **Cart images**: Added `product_image_url`, `product_slug`, `retail_price` fields to `CartItemOut` schema. Populated in `cart_service._load_cart_items` by querying `ProductImage` for the product's primary image. Frontend cart renders a 72×72px image in the product card header.

2. **Draft order discount**: Refactored `company_service.get_company_detail` to fetch and return `discount_percent` from the company's `PricingTier`. Admin companies API now returns this field. Draft order modal fetches it on company selection and applies `price * (1 - discount/100)` to all prices in step 2 and to line items when added.

3. **Cart strikethrough pricing**: Frontend cart computes `hasDiscount = retailPrice > unitPrice + 0.001` and conditionally renders strikethrough original price + green discounted price.

4. **Logged-out color swatches**: Changed logged-out color `<div>` to `<button>` with `onClick` handler that finds the matching product image by `alt_text` and updates the main displayed image.

5. **Review system**: Created `ProductReview` model, `product_reviews` DB table migration SQL, `ProductReviewCreate`/`ProductReviewOut`/`ReviewsResponse` schemas, `GET /{product_id}/reviews` and `POST /{product_id}/reviews` endpoints, `ReviewsTab` component in `ProductDetailClient.tsx` with star picker + submit form + reviews list, `/reviews` page listing all recent reviews, Resources dropdown updated with real links, and `GET /api/v1/reviews/recent` endpoint in new `reviews.py` router (registered in `main.py`, allowed in auth middleware public paths).

## Outcome

- ✅ Impact: Cart shows product images and strikethrough pricing; draft orders apply company discounts; color swatches work for all users; full review system with submission and listing; reviews page accessible from navigation.
- 🧪 Tests: None added — manual verification required
- 📁 Files: 17 files modified/created across backend and frontend
- 🔁 Next prompts: Run `backend/migrations/product_reviews_table.sql` to create the `product_reviews` table; verify TypeScript compilation
- 🧠 Reflection: `company_service.get_company_detail` needed refactoring to extract `_get_company_orm` since other methods used it as ORM object. Draft order map callback required block-body arrow function syntax fix.

## Evaluation notes (flywheel)

- Failure modes observed: Arrow function implicit→block body syntax mismatch; service method callers broken after return type change
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment: Add Alembic migration for product_reviews instead of raw SQL
