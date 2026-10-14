---
id: 413
title: Builders sign-in, purchase event, four faults
stage: general
date: 2026-10-14
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: Send the purchase from the thank-you page; bring a guest back to the builder after sign-in; fix the four faults found earlier
labels: ["checkout", "tracking", "gang-sheet-builder", "security", "payments"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builderDraft.ts, frontend/src/lib/safeNext.ts (new)
 - frontend/src/components/storefront/UploadBySizeModal.tsx, UploadOwnSheetModal.tsx, ProductConfigurator.tsx, ThemeProductBuy.tsx
 - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
 - frontend/src/app/(auth)/login/page.tsx, frontend/src/app/(auth)/create-account/page.tsx
 - frontend/src/lib/tracking.ts, frontend/src/app/(customer)/checkout/review/page.tsx, thank-you/[number]/page.tsx and layout.tsx
 - frontend/src/app/(customer)/checkout/invoice/[order_number]/page.tsx and layout.tsx (new)
 - frontend/src/lib/orderThanks.ts, frontend/src/services/orders.service.ts, frontend/src/app/(admin)/admin/orders/[id]/page.tsx
 - backend/app/services/order_attempts.py (new), order_service.py, email_service.py
 - backend/app/api/v1/orders.py, guest.py, checkout.py, backend/app/schemas/order.py
 - tests: frontend sign-in-comes-back, tracking-purchase-thank-you, checkout-thank-you; backend test_order_links_and_attempts
tests:
 - frontend vitest of the touched areas: 52 passed; the whole suite (see the response)
 - backend --noconftest: test_order_links_and_attempts (8), test_order_thank_you, test_brand_mail, test_cash_on_delivery, test_commission, test_pickup_location
 - localhost walks: builder sign-in 21/21, thank-you 28/28, email links 7/7, API faults 11/11
---

## Prompt

bs zabardast hogya ab ye mjhy marketor ne cheez di ha zara dekho isey meri jan

[pasted: the marketer's message, "On the thank-you page (the page after the customer clicks "Confirm order"), please run this code once when the page loads, with the real order details" — window.dataLayer.push({ event: 'purchase', ecommerce: { transaction_id: 'ORDER123', value: 49.99, currency: 'USD' } })]

ye normally yahi events hoty hain wese fire aur ek bhut bara blunder pakra gya ha jo upload image by size ka builder hana waha agar ap as a guest gye to image upload kro to likha ata ha sign in to order jb sign in krty ho ya wo ap bnaty ho na account to wo apko customer dashboard pe lejata ha bhai joke nh hona chayie bs account bnao to wapsi redirect hona chayie na mere bhai plz isey dekho ye poora end to end complete chayie aur jo ye masle tumne point kie hain yar ye bhi fix kro na meri jan

[pasted: the four faults listed in the previous answer]

## Response snapshot

**The marketer's purchase event.**
- trackPurchase already pushes exactly that shape: ecommerce: null first, then event 'purchase' with transaction_id, value, currency USD, tax, shipping, coupon and items. It went from the review page, just before the page changed.
- The review page now holds it. The thank-you page sends it as it opens, once per order, with the server's total, tax and shipping.
- A reload or a second tab sends nothing.

**The builder blunder.** The upload-by-size builder (and the own-sheet uploader and the configurator) sent a guest to /login?next=. Sign-in ignored next, the create-account link hard-coded /account, and the design lived only in the page's memory. Now:
- The builders keep the design for a day.
- They send the guest to /create-account (make an account or sign in) with the way back, ?resume=<builder>.
- The product page opens the builder again, with the design as it was.
- Sign-in follows next (and redirect).
- The way back is only ever a path on this shop. The old check let "/\elsewhere.com" through.

**The four faults.**
- **Invoice summary:** it opens only to the order's view key (X-Order-Key) or to its buyer. Email links carry the key in the #fragment, which a layout script keeps and strips before any tracking loads. Old links ask the buyer to sign in.
- **Guest confirmation email:** it has a "View your order" link.
- **ACH:** an ACH order is unpaid until the shop marks it paid. The admin's order page and the thank-you page say so.
- **Duplicate orders:** one attempt key makes one order, for every way of paying. The key is held in the order_created event's meta under a transaction lock, so there is no migration.

## Outcome

- ✅ Impact: on localhost, a guest who uploads a design and makes an account comes back to the builder with it, orders it, and lands on the thank-you page. The Purchase goes there, once.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: the owner's word to push. After the push, check the Purchase on a live shop with Tag Manager.
- 🧠 Reflection: three of the four faults sat in money paths. Each one needed a real order on localhost, not only a unit test.

## Evaluation notes (flywheel)

- Failure modes observed:
  - The walk scripts first failed on the local shop's own rules: tier-priced shipping for a new account, and a required company. Those are not code faults.
  - On the redesign branch, the cherry-picks met the branch's older tracking.
- Graders run and results (PASS/FAIL): all walks PASS; the unit tests PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
