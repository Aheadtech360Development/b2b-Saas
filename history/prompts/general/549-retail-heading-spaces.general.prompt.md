---
id: 549
title: Retail heading spaces
stage: general
date: 2026-11-03
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner's screenshot of /retail's hero, "sell" and "their" glued together
labels: ["retail-launch", "marketing-site", "jsx", "bug"]
links:
  spec: specs/003-retail-launch/tasks.md
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/marketing/pages/Retail.tsx
 - frontend/src/components/marketing/pages/RetailPricing.tsx
 - frontend/src/__tests__/retail-site.test.tsx
 - history/prompts/general/549-retail-heading-spaces.general.prompt.md
tests:
 - vitest retail-site: 10 passed (1 new: the space in every heading's coloured part)
 - tsc --noEmit: no errors in src
---

## Prompt

ye sell aur their mei space ku nh ha bhai mere?

## Response snapshot

JSX drops whitespace that holds a line break, and the pages generated from the design boards put each heading's coloured part (`<span>`) on its own line after the words, so "sell" + "their own products." rendered "selltheir". Scanned every marketing page (scratchpad jsx_space_scan.py): 9 real cases, all on /retail and the Pricing Retail tab ("theapps.", "youwork.", "platformssell", "$79per month" twice, "daytrial.", "brands.Everything", "aresure."); the other hits were icon or dot spans in flex rows (the gap spaces them) and one block span. Added `{" "}` at each (scratchpad patch_jsx_spaces.py, line endings kept) and a test that reads every heading's words with the space. Committed locally; asked to push.

## Outcome

- ✅ Impact: Retail page and tab headings read correctly once pushed.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: owner's yes to push.
- 🧠 Reflection: generated JSX needs a glued-words scan; one report usually means a pattern.
