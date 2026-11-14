---
id: 675
title: Mobile fixes flagged sections
stage: general
date: 2026-11-14
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner flags five spots on the new printcopilot.co that look bad or get cut off on a phone (screenshots)
labels: ["marketing-site", "mobile", "css"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/scripts/import-marketing-site.py
 - frontend/src/components/marketing/site/pages/*.ts (17 pages regenerated)
 - frontend/src/__tests__/marketing-site.test.tsx
tests:
 - vitest marketing-site + marketing-forms: 44 passed
 - tsc --noEmit: clean
 - local screenshots at 390 wide (and the help search at 360): plan card, home plan table, customer strip, affiliate form, help search
---

## Prompt

bhai ye mobile mei bhut bura arha ha  ye bhi cutt off horha ha mobile mei bhai  aur ye form bhi mobile mei sai kro yar jani  ye form bhi dekho bhai  ye bhi sai nh arhy mobile is the first priotiy bhai jaldi kro jani

(screenshots: the pricing plan cards, the home page's "Compare every plan" table, the affiliate "Apply to join" form, the help center search box on a phone, the home page's customer strip on a phone)

## Response snapshot

Fixed the five spots through the converter, so every regenerated page carries them. Plan cards: the app's own global `.card` (24px padding and a shadow) was leaking into the design's cards and pushing the navy price block in from the card's edges; undone ahead of the design's CSS at the lowest weight, so the design's card rules still win. Home plan table: on a phone it now fits the screen (smaller type, ticks and dashes for Included / Not included, as the pricing page's table already does) instead of running 720px wide and getting cut off. Customer strip: two tidy rows (Live customer, Innterflow; Demo stores and the names), the stray divider hidden. Affiliate form: space under "Apply to join", select boxes drawn like the text boxes with a chevron. Help search: the box and the Search button on one row.

## Outcome

- ✅ Impact: the flagged sections read properly on a phone.
- 🧪 Tests: 44 vitest, tsc clean, local screenshots.
- 📁 Files: converter, its test, 17 regenerated pages.
- 🔁 Next prompts: owner's yes to push.
- 🧠 Reflection: the app's global class names can collide with a design's; check globals.css when an app page differs from its design file.
