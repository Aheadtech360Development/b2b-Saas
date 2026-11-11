---
id: 622
title: Import an HTML design into the builder
stage: general
date: 2026-11-11
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner wants dummy stores from an HTML file, picked up properly by the website builder, to show the T-shirt customizer
labels: ["visual-builder", "import", "storefront", "tshirt-designer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/importHtml.ts
 - frontend/src/components/builder/editor/ImportDesign.tsx
 - frontend/src/components/builder/editor/LeftPanel.tsx
 - frontend/src/__tests__/builder-import-design.test.ts
tests:
 - frontend/src/__tests__/builder-import-design.test.ts (6 passed)
 - all 21 builder test files (288 passed)
 - local end to end on the demo shop (port 3199, local DB only): sign in, Site builder, Pages, Import a design, Bring it in, draft preview at 1280 and 390 beside the design: designs/innterflow-final-wireframe.html (7 pages, header, menu, footer), designs/Platform-Pricing-Page.html (Tailwind CDN), PrintCoPilot Retail Page and Site Changes.html (a design tool's board of 4 pages); no page wider than the screen
 - each imported site checked with the server's publish rules (schema.validate): 0 errors
 - tsc clean; next build passed
---

## Prompt

bhai jaldi se ab meri bat suno meri jan ab thora kam ziada ha abhi na meri sir se bat hui dummy stores bnane hain mjhy bhai saiha meri jan ab suno gor se blkl gor se mere bhai ek mei tumhein abhi jugar ke lie html file derahn ok? ab uske scene kia krna ha bascailly gang sheet builder ke display ke lie hamare pass proper ek store ha saiha bhai wo ha hamara innterflow ok t shirt customizer ke lie ek dummy store bnalia ha mene saiha bs ab mei nh chahata drag and drop  krke same structure yaha bnao to mei file daldeta hn saiha meri jan html tum functionality bnado poora website builder usey achy se pick krle proper dekhlena saiha aur prodcut wgarra bhi dusre prodcut ki import krke export kradunga mei take t shirt customizer ki sirf functionality wire krke logo ko dikhani ha smjhre hona mei kia kehra hn jani ?

(then: continue)

## Response snapshot

No HTML file had arrived yet, so the feature was built for any design and checked on three real ones. Site builder → Pages → "Import a design" → choose the .html (and the pictures beside it). The design is laid out in a hidden frame with its scripts off and read as drawn at 1280, 820 and 390 px: bands become Sections (contained at the site's width, which the design sets), boxes become Stacks laid out as the design does (row, column, grid with its column counts per device), headings, text, rich text (marks and colours kept), images, buttons, icons (SVG kept as drawn), FAQs, tables (look inlined), forms (email signup, contact form). The header's links become a real menu (drawer on phones), its cart, search, log in / sign up the shop's own, its logo the Logo element; a grid of priced product cards becomes a Product grid of the shop's products; "Design your own" style links go to /design. Pages of a tabbed wireframe become builder pages; a design board (design tool export) is unpacked page by page; Tailwind CDN pages are drawn first in a script-only sandbox (opaque origin) and read as drawn. Fonts and colours become the site's. Pictures inside or beside the file are uploaded to the media library. All of it lands in the draft (undoable), nothing live until Publish.

## Outcome

- ✅ Impact: a dummy store is one import plus products (export/import) plus the T-shirt designer switched on; no drag and drop rebuilding.
- 🧪 Tests: 6 new, 288 builder tests, three designs end to end with side-by-side screenshots, server validation, tsc, next build.
- 📁 Files: one converter, one dialog, the Pages panel, one test file.
- 🔁 Next prompts: the owner's HTML file; the owner's yes to push.
- 🧠 Reflection: the builder's own defaults fight a faithful copy (a column stretches its children, a grid folds by itself on smaller screens, rows wrap on tablets, words break anywhere): each was found only by comparing screenshots, and is now said explicitly per device. Running a design's own scripts can crash the tab (a design board did), so scripts run only when a design needs them, and boards are unpacked without running theirs.
