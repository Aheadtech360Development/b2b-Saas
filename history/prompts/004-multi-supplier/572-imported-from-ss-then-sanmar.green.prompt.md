---
id: 572
title: Imported from S&S then SanMar
stage: green
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: 004-multi-supplier
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks what happens with no own Gildan, imported first from S&S and later from SanMar
labels: ["multi-supplier", "sanmar", "explainer"]
links:
  spec: specs/004-multi-supplier/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/suppliers/orders.py
 - frontend/src/components/admin/suppliers/ManualOrders.tsx
tests:
 - local database (scratchpad sourcing_local_check3.py): an order of a SanMar-imported product is listed, marked once, leaves the list, nothing of it goes to S&S
 - sourcing_local_check2.py re-run 18/18
---

## Prompt

agar mere pass apni gildan nh ha saiha mere bhai mene pehle ssactivewear se import kri aur bad mei sanmar se ab kia hoga

## Response snapshot

Today: two separate products (S&S's and SanMar's), the shirt shows twice, each with its own stock; S&S's orders go to S&S, SanMar's are ordered by hand. Found and fixed a gap on the way: SanMar's "Orders to place" listed only SanMar's part of products with sources, not orders of products imported from SanMar (`orders.manual_lines`). After the next update, three steps make it one shirt: Make it my own product on the S&S one, + Add a supplier → SanMar on it, Set it to Draft on the SanMar copy; then stock = S&S + SanMar, the cheaper (or the chosen one) goes first, and own stock later typed in goes before both.

## Outcome

- ✅ Impact: the owner knows the case, and SanMar-imported orders are no longer missed.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push of phase 2 on the owner's yes.
- 🧠 Reflection: walking the owner's real case found a gap the planned cases missed.
