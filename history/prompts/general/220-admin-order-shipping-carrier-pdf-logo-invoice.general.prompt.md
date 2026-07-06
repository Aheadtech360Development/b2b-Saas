---
id: 220
title: Admin order shipping banner, carrier disable, tracking PDF, invoice fix, logo 50px
stage: general
date: 2026-05-29
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: "fix: show customer shipping selection, disable other carriers, real tracking number, invoice PDF download, logo 50px all PDFs"
labels: ["admin","shippo","carrier","pdf","invoice","packing-slip","logo","tracking"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - backend/app/services/pdf_service.py
  - backend/app/api/v1/orders.py
tests:
  - npx tsc --noEmit (PASS — only 2 pre-existing test file errors)
  - git push PASS
---

## Prompt

Fix 5 specific issues in admin orders and PDF files.

Fix 1: Show customer's selected shipping in admin order detail — enhance banner to show carrier, service, cost, and rate_id.
Fix 2: Only selected carrier active, others disabled — when order.carrier is set, disable the non-customer carrier buttons (opacity 0.4, cursor not-allowed).
Fix 3: Show real tracking number (not XXXX) — no masking found in UI; added tracking number + carrier rows to packing slip PDF via _order_meta extra_rows.
Fix 4: Fix Invoice PDF download error — add empty bytes check + improved error message detail.
Fix 5: Logo size in ALL PDFs — 50×50 points, hAlign CENTER.

## Response snapshot

**admin/orders/[id]/page.tsx:**
- Added `const _carrierMap` + `const customerCarrier` (derived from `order.carrier`) near other derived constants
- Customer selected banner updated: two-line display (label + carrier/service/cost) + conditional rate_id row `{ fontSize: "11px", color: "#7A7880" }`
- Carrier grid: computed `isCustomerChoice = customerCarrier === carrier.id` and `isDisabled = !!customerCarrier && !isCustomerChoice`; disabled divs get `opacity: 0.4`, `cursor: "not-allowed"`, muted border/background; `onClick` guards with `!isDisabled`

**pdf_service.py:**
- `generate_pack_slip`: added `slip_extra = []`; appends `["Tracking #", order.tracking_number]` and `["Carrier", order.carrier]` if present; passes `extra_rows=slip_extra or None` to `_order_meta`
- `_header()`: logo changed from `width=1.5*inch, height=0.6*inch` to `width=50, height=50` (50 points ≈ 0.694 inch square); `hAlign = "CENTER"`

**orders.py:**
- Invoice try/except: added `if not pdf: raise ValueError("PDF generation returned empty bytes")` before `_pdf_response` call; improved error message to `"PDF generation failed: {str(e)}"`

## Outcome

- ✅ Impact: Admin now sees exactly which carrier/service/rate_id the customer selected; non-customer carriers are visually disabled; packing slip PDF shows tracking number and carrier when shipped; invoice PDF errors now log full traceback with meaningful 500 message; all PDF logos are now square 50pt centered
- 🧪 Tests: TypeScript PASS (0 new errors); git push PASS (8b790e8)
- 📁 Files: 3 files modified, +36/-9 lines
- 🔁 Next prompts: Check Railway logs for invoice PDF error to see exact root cause; verify packing slip shows tracking on shipped orders; test carrier button disabling on an order that has shipping_carrier set
- 🧠 Reflection: No actual tracking masking existed — the `generateTrackingNumber()` function was for pre-filling the legacy manual shipping input (dead code since Shippo), not for display masking. Fix 3 was redirected to adding tracking to the packing slip PDF which was the useful missing feature.

## Evaluation notes (flywheel)

- Failure modes observed: User suspected masking code that didn't exist; important to audit before assuming
- Graders run and results (PASS/FAIL): TypeScript PASS
- Prompt variant (if applicable): null
- Next experiment: null
