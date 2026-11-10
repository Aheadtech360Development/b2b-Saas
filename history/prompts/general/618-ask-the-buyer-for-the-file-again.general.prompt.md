---
id: 618
title: Ask the buyer for the file again
stage: general
date: 2026-11-06
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks for a button so the shop can ask for a lost sheet file and the buyer re-sends it on the same order
labels: ["gang-sheets", "production", "customer-portal", "uploads"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/gang_sheets.py
 - frontend/src/services/gangSheets.service.ts
 - frontend/src/app/(admin)/admin/production/[id]/page.tsx
 - frontend/src/app/(customer)/account/gang-sheets/[id]/page.tsx
 - frontend/src/__tests__/ask-for-the-file-again.test.tsx
tests:
 - frontend/src/__tests__/ask-for-the-file-again.test.tsx (5 passed)
 - local walk ask_file_walk.py on printcopilot_local (all pass, everything put back)
---

## Prompt

hn to ab ek waha button bnado take customer file dubara bhjde isi order ke andar ek bnado take mei usse mabgwalunyar file bhai mere kuke ye to msla hogya ha

## Response snapshot

Built it end to end (commit 0be1eaf, not pushed). Production → a print job the customer uploaded themselves has "Ask for the file again": the shop's message (prefilled, editable) is emailed to the customer and the job goes back to them. On the customer's print job page, while it is sent back, "Upload a new file" uploads through ImageKit and puts the file on the same job (same artwork row, so the layout still points at it; a new version), which goes back into review. Only the job's owner, only when the shop asked, only a file this shop stored (POST /gang-sheets/orders/{id}/replace-file: 404 / 409 / 400 otherwise).

## Outcome

- ✅ Impact: order 1011's lost sheet can be asked for and re-sent on the same order.
- 🧪 Tests: 5 frontend tests; a local DB walk through the real API (refusals, the swap, the shop's view, no second swap).
- 📁 Files: gang sheet API, gang sheets service, Production job page, customer print job page, one test file.
- 🔁 Next prompts: the owner's yes to push.
- 🧠 Reflection: the artwork row is updated in place rather than replaced, because the saved layout refers to it by id.
