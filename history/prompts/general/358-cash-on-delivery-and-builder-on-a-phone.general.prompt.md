---
id: 358
title: Cash on delivery and builder on a phone
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: add cash on delivery so a full test order can be placed; and make the gang sheet builder usable on a phone, where the admin says it looks terrible
labels: ["checkout", "cash-on-delivery", "gang-sheet-builder", "mobile", "responsive"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/checkout.py, guest.py (cash on delivery in both checkouts; the shop's switch asked on the server), services/order_service.py (such an order comes in unpaid), core/tenant_settings.py + api/v1/admin/settings.py (the switch is each shop's own)
 - backend/tests/test_cash_on_delivery.py (new, 5 checks)
 - frontend/src/app/(customer)/checkout/review/page.tsx (the choice of how to pay), checkout/confirmed/page.tsx, stores/checkout.store.ts
 - frontend/src/components/admin/CashOnDeliveryPanel.tsx (new) on admin/billing/page.tsx; admin/orders/[id]/page.tsx (says what to collect)
 - frontend/src/components/storefront/GangSheetStudio.tsx (the phone layout)
tests:
 - cash on delivery — backend tests 9 passed with the commission tests, no database; tsc clean; live after the push — the shop's payment options now answer with "cod" (false until the shop turns it on)
 - the builder — looked at in a real browser at 390x844, 360x700, 820x1180 and 1366x768 (the website alone, its API answered by the script) — nothing wider than the screen on a phone, the sheet 308px wide on a 390px screen, drawers open and close, a design is selected by touch, Auto Build opens; the wide layout measured the same as before
 - the builder's two vitest files (51 tests) — 50 passed, 1 failed — the button "Save & Add to Cart" was not found by its name, because the label had been split so a phone can drop "Save &" and the space sat inside the part that is trimmed. The space was moved out; that test passes
 - after that fix and after the Build with AI label was wrapped the same way — the failed test and one test that presses Build with AI, each run alone, both pass. The two whole files were NOT run again after these two one-line changes
 - tsc — no error in the builder; 2 errors, both in src/__tests__/api-client.test.ts, a file from the first commit that this change does not touch
 - NOT done — no cash on delivery order was placed; the builder was not tried on a real phone; the phone screenshots were taken before the last two one-line label changes and not taken again
---

## Prompt

jani do kam ab hamein krne hain saiha wo ye hain bhai ke ek to cod shyd mene tumse bola tha krna ha kuke ek testing krni ha mjy poori saiha aur dusra jani ye gang sheet builder mobile mei itna horrible lagra ha itna koi bekar lagra ha matlab bekar abhi admin bhut shikayat krrha tha saiha tp ye proper dekho yar isey mere bhai jaldi se saiha ye dono krke do zara meri jan

Then, after stopping a command:

continue plz

## Response snapshot

**Cash on delivery** (pushed first, on its own: 6c210d9).

- A shop turns it on in its admin, Billing & Payouts. Off until it does.
- With it on, the last page of checkout asks "How would you like to pay?": Card, or Cash on delivery (pay the total in cash when the order arrives). Both for a signed-in customer and a guest.
- Such an order comes in unpaid. The order page says how much to collect, and "Mark as Paid" records it when the cash is in hand. A gang sheet on it goes to the review queue as with any order.
- The server asks the shop's switch again when the order is placed: the page not showing the choice is not what stops an unpaid order.
- No card is charged, so the platform's commission on a gang sheet is not taken on a cash order.

**The gang sheet builder on a phone.**

There was no phone layout at all: three columns (tools, sheet, list of sheets) crushed each other until the sheet had no width. Under 900px it is now laid out for a phone:

- the sheet has the whole screen;
- the tools' tabs run along the bottom (Uploads, Designs, Gallery, Add Text, Settings, Sheets), and each slides its panel up over the sheet as a drawer, with a close button; a tap outside or a second press puts it away;
- adding a design, Auto nest, Auto Build and the rest put the drawer away as they act, so what they did is seen;
- the top bar keeps the price, Add to Cart, Save and Close; Preview moves into the Sheets drawer; Build with AI, switched off today, is drawn as its icon alone there so the bar still fits when it is turned on again;
- the sheet's own tools sit on two rows, all in sight, where they ran off the side.

Above 900px nothing changes: the phone rules are overrides inside one media query.

## Outcome

- ✅ Impact: a full order can be placed without a card; the builder can be used on a phone.
- 🧪 Tests: as listed.
- 📁 Files: as listed. No migration.
- 🔁 Next prompts: try the builder on a real phone; Auto Build's own panel and the image editor were not redesigned for a phone, only checked to open.
- 🧠 Reflection: two things meant for a phone only showed up on the desktop — a tab and a button — because they are drawn with an inline display that a plain stylesheet rule does not outweigh. Measuring the desktop after the phone caught it; reading the CSS had not.

## Evaluation notes (flywheel)

- Failure modes observed: phone-only elements visible on desktop (inline style beat the hiding rule); a doubled gap inside a button whose label was split across flex children; a button's name read as "Save &Add to Cart" by the test's reading of it, because the space was at the end of an inner span.
- Graders run and results (PASS/FAIL): as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): the same drawer treatment for Auto Build's upload list and the image editor on a phone.
