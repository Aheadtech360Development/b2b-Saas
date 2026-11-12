---
id: 645
title: Demo bar links to platform
stage: general
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner wants "PrintCoPilot" in every demo store's "Demo store, powered by PrintCoPilot" bar to go to https://www.printcopilot.co/
labels: ["visual-builder", "demo-store", "platform"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/builder/render.tsx
 - frontend/src/components/storefront/PoweredBy.tsx
 - frontend/src/__tests__/builder-platform-link.test.tsx
tests:
 - builder-platform-link (3 new) and builder-search-suggest (19 passed)
 - tsc
---

## Prompt

aby jani ye printcopilot jo ha yaha redirect hona chayie har store poe saua meri jan https://www.printcopilot.co/

(screenshot: the bar "Demo store, powered by PrintCoPilot")

## Response snapshot

The bar is the design's own, imported as rich text without a link (Sidequest's in the announcement part, the others' in each page's first band). The renderer now links "PrintCoPilot" after "powered by" in rich text to https://www.printcopilot.co/ (new tab), unless the line already links to the platform; every existing demo store gets it on deploy with no edits or re-import. The footer line's address is now the same www address.

## Outcome

- ✅ Impact: every demo store's bar and footer credit go to the platform.
- 🧪 Tests: 3 new, tsc.
- 📁 Files: render, PoweredBy, a test.
- 🔁 Next prompts: owner's yes to push.
- 🧠 Reflection: a render-time link reaches content already imported on live, where a converter change would need every store re-imported.
