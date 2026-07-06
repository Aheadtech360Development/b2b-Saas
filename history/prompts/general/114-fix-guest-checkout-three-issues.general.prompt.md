---
id: 114
title: Fix Guest Checkout Three Issues
stage: general
date: 2026-04-26
surface: agent
model: claude-sonnet-4-6
feature: guest-checkout
branch: main
user: umeradnan7106
command: manual
labels: ["guest-checkout","payment","cart","header","ux","auth-middleware"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/middleware/auth_middleware.py
  - backend/app/api/v1/checkout.py
  - frontend/src/app/(customer)/cart/page.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
  - frontend/src/components/layout/Header.tsx
tests:
  - none
---

## Prompt

Fix three issues with guest checkout on the AF Apparels platform:

1. GUEST PAYMENT — Authentication required error on checkout review page:
The QB payment form at checkout/payment/page.tsx calls an endpoint that requires authentication. For guests, the payment tokenization must use a public endpoint or skip the auth check. Find where "Authentication required" is thrown for guest users in the payment flow and fix it so guests can tokenize their card and proceed to the review step without being logged in.

2. GUEST CART — Product images not showing:
In cart/page.tsx, guest cart items are built from af_guest_cart in localStorage. These items don't have product_image_url. Fix the guest cart to fetch product images — either by calling the public products API to get image URLs for each product in the cart, or by storing the image URL in af_guest_cart when the item is added in ProductDetailClient.tsx handleAddToCart. The second approach (store image at add-to-cart time) is simpler — store product.images[0] URL in the guest cart entry.

3. CART ICON COUNT — Two fixes needed:
   a. Show exact count instead of 9+ cap — remove or raise the cap so the real number always shows.
   b. Real-time updates without page reload — the cart icon count should update immediately when items are added. For logged-in users, listen to a cart store/event. For guests, listen to localStorage changes or use a custom event dispatched after af_guest_cart is updated in handleAddToCart. The header should re-read the count when this event fires, without requiring a full page reload.

## Response snapshot

**Fix 1 — Guest Payment (2 files):**
- `auth_middleware.py` `_is_public()`: added `path == "/api/v1/checkout/tokenize"` so guests can reach the endpoint without a JWT
- `checkout.py` `tokenize_card`: removed hard `ForbiddenError` when `company_id` is None; added early `return {"token": token}` after tokenization when `company_id` is absent, skipping the QB card-save block which requires a company account

**Fix 2 — Guest Cart Images (2 files):**
- `ProductDetailClient.tsx` `handleAddToCart` guest branch: finds primary image via `product?.images?.find(i => i.is_primary) ?? product?.images?.[0]`; stores `image_url: primaryImg?.url_thumbnail ?? null` in each cart entry written to `af_guest_cart`
- `cart/page.tsx`: extended `GuestCartEntry` type with `image_url?: string | null`; `buildGuestCart` now passes `e.image_url ?? null` to `product_image_url` instead of hardcoded `null`

**Fix 3 — Cart Count (1 file + 1 file):**
- `Header.tsx`: authenticated cart useEffect refactored — extracted `loadCount()` function and added `window.addEventListener("cart_updated", loadCount)` + cleanup; removed `9+` cap — badge now shows exact count
- `ProductDetailClient.tsx`: dispatches `window.dispatchEvent(new Event("cart_updated"))` after successful `cartService.addMatrix()` so the header badge updates immediately without page reload

## Outcome

- ✅ Impact: Guests can now tokenize cards at `/api/v1/checkout/tokenize` without auth; guest cart shows product thumbnails; cart badge shows exact count and updates immediately on add-to-cart for both guests and authenticated users
- 🧪 Tests: None automated; manual verification needed
- 📁 Files: 5 files modified
- 🔁 Next prompts: Verify full guest checkout end-to-end; consider rate-limiting /checkout/tokenize for abuse prevention since it's now public
- 🧠 Reflection: Storing image URL at add-to-cart time is simpler and avoids a second API call at cart render; the custom event pattern (`cart_updated` / `af_guest_cart_updated`) provides live badge updates without polling or shared state

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results: none
- Prompt variant: null
- Next experiment: add rate-limit specifically for /checkout/tokenize (public but expensive)
