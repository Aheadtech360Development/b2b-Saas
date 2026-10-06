---
id: 310
title: Custom HTML SVG icons
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: the star icons in a pasted Custom HTML reviews block do not show — why
labels: ["visual-builder", "custom-html", "sanitizer", "svg"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/builder/sanitize.py (SVG drawings and Google Fonts links allowed, safely)
 - frontend/src/lib/builder/sanitize.ts (the editor's copy of the same rules)
 - backend/tests/test_builder_schema.py, frontend/src/__tests__/builder-site.test.tsx
tests:
 - backend builder schema 64/64 (three new); frontend builder-site + builder-policies 46/46; tsc: no new errors
---

## Prompt

With a picture of the builder: a Custom HTML block, "What customers are saying", three review cards with an empty gap where the stars should be. Pasted alongside, the block's markup (a Google Fonts link; each card's five stars drawn as an inline `<svg>` of `<polygon>`s) and its CSS.

hn hn mei smjhgya abhi ek issue ye arha ha ke [the block's HTML] [the block's CSS] ye icons ku fetch nh kr parha ha jani dekho zara

## Response snapshot

The stars were not failing to load: they are drawn in the markup itself as `<svg>`, and the Custom HTML cleaner removed every `<svg>` with everything inside it — in the editor and again on the server. The Google Fonts `<link>` was removed the same way.

Now a drawing is kept: `svg`, `g`, `path`, `polygon`, `polyline`, `circle`, `ellipse`, `rect`, `line`, gradients, `clipPath`, `mask`, `symbol`, `use`, `text` — with their shapes, colours, strokes and transforms. Still removed inside a drawing: scripts, event handlers, `<animate>`/`<set>`, `<foreignObject>`, links to anywhere outside it (`href` only to `#…` in the same drawing; `url(#…)` only), and any `javascript:`/`data:` value. A `<link rel="stylesheet">` is kept only when it is Google Fonts; any other stylesheet is still removed.

## Outcome

- ✅ Impact: icons, stars and logos pasted as SVG show in Custom HTML, in the editor and on the shop.
- 🧪 Tests: as listed.
- 📁 Files: as listed.
- 🔁 Next prompts: none.
- 🧠 Reflection: "not fetching" was the cleaner, not the network.

## Evaluation notes (flywheel)

- Failure modes observed: a new check used `re` without importing it in the test script (caught on the run).
- Graders run and results (PASS/FAIL): all PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): none.
