---
id: 383
title: What to do with Googles GTM install steps
stage: general
date: 2026-10-09
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Google's install dialog says paste one code in the head and one after the body tag; what do I do with that
labels: ["tracking", "gtm", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none changed
tests:
 - live server, read-only — the shop's storefront is told to load GA4 only; no Tag Manager container is saved yet; the custom head code box still holds code
 - NOT done — Google's own "Test" button and Tag Manager's preview were not tried by me; how that Test button reads a page was not verified
---

## Prompt

(a screenshot of Google Tag Manager's "Install Google Tag Manager" dialog for GTM-KQ984BCJ: 1. paste this code as high in the head as possible, 2. paste this code immediately after the opening body tag, 3. test your website (optional))

 to ye jo kehra ha uska kia krun mei

## Response snapshot

- Step 1 is done by the platform: put GTM-KQ984BCJ in the Google Tag Manager box on Tracking & Analytics, switch it on, save. Nothing is pasted. It is not saved yet on the live shop.
- Step 2 (noscript) is skipped: it only serves a visitor with JavaScript off, and the shop does not run without it.
- Step 3: after saving, try Google's Test; if it does not go green, use Preview in Tag Manager, which is the dependable check.
- The container must be published in Tag Manager (Submit, Publish), or nothing loads from it.

## Outcome

- ✅ Impact: the owner knows which of Google's three steps is theirs to do and where.
- 🧪 Tests: one read-only check, as listed.
- 📁 Files: none.
- 🔁 Next prompts: what Preview shows after the container is saved and published.
- 🧠 Reflection: the dialog is written for somebody editing a site's HTML. On a platform the same three steps turn into one field, one step that does not apply, and one check.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
