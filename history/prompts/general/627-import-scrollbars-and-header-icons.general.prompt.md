---
id: 627
title: Import scrollbars and header icons
stage: general
date: 2026-11-11
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner imported the Sidequest folder on the new brand; the heart icon sits out of line and a scrollbar shows beside the logo and the hero title
labels: ["visual-builder", "import", "demo-store"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/importHtml.ts
tests:
 - frontend/src/__tests__/builder-import-design.test.ts and builder-menu-one-line.test.tsx (16 passed)
 - the Sidequest folder imported in a real browser (bundled converter, both hidden frames): all 11 rich texts overflow visible, header row 68px (60px phone), heart 44x44 centred, logo links home, SUPPLY middle-aligned in JetBrains Mono, Nocturnal upright; the builder's CSS for those nodes printed and checked
 - tsc
---

## Prompt

aby ye heart icon wagerra esa ku arha ha bhai aur dusra ye scroller dekho yar bhai mere

(screenshots: the imported header with the heart above the cart; the hero "DROP 08 NOCTURNAL" with a scrollbar beside it; the "S/Q SUPPLY" logo with a small scrollbar)

## Response snapshot

Cause of the scrollbars: the builder's rich text has overflow-x auto (for wide tables), which makes overflow-y auto too; a title with a tight line height (logo 1, hero 0.9) reaches past its lines, so a Windows browser shows a scrollbar. My earlier checks used a headless browser, which hides scrollbars. Fix in the import: imported words get overflow visible (tables keep scrolling). The heart: the design's 44px icon button became a bare 22px drawing beside the builder's 42px cart; the icon now keeps its button's box with the drawing centred. Also fixed in the same header: height var(--hdr) is resolved, so the header is 68px again (60px on phones); the logo (rich text of an <a>) keeps its link home; "SUPPLY" keeps vertical-align middle, its 4px gap and its mono font; an <em> the design draws upright is no longer italic. The heart has no wishlist behind it on the platform: decoration only, deletable in the builder. Re-import needed after the deploy.

## Outcome

- ✅ Impact: imported titles never show scrollbars; header icons line up at the design's height.
- 🧪 Tests: 16 unit tests; a real-browser folder import of Sidequest with the output and its CSS checked; tsc.
- 📁 Files: importHtml.ts.
- 🔁 Next prompts: owner's yes to push; then re-import the folder on the demo brand.
- 🧠 Reflection: headless screenshots hide scrollbars; a scroll check has to read computed overflow and sizes, not pictures.
