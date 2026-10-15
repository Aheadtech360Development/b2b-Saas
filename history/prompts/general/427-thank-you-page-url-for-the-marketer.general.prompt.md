---
id: 427
title: Thank-you page URL for the marketer
stage: general
date: 2026-10-15
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Give the marketer the thank-you page URL that follows an order
labels: ["tracking", "gtm", "thank-you-page", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - this record only (no code changed)
tests:
 - code read: the page is app/(customer)/checkout/thank-you/[number]; order numbers are per brand from 1001; the review page reaches it with router.replace (no full page load)
---

## Prompt

acha suno kl gtm ka thanku page ka url bnawya tha na jo page bnwaya tha marketor kehra uska url to do jo order bnne ke bad  wo url do mjhy

## Response snapshot

**The URL.** It is https://<brand>.printcopilot.co/checkout/thank-you/<order number>. For example: https://innterflow.printcopilot.co/checkout/thank-you/1001. Each brand numbers its orders from 1001.

**For GTM.** Checkout reaches this page without a full page load (router.replace). So a plain Page View trigger on the path will not fire. Two options instead:
- The custom event `purchase`, which is recommended. It is pushed once per order with transaction_id, value, currency, tax, shipping and items.
- A History Change trigger with the path condition `/checkout/thank-you/`.

## Outcome

- ✅ Impact: the marketer can set the tag.
- 🧪 Tests: code read above.
- 📁 Files: this record.
- 🔁 Next prompts: the marketer's purchase tag in the GTM container.
- 🧠 Reflection: n/a

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
