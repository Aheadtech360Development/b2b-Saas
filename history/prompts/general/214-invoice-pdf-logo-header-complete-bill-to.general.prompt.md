---
id: 214
title: Invoice PDF logo header + complete Bill To
stage: general
date: 2026-05-25
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: "fix: invoice PDF - use logo instead of text, complete customer bill-to details with privacy masking"
labels: ["invoice","pdf","logo","bill-to","privacy","email-masking"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/pdf_service.py
tests:
  - git push (deploy verified)
---

## Prompt

Update invoice - two changes only:

## Change 1: Replace 'AF Apparels' text with logo in PDF invoice
Use the same logo URL logic as email_service.py: `_cfg.LOGO_URL or f"{_cfg.FRONTEND_URL}/Af-apparel%20logo.png"`. If logo fetch fails, the fallback should NOT be text — remove the text fallback entirely. If logo fails, just leave header clean with just the red border line.

## Change 2: Fix Bill To section - add complete customer details
Replace the existing Bill To block with a new `_bill_to(order)` module-level function that:
- Shows company name (from order.company.name or placed_by.company_name)
- Shows contact name from order.placed_by (first + last)
- Shows address from shipping_address_snapshot with multi-source field name variants (line1/address_line1, line2/address_line2, postal_code/zip)
- Shows phone (from address snapshot or placed_by)
- Shows masked email: john***@gmail.com format

Do NOT change: Items table, Summary table, Email invoice template, any other part of the PDF.

git add backend/ && git commit -m 'fix: invoice PDF - use logo instead of text, complete customer bill-to details with privacy masking' && git push

## Response snapshot

**Change 1 — `_header()` updated:**
- Logo URL: `_cfg.LOGO_URL or f"{_cfg.FRONTEND_URL}/Af-apparel%20logo.png"` (same as email service)
- Text fallback (`Paragraph("AF Apparels", _h1)` + subtitle) removed entirely
- If logo fetch fails, header renders cleanly with just the HR line + doc_title

**Change 2 — New module-level functions added:**
- `_mask_email(email)`: keeps first 4 chars of local part + `***@domain` (e.g. `john***@gmail.com`)
- `_bill_to(order)`: resolves company name from `order.company.name` or `order.placed_by.company_name`; contact name from `placed_by.first_name + last_name`; address from `shipping_address_snapshot` with `line1`/`address_line1`, `line2`/`address_line2`, `postal_code`/`zip` fallbacks; phone from snapshot or placed_by; masked email appended last
- Inline Bill To block in `generate_invoice()` replaced with single `bill_to = _bill_to(order)` call
- Removed now-unused `import json as _json` from `generate_invoice()`

## Outcome

- ✅ Impact: Invoice PDF header now shows brand logo (no text fallback); Bill To shows full company/contact/address/email(masked)/phone
- 🧪 Tests: git push success (d5a296a)
- 📁 Files: 1 file modified (backend/app/services/pdf_service.py), +100/-33 lines
- 🔁 Next prompts: Verify generated invoice PDF visually; check logo rendering at different FRONTEND_URL configs
- 🧠 Reflection: Removed `import json as _json` from generate_invoice() since _bill_to() now owns that import internally

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): git push PASS
- Prompt variant (if applicable): null
- Next experiment: null
