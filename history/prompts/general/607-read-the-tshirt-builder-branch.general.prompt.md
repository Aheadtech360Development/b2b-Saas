---
id: 607
title: Read the tshirt-builder branch
stage: general
date: 2026-11-06
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner shows the tshirt-builder branch on GitHub and asks to understand it properly and connect it
labels: ["git", "t-shirt-builder", "review"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/607-read-the-tshirt-builder-branch.general.prompt.md
tests:
 - trial merge of origin tshirt-builder (0fe0bc0, mhassamzahid, 2026-11-06, based on e62d30d, 21 behind main) into a worktree of main c90e3e6: no conflicts; alembic then has two heads (0073_tshirt_designs, 0075_subscription_amount)
 - branch's backend tests/test_tshirt_designs.py 9 passed (local settings); frontend designer-pricing and designer-shirts 19 passed; designer-print-dpi needs the fabric package, not installed here
 - worktree, package link and trial merge removed afterwards
---

## Prompt

(screenshot of GitHub's branch list with tshirt-builder) ye dekho jani thisrt builder ha to meri jan ke tukrey

## Response snapshot

Read the whole branch: a full-screen t-shirt designer at /design on every shop (garments, colours, text with fonts and curves, graphics, own pictures, names and numbers, a layout helper called AI that runs in the browser, sizes and a live quote), saving each design to two new tables and sending a preview and a 300 DPI print PNG per shirt side to ImageKit, with the gang sheet review statuses. Not yet connected: demo garments and demo prices, no admin screen, no cart or checkout, no per-shop switch, and its migration 0073 clashes with live (two heads: Railway would skip the migrations). Proposed: merge now behind an off-by-default per-shop switch with the migration renumbered to 0076, then connect products, prices, an admin screen and the cart. Asked who builds the second part.

## Outcome

- ✅ Impact: the owner knows what the branch does, what it lacks and the safe way to bring it in.
- 🧪 Tests: listed above.
- 📁 Files: this record.
- 🔁 Next prompts: the owner's go for step one, and who does step two.
- 🧠 Reflection: the branch merges cleanly as text; the migration clash only shows in alembic's heads.
