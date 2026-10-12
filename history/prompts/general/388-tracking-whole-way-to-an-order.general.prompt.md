---
id: 388
title: Tracking the whole way to an order
stage: general
date: 2026-10-12
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: send every shopping event properly (InitiateCheckout, the gang sheet builder's add to cart and everything else) so the shop's Meta ads have what they need; quick test, then push live
labels: ["tracking", "meta-pixel", "gtm", "ga4", "innterflow", "live-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/tracking.ts
 - frontend/src/components/analytics/TrackingScripts.tsx
 - frontend/src/components/storefront/ThemeProductBuy.tsx
 - frontend/src/components/storefront/GangSheetStudio.tsx
 - frontend/src/components/storefront/UploadBySizeModal.tsx
 - frontend/src/components/storefront/UploadOwnSheetModal.tsx
 - frontend/src/components/storefront/ProductConfigurator.tsx
 - frontend/src/components/storefront/CartView.tsx
 - frontend/src/components/storefront/SectionRenderer.tsx
 - frontend/src/components/storefront/ThemeWrittenPage.tsx
 - frontend/src/components/products/VariantMatrix.tsx
 - frontend/src/components/builder/islands/ContactForm.tsx
 - frontend/src/components/builder/islands/Interactive.tsx
 - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
 - frontend/src/app/(customer)/quick-order/page.tsx
 - frontend/src/app/(customer)/gang-sheets/page.tsx
 - frontend/src/app/(customer)/account/gang-sheets/page.tsx
 - frontend/src/app/(customer)/account/orders/[id]/page.tsx
 - frontend/src/app/(customer)/checkout/address/page.tsx
 - frontend/src/app/(customer)/checkout/review/page.tsx
 - frontend/src/app/(customer)/contact/ContactContent.tsx
 - frontend/src/app/(auth)/create-account/page.tsx
 - frontend/src/app/(auth)/wholesale/register/page.tsx
 - frontend/src/__tests__/tracking-funnel.test.ts (new)
 - frontend/src/__tests__/tracking-ready.test.tsx (new)
 - frontend/src/__tests__/tracking-scripts.test.tsx
tests:
 - read only, live, before — GET /api/v1/storefront/analytics for innterflow: tracking on, Tag Manager GTM-KQ984BCJ and Meta Pixel 1027221219465465 saved and on, custom code boxes empty
 - read only, live, before — a page load as an ordinary Chrome visitor with every hit to facebook.com/tr stopped: home PageView; a product page reached first: PageView only; home then a product by a link: SubscribedButtonClick (Meta's own), PageView; ViewContent never
 - frontend, vitest, on a copy of main with the change — 39 files; failures only api-client's 2, which fail on main as it is; the two gang sheet builder files run again alone after a load timeout: 62 passed
 - frontend, tsc — only the 2 old errors in api-client.test.ts
 - frontend, next build — passed (a first try failed on a routes file the dev server was rewriting beside it; cleared and run alone)
 - browser engine, a local copy of this code on the local API, tools' scripts blocked, queues read — product page first: PageView + ViewContent; guest add: AddToCart; search: Search; signed-in add: AddToCart; cart: view_cart; checkout opened: InitiateCheckout, once across a reload; delivery: add_shipping_info; cash on delivery: AddPaymentInfo, Purchase with eventID = order number; Tag Manager purchase with tax and shipping
 - NOT run — a gang sheet built and added in a browser (unit tests only); a card payment; Meta's Events Manager itself (no access)
---

## Prompt

(2026-10-12, after being told that InitiateCheckout and the gang sheet builder's add to cart were not sent)

Abhi nahi jata: InitiateCheckout (checkout shuru hone ka event) aur gang sheet builder ka add to cart. Chahiye to bata dein, yeh alag chhota kaam hai jo live par jayega. hn ye krdo proper bus tracking wagrra proper work krni chayie bhae each and everything krdo ye plz jani

(after the work was interrupted)

tum kr kia rhy ho jani mjhy sach mei smjh nh arha ha abhi ye tum ku bar bar port change krrhy ho ye jo tracking wala kam ha ye to live pe krna ha mene aur abhi meta id dali mene marketor kehra ha ke koi events hi show nh horhy abhi kch krna nh pehle smjhao mjhyu poora

(after the explanation)

hn chalo krlo ek zara quick test phir tum jaldi se phir krdo push bs meta ads ka issue na ho kuch bhi marketor kuch masla na kre poora ek sath dekhlena saiha

continue plz

aby kia krrhy ho yar continue kro na jani itna time ku kharab krrhy ho yar

## Response snapshot

- Explained the ports: 3000 runs the admin redesign, which must not go live; the tracking fix was made in a separate copy of the live code and tried on port 3001 before pushing.
- On the live shop the pixel was saved and sending PageView; the product view was never sent, add to cart only for one case, InitiateCheckout never.
- The fix: the landing page's product view waits until the tools' scripts are on the page; add to cart from every way into a cart (a test now fails for a screen that adds without reporting); view_cart, remove_from_cart; InitiateCheckout once per cart; add_shipping_info; AddPaymentInfo; purchase with tax, shipping, coupon; gang sheet lines named on every event; Search, CompleteRegistration, Lead.
- Pushed to main on its own; the admin redesign is not in it.

## Outcome

- ✅ Impact: the shop's Meta Pixel, GA4 and Tag Manager get the whole path from product view to purchase.
- 🧪 Tests: as listed.
- 📁 Files: 23 changed, 2 new tests.
- 🔁 Next prompts: the marketer checks Events Manager → Test events; whether GA4 goes in by ID or inside the Tag Manager container.
- 🧠 Reflection: a headless browser names itself HeadlessChrome and Meta's pixel sends nothing for it, so the first outside check read as "no events at all"; with an ordinary user agent PageView showed at once. Checks of this kind need it.

## Evaluation notes (flywheel)

- Failure modes observed: a browser check that pressed buttons before the page was live, and one that read the queue before a dev route compiled; both looked like faults and were not.
- Graders run and results (PASS/FAIL): unit tests PASS (api-client's 2 known failures aside); build PASS; local walk PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after the deploy, the same outside check on the live shop, expecting ViewContent on a product page reached first.
