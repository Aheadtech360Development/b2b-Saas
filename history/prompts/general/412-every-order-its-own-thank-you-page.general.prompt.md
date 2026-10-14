---
id: 412
title: Every order its own thank-you page
stage: general
date: 2026-10-14
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: Give each storefront order a thank-you page of its own, like Shopify, and push only that
labels: ["checkout", "thank-you-page", "storefront", "security"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/order_view.py (new)
 - backend/app/api/v1/guest.py
 - backend/app/api/v1/checkout.py
 - backend/app/schemas/order.py
 - backend/tests/test_order_thank_you.py (new)
 - frontend/src/app/(customer)/checkout/thank-you/[number]/page.tsx (new)
 - frontend/src/app/(customer)/checkout/thank-you/[number]/layout.tsx (new)
 - frontend/src/lib/orderThanks.ts (new)
 - frontend/src/app/(customer)/checkout/review/page.tsx
 - frontend/src/app/(customer)/checkout/confirmed/page.tsx
 - frontend/src/app/(customer)/checkout/layout.tsx
 - frontend/src/app/(customer)/account/layout.tsx
 - frontend/src/components/layout/Header.tsx
 - frontend/src/services/orders.service.ts
 - frontend/src/app/globals.css
 - frontend/src/__tests__/checkout-thank-you.test.tsx (new)
tests:
 - backend tests/test_order_thank_you.py (10) with commission, cash on delivery, brand mail, pickup: 40 passed (--noconftest)
 - frontend vitest checkout-thank-you (11), checkout-card-discount, tracking-funnel: 37 passed; whole suite 536 passed, 2 failed in api-client.test.ts (untouched by this change, failing before it)
 - tsc --noEmit clean apart from the known api-client.test.ts errors
 - browser walk on localhost with a real cash-on-delivery order (thankyou_local.cjs): 28/28
 - next build of the live code with the change
---

## Prompt

acha jani isme ek choti si cheez krani ha jb kisi brand ka customer jo ha order place krta to thanku page ya url change nh hota ye ku proper esa hona chayie na jesa shopify wagera mei hota ha ya kisi bhi ecomm site mei plz jani zara dekho isey

Follow-ups in the same request:

hn bs sb fix krdia hana bs ab krdo push krdo sirf ye wala kam

hn done kro fix kro aur push krdo

kia hua bhai rk ku gye

hn to parhai kro na kisne rokaha tumhein

continje plz

## Response snapshot

**The cause.** After an order, the buyer landed on /checkout/confirmed:
- It was one address for every order, drawn only from what that browser tab had kept.
- A new tab sent the buyer to an empty cart.
- The checkout's steps stayed on top.
- Back led into the paid checkout.

**What changed.**
- **Its own page.** The review page now replaces itself with /checkout/thank-you/<number>, which reads the order back from the server. It shows:
  - the thank-you and the order number
  - the lines with pictures
  - the money
  - where the order ships, or where to collect it
  - how it is paid

  It looks like Shopify's, has no steps on top, and on a phone puts the summary first.
- **Who can open it.** Sign-in is kept per tab, and in practice every live order is signed in. So both checkouts answer with a view key:
  - It is an HMAC of the order and the shop, keyed with both secrets like the gang sheet file links. There is no column and no migration.
  - The browser keeps it (last 10, 30 days, forgotten on sign-out) and sends it in an X-Order-Key header.
  - It never goes in the page address, where the shop's tracking tools collect the URL, or in the query string, which the access log keeps.
  - The buyer's own sign-in also opens the page. Anyone else gets the same 404 as a wrong number.
- **Purchase tracking** stays on the review page and is sent once. A reload sends none.
- **Wording.** The page says "placed", not "confirmed", because the shop confirms later. It does not call a bank transfer paid.
- **Old address.** /checkout/confirmed now sends an open tab on to its order.
- **Fallback.** If the order cannot be read back, for example while a release reaches the API, the tab that placed it still gets a thank-you.

**Review.** Reviewers read the code and a review pass checked the change. They found:
- A name clash that would have made the page fail for every pictured product. It was caught before commit.
- The key sitting in the query string.
- Keys surviving sign-out.
- A 500 on a key with unusual characters.
- The card checkout's replay path answering any buyer of the shop.

All were fixed.

**Found, not changed (pre-existing):**
- GET /orders/<number>/invoice-summary is public by number.
- ACH is marked paid at checkout.
- Cash on delivery, ACH and Net 30 orders have no idempotency.
- /account throws a hydration error on a full load.
- A guest's confirmation email has no link.

## Outcome

- ✅ Impact: every order has its own thank-you address. A reload, a new tab and Back all behave as on any shop.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: a "View your order" link in the confirmation email (needs the key in a link, so its own design); the pre-existing faults above, on the owner's word.
- 🧠 Reflection: the readers' facts (signed-in only in practice, sign-in per tab, ACH marked paid, "confirmed" meaning the shop's step) changed the design more than the first look did.

## Evaluation notes (flywheel)

- Failure modes observed:
  - A loop variable shadowed a helper (caught by review before commit).
  - A test's expectation assumed tracking was on locally.
  - The local API from an earlier session kept the old code until it was restarted.
- Graders run and results (PASS/FAIL): backend 40 PASS; frontend 37 PASS; browser walk 28/28 PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): grep for a name reused as a loop target before committing a refactor.
