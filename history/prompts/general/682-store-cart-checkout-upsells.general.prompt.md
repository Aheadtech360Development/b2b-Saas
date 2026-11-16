---
id: 682
title: Store cart checkout and upsells
stage: general
date: 2026-11-16
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner adds "PrintCoPilot Store Cart and Checkout" (5 screens) and asks for basic cart customisation, a full upsell engine the admin sets up, and order steps that fit the products (no proof step for apparel or yard signs)
labels: ["storefront", "cart", "checkout", "upsells", "thank-you", "admin"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0079_upsell_offers.py (upsell_offers; cart_items/order_items.upsell_offer_id)
 - backend/app/models/upsell.py, models/order.py, models/__init__.py
 - backend/app/services/upsells.py (rules, prices, offers, free-shipping line), services/cart_settings.py
 - backend/app/services/cart_service.py, services/order_service.py (offer prices in cart and order)
 - backend/app/api/v1/cart.py (/cart/upsells, /cart/add-upsell), api/v1/storefront.py (/storefront/upsells, cart settings, branding.cart)
 - backend/app/api/v1/admin/upsells.py, main.py, core/features.py ("upsells"), core/permissions.py, core/tenant_settings.py
 - backend/tests/test_upsells.py
 - frontend/src/components/storefront/CartView.tsx (the design's cart)
 - frontend/src/app/(customer)/checkout/page.tsx (one-page checkout); address, review, payment, details now send to it; layout
 - frontend/src/app/(customer)/checkout/thank-you/[number]/page.tsx, lib/orderSteps.ts
 - frontend/src/app/(admin)/admin/upsells/page.tsx, lib/upsells.ts, MarketingFrame, AdminSidebar
 - frontend/src/app/(admin)/admin/settings/cart/page.tsx, SettingsFrame
 - frontend/src/lib/cartLook.ts, lib/guestCart.ts, components/checkout/StripePaymentForm.tsx, BrandingProvider, types/order.types.ts
 - frontend/src/__tests__: cart-upsells, admin-upsells (new); checkout-card-discount, gift-cards, checkout-thank-you, tshirt-designer-cart (moved to the new pages)
tests:
 - backend: 207 passed (upsells, buyer app, demo booking, leads, app routes, designer checkout, plan gates, permissions, gift cards, COD, review sources)
 - local DB run: offer -> cart shows it -> add at 10% off -> trigger removed, usual price -> order charged the offer price and records the offer (rolled back)
 - vitest: cart, checkout, thank-you, admin upsells and cart settings
 - screenshots (local site, API answers made up in the browser): cart, cart after an offer, checkout and confirmation at 1440 and 390 wide, no sideways scroll; a hydration mismatch on the checkout fixed
---

## Prompt

ye ab file daliha dekho isko na proper read kro saiha aur dusra isme hamein admin ko s ye dena ha ke bs ap basic customization krskty cart mei jese fonts change according to your theme or button lka color aur text change okay aur iske bad  ye jp upsell ha iski poori funcionality bnegi saiha backend mei jaha pe ap set krskty upselling ki logic poori create krna easier for admin to create saiha  aur ye last image mei jese approve your proof arha hana ab yaha pe ye kia arha ha for example ye gang sheet kle hawale se bat hori lekin ab agar dustri prodcuts hain jese apparels yard signs to usme ofc ye nh aega dekhlena accordingly sai cheezein bs chapna nh ha poora dimagh se kam krna ha ok meri jan ???? poora propor

(screenshots: the file in the repo root, the design's upsell card, the design's confirmation with "Approve your proof")

## Response snapshot

Read the design (a bundle of five screens: cart, checkout, order confirmed, cart and checkout on a phone). Asked three questions; the owner chose: the checkout on one page as designed, the confirmation showing only true steps (no approve button, since no buyer proof step exists), and upsells that may carry a discount.

Built: cart upsells (admin creates offers in Marketing, Upsells: product, optional fixed option, headline, price as usual / % off / $ off, shows on any cart, a cart holding chosen products or collections, a cart value range, priority, on/off, with orders and revenue per offer); the server prices an offer line in the cart and on the order only while the offer still applies; ready-made products add in one click, built ones (gang sheet, upload, priced from options) link to their page at the usual price; "unlocks free shipping" and the free-shipping bar only from the buyer's real shipping rules. Settings, Cart and checkout: button colour (theme colour unless chosen), cart and checkout button words, order note on/off; fonts and corners follow the theme. The cart, the one-page checkout and the confirmation follow the design, keeping everything the old pages did (saved addresses, live rates, pickup, tax, codes, gift cards, card, cash on delivery, Net 30 for an approved account, PO number, tracking events, one order per attempt). Left out of the design because it would not be true: the express option, "Email me order updates" (orders always email), the billing-address box, "Proof sent" and "Approve your proof", "Every order ships with tracking", and "Create an account" on the confirmation (a first order already opens an account).

## Outcome

- ✅ Impact: the shop's cart and checkout on the new design, a working upsell engine, and confirmation steps that fit each order.
- 🧪 Tests: see above.
- 📁 Files: see list above.
- 🔁 Next prompts: owner's yes to push (migration 0079 runs on deploy).
- 🧠 Reflection: a page file may export only the page; helpers belong in lib/.
