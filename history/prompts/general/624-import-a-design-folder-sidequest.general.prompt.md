---
id: 624
title: Import a design folder (Sidequest)
stage: general
date: 2026-11-11
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner put the Sidequest demo store folder in the repo; asks how to make a brand from it with real products instead of the dummy ones
labels: ["visual-builder", "import", "demo-store"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/importHtml.ts
 - frontend/src/components/builder/editor/ImportDesign.tsx
 - frontend/src/__tests__/builder-import-design.test.ts
tests:
 - frontend/src/__tests__/builder-import-design.test.ts (10 passed)
 - all 21 builder test files (292 passed)
 - local end to end on the demo shop: Pages, Import a design, Choose the design's folder (sidequest), bring it in; draft preview of home, contact and rewards at 1280 and 390 beside the design run with its own scripts; nothing wider than the screen; the draft passes the server's publish rules (0 errors)
 - the earlier designs (Innterflow wireframe, Tailwind pricing) still import with 0 errors
 - tsc clean; next build passed
---

## Prompt

ye poora folder daldun kia ek new brand create krke batao jani zara isme to abhi filhal dummy products lagy hue hain bhai ab mjhy to original chayie meri jan jo mei export krke import krunga aur wo kese handle hoga ruko mei ye yaha lagara hn ek second rko isi b2b folder mei lagadeta  ye lo daldia jani mene

(screenshots: the sidequest folder: assets, checkout, collections, contact, favicon, gift-cards, index, product, returns, rewards, track; and it placed in d:\b2b-Saas-main)

## Response snapshot

The Sidequest design is several pages whose header, footer and product cards are drawn by its own scripts (assets/app.js, data.js with fictional products) and styled by separate files (assets/styles.css, pcp-bar.css). The import read one HTML file only, so it gained a folder mode: "Choose the design's folder" (or several files). Each page has its stylesheets and scripts written in, is drawn once with its scripts in the sealed frame, its pictures shown from the folder (blob copies, uploaded on Bring it in), then read. index becomes the home page; contact and rewards become pages; checkout, product, collections, gift cards, returns and track are the shop's own working pages (not brought in; the design's links go to /cart, /products, /gift-cards, /returns, /track-order). The fictional products are never imported: the "Moving fast" cards become a Product grid of the shop's real products. Also: pictures laid over a whole box (hero, bundle) kept as images, lazy pictures loaded, titles with line breaks kept, buttons keep their least height, the contact form keeps its two columns and colours, words and links in one line stay one line, a FAQ's title stays beside it, the demo bar's text kept without its "Plan features" button.

## Outcome

- ✅ Impact: a demo store is: new brand, import the folder, import products, switch on the T-shirt designer, publish.
- 🧪 Tests: 10 import tests, 292 builder tests, the Sidequest folder end to end, server validation, earlier designs re-checked, tsc, next build.
- 📁 Files: converter, dialog, tests.
- 🔁 Next prompts: the owner's yes to push (with 671e7b5); the owner makes the brand on live and imports.
- 🧠 Reflection: a store design is rarely one file: its look is in stylesheets beside it and much of it is drawn by its own script; reading it as the browser shows it needed both, plus its pictures loaded in the frame that measures it.
