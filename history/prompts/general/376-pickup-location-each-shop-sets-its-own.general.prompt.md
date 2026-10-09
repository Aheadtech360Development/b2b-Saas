---
id: 376
title: Pickup location each shop sets its own
stage: general
date: 2026-10-09
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: the address shown for Will Call Pickup at checkout looks hardcoded; make it something each brand sets in the admin
labels: ["checkout", "will-call", "shipping-settings", "email"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/pickup.py (new) — one answer for where a shop's customers collect
 - backend/app/core/tenant_settings.py, api/v1/admin/settings.py — the setting is each shop's own, and the admin may save it
 - backend/app/api/v1/storefront.py — the checkout is told the name, address, hours and note
 - backend/app/api/v1/admin/orders.py — the "ready for pickup" mail says where to come
 - backend/app/templates/emails/ready_for_pickup.html, tasks/email_tasks.py — no shop's street and hours printed in the template
 - backend/tests/test_pickup_location.py (new, 7)
 - frontend/src/app/(admin)/admin/standard-shipping/page.tsx — the Pickup location card
 - frontend/src/app/(customer)/checkout/address/page.tsx, components/providers/BrandingProvider.tsx — shown at checkout
 - frontend/src/app/(admin)/admin/orders/[id]/page.tsx — the order page follows the same rule
tests:
 - backend/tests/test_pickup_location.py — 7 passed, no database
 - tsc — no error in anything touched; the same 2 old ones in src/__tests__/api-client.test.ts
 - NOT done — not looked at in a browser; no order was marked ready for pickup to see the mail
---

## Prompt

acha jani ab iska scene ye krna ha ke ye jo will call pickup wala scene hana isme jo location arhi hana wo editable chayie mjhy abhi hardcoded ha saiha ye admin panel mei settings wagera kahin pe dedo take mei isey change kr paon har brand apne accordingly isey change kr pae jani saiha ye dekhlena

(with a screenshot of the checkout: Will Call Pickup, "10723 TURBEVILLE DR, DALLAS, TX 75243")

## Response snapshot

- The address at checkout was not hardcoded: it was the shop's Ship-From address (Admin → Shipping), and nothing on that page said so.
- What was hardcoded was in the "ready for pickup" mail's template: one shop's street and its opening hours.
- Admin → Shipping now has a card, "Pickup location (Will Call)": the same as the ship-from address, or a different one; pickup hours; a note for the customer; and what the customer will see, before saving.
- The checkout shows the name, address, hours and note. The mail sent when an order is marked Ready for Pickup now says where to come and when.
- A shop that never opens the card sees no change: its ship-from address stands.

## Outcome

- ✅ Impact: each shop sets where its customers collect, and can read it back before saving.
- 🧪 Tests: as listed.
- 📁 Files: as listed. No migration: the setting is a namespaced row, like the shop's other shipping settings.
- 🔁 Next prompts: whether a shop with no counter should be able to turn Will Call off altogether.
- 🧠 Reflection: "hardcoded" was the owner's reading of a setting that existed and was labelled as something else. The fix that mattered was naming it where it is edited.

## Evaluation notes (flywheel)

- Failure modes observed: none in the checks run.
- Graders run and results (PASS/FAIL): as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
