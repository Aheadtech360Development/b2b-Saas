---
id: 335
title: Header dropdown over the account bar
stage: general
date: 2026-10-07
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: the header's submenu is hidden under the bar below it on the customer account page — find out why and fix it
labels: ["visual-builder", "header", "dropdown", "z-index", "customer-account", "editor"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/baseCss.ts (the header's layer: 30 → 40, sticky or not)
 - frontend/src/components/builder/editor/ui.tsx (the editor's frame keeps the page's layers to itself)
 - frontend/src/__tests__/builder-header-footer.test.tsx (two checks)
tests:
 - one picture, before and after, of the dropdown over a page's own sticky bar, and of the editor's selection box on a header in an unscaled preview
 - vitest: builder-header-footer and builder-auth-buttons, 56 passed; tsc: clean
---

## Prompt

With a picture of the live customer account page (/account/orders): the header's "DTF & UV DTF" dropdown is open, and the account page's own white bar ("Menu", "Orders") covers its first item:

ye dekho zara jani ye kia issue ha yar submenu header ke nechay chupri ha jani

## Response snapshot

**Why.** A builder header sat on layer 30. The account pages keep a bar of their own at the top, and it is on layer 30 too. On a tie the one that comes later on the page is drawn on top — the bar — so it covered the part of the dropdown that hangs over it. Everywhere else the dropdown hangs over plain page content, which is why it only showed on the account pages.

**Fix.** The header is on layer 40 whether or not it follows the page down: above a page's own bars (30), still under the pop-ups (the cart's at 50, the chat at 60, the phone's menu far above).

**Found beside it, and fixed.** In the editor, when the preview is not scaled down (phone and tablet previews, or a wide screen), the page's layers were not kept inside the preview's frame, so the header was drawn over the selection box of whatever was selected in it. The frame now keeps its own layers, as it already did whenever the preview was scaled.

## Outcome

- ✅ Impact: the header's dropdown and search suggestions open over the account pages' bar; the editor shows what is selected in a header at every preview size.
- 🧪 Tests: as listed.
- 📁 Files: as listed.
- 🔁 Next prompts: a header set to follow the page down and the account pages' bar both stick to the top, so the bar slides under the header there — not the case on the live shop; fix when a shop asks for a sticky header.
- 🧠 Reflection: the first reading was "the header has no layer at all"; the base rule one line up gives every part a position, so it did have one — the same one as the bar. Reading the whole rule set before changing it kept the fix to a number.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): have a sticky header tell the page its height, so a page's own sticky bar can sit under it.
