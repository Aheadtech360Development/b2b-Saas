---
id: 281
title: Header, footer builder and mobile layout
stage: general
date: 2026-10-05
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: simplify the header and footer builder, make them fully styleable, size the logo from its own settings, and fix mobile overflow; then — button text not visible in the editor
labels: ["visual-builder", "header", "footer", "menus", "logo", "responsive", "custom-html", "editor-css"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/baseCss.ts (page guard, element max-width, pasted-markup containment, link/heading colour variables, logo, menus, bar atoms)
 - frontend/src/lib/builder/style.ts (min-width clamp, auto-wrap, margin hold, inherited colours, one-side lines, bar typography)
 - frontend/src/lib/builder/registry.ts (logo and menu fields, style groups, simpleFooter, menuColumn, presets)
 - frontend/src/lib/builder/doc.ts (addFooterColumn, withSimpleFooter), types.ts
 - frontend/src/components/builder/render.tsx, islands/MenuNav.tsx (logo sizing and picture, menu title)
 - frontend/src/components/builder/editor/MenuEditor.tsx (new), fields.tsx, LeftPanel.tsx, SiteEditor.tsx, Inspector.tsx, StylePanel.tsx
 - frontend/src/components/builder/editor/ui.tsx (editor resets kept off the page; menu row)
 - backend/app/services/builder/schema.py (new style keys; logo picture address checked), starter.py (simple footer; logo height as a style)
 - backend/tests/test_builder_schema.py, frontend/src/__tests__/builder-header-footer.test.tsx (new), builder-site.test.tsx, fixtures/elements-css.snap.txt
tests:
 - frontend vitest 249 passed (37 new; 2 pre-existing api-client failures)
 - backend test_builder_schema.py 59/59 (12 new), test_builder_integration.py 138/138, test_builder_security.py 35/35
 - browser probe_hf 55/55; responsive audit: 48 page views at 320/375/430/768/820/1024/1280/1440, no page scrolls sideways
 - regression: probe_builder 41, probe_editor2 11, probe_gaps 32, probe_tiles 7, probe_layout 20, probe_templates 60, probe_assign 29, probe_theme_card 21, probe_search_cart 53 — all passing
---

## Prompt

One final important improvement: please fix and simplify the Header and Footer builder.

FOOTER:

I want a simple, flexible Shopify-style footer.

Structure:

Column 1:
- Logo
- Optional tagline
- Optional text/description

Column 2:
- Menu

Column 3:
- Another menu

Column 4:
- Another menu

The merchant should be able to add as many menu columns as needed.

Each menu column should be configurable:
- Menu title
- Select an existing menu
- Add/edit/remove links
- Reorder links

Also allow the merchant to create multiple custom menus and assign them to different footer columns.

The footer should NOT have a complicated fixed structure. It should simply be:
Logo/Brand column + unlimited custom menu columns.

HEADER + FOOTER STYLING:

Everything should be editable, not only the background color.

Allow settings for:
- Background color
- Text color
- Heading/menu color
- Link color
- Link hover color
- Font
- Font size
- Font weight
- Spacing
- Padding
- Border/divider
- Alignment
- Other basic styling that already fits the builder system

LOGO:

The merchant should be able to select/change the logo from the existing shop/media system.

Logo settings should include:
- Logo image
- Width
- Height
- Max width
- Padding
- Alignment

Do not hardcode logo dimensions.

MOBILE RESPONSIVENESS — VERY IMPORTANT:

I tested Custom HTML and responsive sections and some content breaks badly on mobile.

This is a critical issue because many customers use mobile.

Please audit the Header, Footer, Custom HTML and section/block rendering on mobile.

Make sure:
- No horizontal overflow
- No elements go outside the viewport
- Images scale correctly
- Text wraps correctly
- Columns stack properly
- Menus work correctly on mobile
- Custom HTML cannot easily break the page layout
- Long text/links do not force the page wider
- Sections respect the mobile width/padding
- Responsive settings actually work
- Header and footer look clean on phone widths

Do not simply hide broken content on mobile. Fix the underlying responsive/layout behavior.

CUSTOM HTML:

Custom HTML must remain supported, but make its container safe and responsive.

User-provided HTML/CSS should not be able to accidentally create horizontal page overflow in the normal builder use case.

Please inspect the existing implementation first and reuse the current menu, media/logo, styling and responsive systems instead of creating duplicate systems.

Do not change unrelated product, variant, cart, template or backend functionality.

Finally, test at:
- Desktop
- Tablet
- Mobile (especially ~320px, 375px and 430px widths)

Run the relevant browser/regression tests after making the changes.

Follow-up, mid-work, with two screenshots (a "Start designing" button and a footer "Subscribe" button, both dark with no visible label, in the editor):

continue kro plz and after that what is this issue button text is not visible plz check

## Response snapshot

**Measured first.** A stress page of 38 cases (long unbroken text, many columns, fixed widths, wide tables, sixteen kinds of awkward Custom HTML) was published on a local test shop and measured at eight widths. Before any fix: the page scrolled sideways at every width, desktop included, and 22 cases were wider than the screen, cut off, or spilling out of their box. After: no page scrolls sideways at any width; the two cases still flagged are deliberate negative margins.

**Mobile, by cause.**
- Page guard (`overflow-x:clip` on the site) and `max-width:100%` on every builder element, both weightless so a merchant's own setting wins.
- Custom HTML and rich text: nothing pasted is wider than its block; what cannot shrink (a wide table, a fixed grid, a line that must not wrap) scrolls inside the block instead of being cut off or widening the page. Tables keep their words whole. Images with a width keep their shape.
- A least width becomes `min(X, 100%)`. A row told not to wrap wraps on tablet/phone when nobody chose otherwise for that device — except a header bar (logo, menu button, cart), which stays on one line while its logo gives way. A negative side margin is held to the gutter on tablet/phone.
- Long words break inside headings, buttons, FAQ questions; a long button label wraps inside the button.

**Footer.** A brand column (logo, tagline, a few words) and a column per menu, in a grid that fits as many across as there is room for — so it stacks on a phone with nothing set. "Add a menu column" on the footer; "Use the simple layout" replaces an older footer, keeping its menus and titles. New shops start with it.

**Menus.** Each menu column has a title, a menu picker, "Edit links" and "New menu". The editor is a dialog over the shop's existing menus service (the same records the admin Menus page edits): add, rename, reorder, remove, links under links, delete. It says plainly that a menu is not part of the draft — saving changes the live shop too.

**Styling.** Every container (and so a header or footer) now offers text settings and a "Links & headings" group — link colour, link colour when pointed at, heading/menu-title colour — handed down as variables, so an element with its own colour still wins; a line above or below; and a text size/weight that reaches the menus inside. A white dropdown does not inherit a dark bar's white links; the phone's menu button and dropdown arrows take the link colour.

**Logo.** Its own picture (media library, upload or address; empty = the shop's logo), alignment, and width / height / widest size as per-device styles shown beside the picture. No fixed cap: a logo nobody has sized keeps the modest default it always had. The picture address is checked at publish like any other.

**Button text not visible (the follow-up).** Editor-only. The editor's reset `.sbe button{color:inherit}` outweighed the page's `.b-btn-solid{color:#fff}`, and the page is drawn inside the editor, so real `<button>`s on the canvas — Add to cart, Start designing, Subscribe — lost their white label; dark on dark with a dark brand colour. The published shop was never affected. The reset now leaves the page out. My first version of that fix added weight to the rule and turned the editor's own Publish button black on black; caught in the screenshot, corrected with `:where()` so the rule weighs exactly what it did, and both are now asserted in a unit test and the browser probe.

## Outcome

- ✅ Impact: a footer that is a brand column plus any number of menu columns, with menus made and edited in place; headers and footers styled by name; a logo sized by its own settings; and a builder page that stays inside a phone's screen whatever was set for a desktop. Existing content's CSS is unchanged (starter snapshot identical; elements snapshot only gained lines).
- 🧪 Tests: as listed above, against the local test database only.
- 📁 Files: as listed above. No change to products, variants, cart, templates or assignments; no migration.
- 🔁 Next prompts:
  - A dropdown in a menu shown in full on a phone can reach past the screen's edge (it is clipped, not scrolled); a phone normally uses the drawer.
  - Custom HTML that pulls itself wide with negative margins is cut at its block's left edge, by design.
- 🧠 Reflection: two faults were found only by looking at pictures after the checks passed — the black Publish button I had just caused, and the invisible ☰ on a dark header. Measure, then look.

## Evaluation notes (flywheel)

- Failure modes observed:
  - A CSS fix that changed specificity as a side effect (`:not()` counts; `:where()` does not).
  - Probe expectations that ignored the canvas scale, a slide-in animation, and a column narrower than the width asked for.
  - "The last grid on the page" stopped meaning "the one just added" once the footer became a grid.
  - Heredocs mangling backslashes, three more times: patches now go through a file.
- Graders run and results (PASS/FAIL): all PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): flip a dropdown to open leftwards when it would pass the screen's right edge.
