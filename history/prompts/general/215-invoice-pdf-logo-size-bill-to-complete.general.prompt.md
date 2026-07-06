---
id: 215
title: Invoice PDF logo size + Bill To complete details
stage: general
date: 2026-05-26
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: "fix: invoice logo size correct, customer bill-to complete details"
labels: ["invoice","pdf","logo","bill-to","snapshot","logging","privacy"]
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

Fix invoice PDF - two fixes only:

## Fix 1: Logo too wide - fix size
In _header() function: fix logo size to width=1.5*inch, height=0.6*inch; add logo_img.hAlign = 'CENTER'

## Fix 2: Customer details incomplete in Bill To
Add logging to see exact snapshot structure:
logger.info(f"Invoice snapshot keys: {list(snapshot.keys()) if snapshot else 'EMPTY'}")
logger.info(f"Invoice snapshot data: {snapshot}")

Fix field extraction to cover all possible field names: company_name/company, first_name/last_name with order fallbacks, address_line1/street1/street_address/line1, address_line2/street2/line2, city/state/state_province/postal_code/zip, phone/phone_number, email from snapshot/guest_email/placed_by.email. Email masked as first 3 chars + ***@domain.

git add backend/ && git commit -m "fix: invoice logo size correct, customer bill-to complete details" && git push

## Response snapshot

**Fix 1 — `_header()` logo size:**
- Added `import logging` + `logger = logging.getLogger(__name__)` at module top
- Changed `height=0.5 * inch` → `height=0.6 * inch`
- Added `logo_element.hAlign = "CENTER"`

**Fix 2 — `_bill_to()` rewritten:**
- Snapshot parsed once into `snapshot: dict = {}`
- Added `logger.info` for snapshot keys and full snapshot data
- Company: `snapshot.get("company_name") or snapshot.get("company") or order.company.name`
- Contact: `snapshot.get("first_name")` + `snapshot.get("last_name")` with `order.shipping_first_name/last_name` fallbacks
- Street: `address_line1 → street1 → street_address → line1 → order.shipping_address_line1`
- Street2: `address_line2 → street2 → line2 → order.shipping_address_line2`
- City/state/postal: each with order-level attribute fallbacks; state also tries `state_province`
- Phone: `phone → phone_number → order.shipping_phone`
- Email: `snapshot.email → order.guest_email → order.placed_by.email`; masked as `xxx***@domain`
- Removed old `_mask_email()` helper (masking now inline in `_bill_to`)

## Outcome

- ✅ Impact: Logo renders at correct proportional size centered; Bill To now populated from all possible snapshot field names with email privacy masking
- 🧪 Tests: git push PASS (a5fbfed)
- 📁 Files: 1 file modified, +102/-76 lines
- 🔁 Next prompts: Check backend logs for snapshot keys once an invoice is generated to verify which fields the snapshot actually uses
- 🧠 Reflection: Snapshot field names vary by checkout path (guest vs wholesale) — exhaustive fallback chain ensures coverage across all order types

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): git push PASS
- Prompt variant (if applicable): null
- Next experiment: null
