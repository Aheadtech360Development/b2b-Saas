---
id: 635
title: What now, publish and switch
stage: general
date: 2026-11-11
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner confused: sidequest.printcopilot.co still shows the default "Quality Wholesale Products" storefront (now with the imported categories)
labels: ["visual-builder", "demo-store", "go-live"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none
tests:
 - none (read where the switch lives: SiteEditor PublishDialog, "Switch the shop to the builder site", only after a publish)
---

## Prompt

ab kia krun bhai kch smjh hi nh arha ha yar

(screenshot: sidequest.printcopilot.co, the default storefront: Sidequest wordmark, Shop All, "Quality Wholesale Products, Direct to Your Business", Shop by Category with Accessories, Bottoms, Drop 08: Nocturnal, Hoodies & crews)

## Response snapshot

One step left: the shop still shows its built-in design because it was never switched to the builder site. Website builder, Publish (top right), Publish in the window, then "Switch the shop to the builder site" in the Published window, yes; the badge turns from "Not live yet" to "Live"; refresh the shop. If the Publish window lists problems, send a screenshot.

## Outcome

- ✅ Impact: the owner has the single remaining step in plain clicks.
- 🧪 Tests: none.
- 📁 Files: none.
- 🔁 Next prompts: owner publishes and switches; the pending preview fix (2a3b8a6) waits for a push yes.
- 🧠 Reflection: the switch exists only inside the Published window; an owner who closes it never sees it again until the next publish.
