---
id: 415
title: GTM container has no purchase tag
stage: general
date: 2026-10-14
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Confirm that, with Tag Manager on, the purchase tracking works end to end
labels: ["tracking", "gtm", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - this record only (no code changed)
tests:
 - live, read-only: GET /api/v1/storefront/analytics for innterflow; gtm.js?id=GTM-KQ984BCJ read for its tags and triggers
---

## Prompt

[screenshot: Admin, Tracking & Analytics on Innterflow. Track visitors on; product views and checkout both ticked; GA4 off; Google Tag Manager on, GTM-KQ984BCJ]
ye  gtm laga hua ha matlab har cheez sai kam kregi na bhae

## Response snapshot

**The site's side is complete.** Innterflow has tracking on, checkout tracking on, GTM-KQ984BCJ, and Meta Pixel 1027221219465465 by ID. On the thank-you page the site pushes the purchase once, in the marketer's shape.

**The container's side is not yet.** The live GTM container (published version 2) holds one tag only. It is a custom template, cvt_MQDKZ (projectId yv36li1fic, which looks like Microsoft Clarity), and it fires on gtm.js, so on every page. There is no trigger on the 'purchase' event and no GA4 or Google Ads tag.

Until the marketer adds a Custom Event trigger 'purchase', puts a tag on it and publishes the container, nothing reads the event.

Meta is already sent by the site directly, Purchase included. Adding Meta inside GTM as well would count every event twice. GA4 has the same either-or: by ID in the site's settings, or in GTM, never both.

A note for the marketer was given to forward.

## Outcome

- ✅ Impact: the owner knows what is left, and that it is in the marketer's container, not in the site.
- 🧪 Tests: the live, read-only reads above.
- 📁 Files: this record.
- 🔁 Next prompts: the marketer publishes the trigger and tag; then a test order with GTM Preview.
- 🧠 Reflection: "GTM is on" says the container loads, not that anything in it listens for the purchase.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
