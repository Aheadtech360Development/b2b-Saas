---
id: 194
title: PDF SKU Remove, Invoice Payment Terms Remove, Admin Section Fix
stage: green
date: 2026-05-15
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Remove SKU from all PDFs; remove Payment Terms from invoice PDF; fix Invoice & Payment box still showing when paid in admin orders."
labels: ["pdf","sku","invoice","payment-terms","admin-orders","is_fully_paid"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/pdf_service.py
  - backend/app/api/v1/admin/orders.py
tests:
  - manual: Download Order Confirmation PDF — no SKU column
  - manual: Download Invoice PDF — no SKU column, no Payment Terms section
  - manual: Download Packing Slip — no SKU column
  - manual: Download Shipping Confirmation PDF — no SKU column
  - manual: Admin Orders detail for a paid order — Invoice & Payment box is hidden
---

## Prompt

Everywhere on the website where PDFs are being generated and downloaded, remove SKU from them and also remove Payment Terms from invoices. There are Order Confirmations, Invoices, Packing Slips, etc. Also fix: Invoice & Payment box in Admin Dashboard → Orders is still visible when payment is already paid (above Timeline section).

## Response snapshot

**PDF SKU removal — `pdf_service.py`**:
- `_items_table()` (used by Order Confirmation + Shipping Confirmation): removed "SKU" header and `item.sku` data column; col_widths adjusted from 7-col (1.0+2.2+0.8+0.6+0.5+0.85+0.85) to 6-col (2.9+0.9+0.65+0.5+0.85+0.85); right-align index updated from `(4,...)` to `(3,...)`.
- `generate_invoice()`: removed "Style #" header and `item.sku` data column; same col_widths and align-index adjustment. Also removed entire Payment Terms + Payment Instructions block (paragraphs, ACH bank details, reference note).
- `generate_pack_slip()`: removed "SKU" header and `item.sku` data column; col_widths from 6-col (1.0+2.2+0.85+0.65+0.9+0.9) to 5-col (2.9+0.95+0.7+0.9+0.9); right-align index updated from `(4,...)` to `(3,...)`.

**Invoice & Payment section fix — `admin/orders.py` `get_admin_order`**:
- Root cause: `AdminOrderDetail` schema has `is_fully_paid: bool = False` as default, but the endpoint constructor never passed `amount_paid`, `balance_due`, or `is_fully_paid` — so `is_fully_paid` was always `False` regardless of payment status.
- Fix: added `amount_paid=order.amount_paid`, `balance_due=order.balance_due`, `is_fully_paid=order.is_fully_paid` to the `AdminOrderDetail(...)` return call. `is_fully_paid` and `balance_due` are `@property` methods on the Order model.

## Outcome

- ✅ Impact: All generated PDFs (Order Confirmation, Invoice, Shipping Confirmation, Packing Slip) no longer show SKU column; Invoice PDF no longer has Payment Terms or Payment Instructions sections; Invoice & Payment admin box correctly hides for fully paid orders.
- 🧪 Tests: Manual — test all 5 test cases above.
- 📁 Files: 2 files modified — pdf_service.py, admin/orders.py.
- 🔁 Next prompts: None.
- 🧠 Reflection: The is_fully_paid bug was a silent schema gap — the field existed in both the model (as a computed property) and the Pydantic schema, but the endpoint constructor never wired them together, leaving the default False permanently in place.

## Evaluation notes (flywheel)

- Failure modes observed: endpoint constructor not passing computed model properties to Pydantic schema; SKU column present in all PDF document generators
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): null
- Next experiment: null
