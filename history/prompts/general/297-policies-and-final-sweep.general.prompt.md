---
id: 297
title: Policies and final sweep
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: confirm cart and checkout will not break on the builder site; add Shopify-style policies to the builder, written in a box of formatted text and responsive; then a full final sweep
labels: ["visual-builder", "policies", "pages", "rich-text", "responsive", "regression"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/policies.ts (new — the five policies; a policy is an ordinary page with one block of formatted text)
 - frontend/src/components/builder/editor/PolicyEditor.tsx (new — the box), LeftPanel.tsx (Policies under Pages), fields.tsx (the formatted-text box, shared: numbered list, big heading, a tall size), ui.tsx (what the box shows while writing)
 - frontend/src/lib/builder/baseCss.ts (headings inside formatted text are sized and spaced on the shop)
 - frontend/src/app/(customer)/privacy-policy/page.tsx (the builder's page comes first at this fixed address)
 - frontend/src/__tests__/builder-policies.test.ts (new)
tests:
 - frontend vitest: builder-policies 14/14 (new); whole suite 300 passed, 2 pre-existing api-client failures
 - frontend tsc: no new errors; backend: builder schema 59/59, image tools 20/20, upscale 16/16
 - policies end to end in a real browser on a local builder shop, 24/24: written, published, read at 1440 / 1024 / 768 / 430 / 375 / 320 px, edited, removed
 - final sweep on a local builder shop: search, product, options, cart, quantities, removal, totals, checkout hand-off — 52 of 53; the one miss re-run on its own and passing (the check read a price between two updates)
 - gang sheets, cart, checkout and account pages opened on the builder shop: all 200, no script errors, nothing sideways
---

## Prompt

acha ab ek last but not the least ek cheez jb mei ye builder wali theme mei wo krunga to cart wagera checkout to kch break wagera nh hoga na bhai mere kuke wo mene last time dekha tha to har cheez proper work krrhi thi chahe wo gang sheet builder ho chahe upload by size ya upload a print ready gang sheet sb as expected chlra tha saiha meri jan aur ek aur cheez customizer mei na polices pages ka bhi krdo jis tarah shppify mei backend mei settings mei jake policeies mei jo byu default 5 hotin hain na shiping return and refund privacy policy terms and conditions aur shyd ek aur to ap proper jese hum kholty hain isey to ek dabba acha sa khulta ha waha proper ham formatted text dalty hain saiha to ye bhi krdo aur proper krna ke proper mobile tab pr responsive ho saiha dekhlena end to end bs ye kro aur abhi ke lie bs khatam krty hain kl milegy ab saiha ek final sweep krdo full and final

## Response snapshot

**Cart and checkout on the builder site.** They are the same cart and the same checkout whichever design the shop shows; switching changes what is drawn around them. Run again on a local shop that uses the builder site: search, product, options, add to cart, quantities, removal, totals, on to checkout — 52 of 53, and the one miss was the test reading a price between two updates; on its own it settles at the right figure. The gang sheet, cart, checkout and account pages all open cleanly there.

**Policies.** Under Pages in the builder: Shipping policy, Return & refund policy, Privacy policy, Terms & conditions, Contact information. Each opens a box of formatted text — bold, italic, two sizes of heading, bulleted and numbered lists, links — with an outline to start from. Underneath, a policy is an ordinary page at a fixed address with one block of formatted text, so it is saved to the draft, goes live on Publish, can be linked from a menu, and is laid out for a phone like every other page. Nothing new on the server.

**Found on the way.** `/privacy-policy` was answered by a fixed page from the older editor before the builder was ever asked, so a privacy policy written in the builder could not be seen. The builder's page comes first now, as it already did for About and Contact. And headings inside formatted text had no space above them on the shop; they do now.

**On screens.** Read at six widths from 320 to 1440 px: nothing sideways, a long unbroken address wraps, headings larger and bolder than the text, both kinds of list marked, and the text kept to a readable width on a desktop.

## Outcome

- ✅ Impact: the five policies can be written in a minute and published with the site; the switch to the builder site leaves ordering as it is.
- 🧪 Tests: as listed, on the local test database only.
- 📁 Files: as listed. No backend change, no migration.
- 🔁 Next prompts: the switch itself tomorrow; the ImageKit keys still to be replaced; linking the policies from the footer menu.
- 🧠 Reflection: the last check in the list — "a policy nobody wrote has no page" — is the one that found the fixed page sitting in front of the builder's.

## Evaluation notes (flywheel)

- Failure modes observed: a stale dev cache answering "not found" for every page but the home page, after temporary pages were removed; a test reading a value between two updates.
- Graders run and results (PASS/FAIL): all PASS as listed, the one miss explained and re-run.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add the builder's reserved-address list to match every fixed page the shop has (print-guide, quote and others still answer before the builder).
