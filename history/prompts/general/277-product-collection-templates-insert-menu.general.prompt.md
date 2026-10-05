---
id: 277
title: Product and collection templates, canvas plus menu
stage: general
date: 2026-10-05
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: fix the panel collapse, then a Shopify/Elementor-style product & collection template builder
labels: ["visual-builder", "templates", "product-templates", "collection-templates", "insert-menu", "reviews", "editor-layout"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/builder/editor/ui.tsx (grid columns pinned; + button, insert menu, banner styles)
 - frontend/src/components/builder/editor/Canvas.tsx (+ buttons around the hovered and selected element)
 - frontend/src/components/builder/editor/InsertMenu.tsx (new: what fits this template, searchable)
 - frontend/src/components/builder/editor/LeftPanel.tsx (Templates panel: new-from, rename, duplicate, collections; Add panel by context)
 - frontend/src/components/builder/editor/SiteEditor.tsx (who-uses-this banner, sample follows assignment, name lookup)
 - frontend/src/components/builder/editor/icons.ts
 - frontend/src/components/builder/islands/Reviews.tsx (new: reviews list + write form)
 - frontend/src/components/builder/render.tsx (product_rating, product_reviews)
 - frontend/src/lib/builder/registry.ts (two elements; blocks and context for ready-made pieces)
 - frontend/src/lib/builder/doc.ts (renameTemplate, assignCollections, collectionsUsing, templateFor, templateTypeOf)
 - frontend/src/lib/builder/baseCss.ts, types.ts
 - frontend/src/services/builder.service.ts (lookupProducts)
 - backend/app/services/builder/schema.py (product_rating, product_reviews)
 - backend/app/services/builder/resolve.py (reviews read only by pages that show them)
 - backend/app/api/v1/admin/builder.py (POST /products/lookup)
 - backend/tests/test_builder_integration.py, backend/tests/test_builder_security.py
 - frontend/src/__tests__/builder-templates.test.ts (new), builder-layout-compat.test.ts, fixtures/elements-css.snap.txt
tests:
 - backend test_builder_schema.py 47/47
 - backend test_builder_integration.py 81/81 (19 new)
 - backend test_builder_security.py 35/35
 - frontend vitest builder suites 109/109 (17 new)
 - browser probe_templates 58/58
---

## Prompt

first o fall when i am clicking on this hide sidebar button screen collapses check this plz and thenI want to improve the existing Product & Collection Template Builder.

Keep the existing product variants, product options and backend product data exactly as they are. Do NOT rebuild the variant system or create a new metafield system.

I want the template system to work like Shopify/Elementor.

PRODUCT TEMPLATES:

I need multiple reusable product templates.

For example, imagine I have these 2 products:

Product 1:
"LYPROTS DTF 50/50 Blank Tee"
Under the title, this product may need:
- A custom product description
- "Why Lyfelyke" information box
- Shipping information
- Other custom content

Product 2:
"DTF Transfers By Size"
Under the title, this product may need:
- Reviews/questions
- Different product description
- "Best For" information box
- Processing/shipping notice
- "How it works" information
- Other custom content

These two products should NOT need to use the exact same page layout.

For example:

Product 1 → Apparel Product Template

Product 2 → DTF Transfer Product Template

The Apparel template can have completely different sections/content from the DTF Transfer template.

This is the main functionality I want.

TEMPLATE BUILDER:

When editing a Product Template, I should be able to visually build the page.

Just like Shopify/Elementor, when I click between or inside elements, I should get a "+" button that allows me to add whatever supported content I want.

For example:

Title
↓
Description
↓
+ Add section/block
↓
"Why Lyfelyke" custom content
↓
+ Add section/block
↓
Product options / variants
↓
+ Add section/block
↓
Custom HTML
↓
Image
↓
Reviews
↓
FAQ

I should be able to:
- Add sections
- Add blocks/elements
- Reorder with drag & drop
- Duplicate
- Hide/show
- Delete
- Edit content/settings
- Add Custom HTML
- Add headings, text, images, etc.
- Add existing dynamic product elements

The existing product title, price, images, variants and options should automatically come from the existing backend.

I only want the template builder to control WHERE and HOW these things appear and what additional content/sections appear around them.

COLLECTION TEMPLATES:

Do exactly the same thing for Collections.

For example:

Apparel Collection → Apparel Collection Template

DTF Collection → DTF Collection Template

Another collection → Another Collection Template

Each collection template can have completely different sections, layout and content.

MAIN GOAL:

I want a flexible Shopify/Elementor-style template builder where:

Product → assigned Product Template → renders that template

Collection → assigned Collection Template → renders that template

One product template should NOT force every product to have the same content/layout.

Different products can use different templates, just like the two examples above.

Do NOT change the existing product/variant/options system.

Do NOT create a new metafield system.

First inspect the existing codebase and implement this cleanly on top of the current architecture.

(Two screenshots attached: the editor with the left panel open, and the editor after clicking the hide-left-panel button — the canvas squeezed into a sliver and the settings panel filling the window.)

Follow-up, mid-work: "continue kro meri jan" / "continue plz"

## Response snapshot

**Panel collapse.** The left panel was hidden with `display:none` while the editor's grid kept three columns, so the canvas fell into the 0px column and the settings panel took the window. Each of the three areas is now pinned to its own grid column; hiding either side, or both, gives the room to the canvas.

**What already existed (inspected first).** The site document already held several templates per kind (`templates.product.*`, `templates.collection.*`) and chose one per record through `assignments.<kind>.byId`, falling back to the kind's default; the storefront resolver already honoured both. Products could be assigned in the Templates panel; collections could not. Nothing on the canvas offered a "+".

**Built on top of that — no change to products, variants, options or metafields.**

- A "+" on the canvas: around whatever is hovered or selected (above/below, or left/right where things run across; in the middle of an empty box; at the end of the page). It opens a searchable menu that offers only what fits the template open — the product's own elements on a product template, the collection's on a collection template — then ready-made blocks, ordinary elements, and whole sections where a section can go. Enter adds the closest name.
- Templates panel: New asks for a name and what to start from (a copy of any template of that kind, or empty); Rename, Duplicate, Make default, Delete in a row menu; a Collections picker beside the Products one.
- A note above the canvas says which products or collections use the template open, with a button to change them; the canvas previews the template with a record that actually uses it.
- Ready-made blocks made of ordinary elements: Info box, Notice, Best for, How it works, Trust badges; and sections Product details, Reviews section, Collection header.
- Two product elements on existing data: Star rating and Reviews (approved reviews only, read by the page resolver only when a page shows them; signed-in customers can write one through the existing reviews endpoint).
- The Add panel follows the same fits-this-template rule.

**Found by the browser probe and fixed before shipping.** Clicks in a template's row menu also counted as clicks on the row (Duplicate re-opened the original; Delete could bounce to Home). Enter in the + menu's search picked "Info box" for "heading". The Reviews element kept its first, empty list after the data arrived. Summary stars were grey because the count's colour rule caught them. A flaky timing assertion in the security suite (my own, last round) now asserts the query saved, not milliseconds.

## Outcome

- ✅ Impact: two products (or collections) can have entirely different pages, each built visually with a + at any spot, on the existing template/assignment model. Legacy imported-theme shops are untouched; the CSS of pre-existing builder content is byte-identical (45 of 45 earlier rules unchanged).
- 🧪 Tests: as listed above. Run against the local test database only.
- 📁 Files: as listed above.
- 🔁 Next prompts:
  - Decide whether the product admin page should also show/choose the website template (it would edit the builder draft, so it only goes live on Publish).
  - "Questions" has no data behind it yet — today that is the FAQ element, written per template.
- 🧠 Reflection: the data model already did the hard part; the missing piece was all editor UX. Passing checks did not show the grey stars or the block touching the title — the screenshots did.

## Evaluation notes (flywheel)

- Failure modes observed:
  - Windows reserved the local test database's port (55432) after a reboot; the same data volume was run on 127.0.0.1:45432 and the script-tests run through a wrapper swapping only the port. Committed tests and their guard were not edited.
  - Probe artefacts: a Playwright-only selector passed to `document.querySelector`; a click landing on the selected element's name tag.
  - A wall-clock assertion failing under load.
- Graders run and results (PASS/FAIL): all PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): move the selected element's name tag when it would cover the element above it.
