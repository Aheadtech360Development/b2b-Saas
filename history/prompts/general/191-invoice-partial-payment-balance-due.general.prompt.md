---
id: 191
title: Invoice Partial Payment Balance Due
stage: green
date: 2026-05-14
surface: agent
model: claude-sonnet-4-6
feature: admin-orders
branch: main
user: umeradnan7106
command: Fix invoice partial payment — only charge balance due (new total minus already paid). Hide resend invoice when paid. Update timeline on all actions.
labels: ["invoice","partial-payment","amount-paid","balance-due","timeline","admin-orders"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/main.py
  - backend/app/models/order.py
  - backend/app/schemas/order.py
  - backend/app/api/v1/orders.py
  - backend/app/api/v1/admin/orders.py
  - backend/app/services/email_service.py
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - frontend/src/app/(customer)/checkout/invoice/[order_number]/page.tsx
  - frontend/src/app/(customer)/account/orders/[id]/page.tsx
tests:
  - manual: Send invoice → timeline shows "Invoice sent to {email}" entry
  - manual: Admin Mark as Paid → amount_paid = total, timeline shows amount
  - manual: Customer Pay Now → charges balance_due (not total), amount_paid set to total, payment_status=paid
  - manual: Invoice page shows "Balance Due" breakdown when amount_paid > 0
  - manual: Invoice email shows breakdown rows (Order Total / Amount Paid / Balance Due) when amount_paid > 0
  - manual: Admin Invoice & Payment section hides Send/Resend button when is_fully_paid=true
  - manual: Admin Invoice & Payment shows "PAID IN FULL" badge instead of "PAID"
  - manual: Customer Pay Now banner shows "Pay Balance — $X" when amount_paid > 0
---

## Prompt

Fix invoice partial payment — only charge balance due (new total minus already paid). Hide resend invoice when paid. Update timeline on all actions.

## Response snapshot

**Step 1 — `main.py` startup SQL**: Added `DO $$ BEGIN IF NOT EXISTS ... ALTER TABLE orders ADD COLUMN amount_paid NUMERIC(10,2) DEFAULT 0.00; UPDATE orders SET amount_paid = total WHERE payment_status = 'paid'; END IF; END$$;` to `_ensure_content_tables()`.

**Step 2 — `models/order.py`**: Added `amount_paid: Mapped[Optional[float]]` mapped column. Added `balance_due` property (`max(0, total - amount_paid)`) and `is_fully_paid` property (`balance_due <= 0`).

**Step 3 — `schemas/order.py`**: Added `amount_paid: Decimal | None = None` to `OrderOut` (flows to all order responses). Added `balance_due: Decimal | None = None` and `is_fully_paid: bool = False` to `AdminOrderDetail` (read from ORM properties via `from_attributes=True`).

**Step 4 — `admin/orders.py` `mark_order_paid`**: Updated raw SQL to also set `amount_paid = COALESCE(total, 0)`. Enriched timeline message: `"Payment received — marked as paid ($X.XX)"`.

**Step 5 — `admin/orders.py` `send_invoice_email`**: Added timeline entry `{status: "invoice_sent", message: "Invoice sent to {email}"}` appended to order timeline. Combined with `invoice_sent_at` update in a single SQL statement.

**Step 6 — `api/v1/orders.py` `pay_invoice`**: Computes `balance_due = total - amount_paid`. Charges `float(balance_due)` instead of `float(total)`. Returns 400 if `balance_due <= 0`. Sets `amount_paid = total` and `payment_status = 'paid'` after successful charge. Timeline message includes charge amount.

**Step 7 — `api/v1/orders.py` `get_order_invoice_summary`**: Added `amount_paid` and `balance_due` to public response dict.

**Step 8 — `email_service.py` `send_invoice`**: When `amount_paid > 0`, shows three-row breakdown (Order Total / Amount Paid / Balance Due). Button label changes to `"Pay Balance — $X.XX"`. When no prior payment, shows standard `"Amount Due"` row and `"Pay Now — $X.XX"` button.

**Step 9 — Admin `page.tsx`**: Added `amount_paid`, `balance_due`, `is_fully_paid` to `AdminOrder` interface. Invoice & Payment section: Send/Resend and Mark as Paid buttons hidden when `is_fully_paid`. Shows balance info in subtext when `amount_paid > 0 && !is_fully_paid`. "PAID IN FULL" badge replaces "PAID".

**Step 10 — Customer invoice `page.tsx`**: Added `amount_paid`, `balance_due` to `OrderDetail` interface. Computes `balanceDue` from fields. Summary shows Order Total / Amount Paid breakdown rows when `amountPaid > 0`. "Balance Due" label replaces "Total Due". QBPaymentForm `submitLabel` uses `balanceDue`.

**Step 11 — Customer order detail `page.tsx`**: Added `amount_paid` to `Order` interface. Pay Now banner shows `"Pay Balance — $X"` when `amount_paid > 0`.

## Outcome

- ✅ Impact: Invoice payment now charges only the outstanding balance; admin "Mark as Paid" and invoice send both write timeline entries; admin UI hides invoice actions when fully paid; email and payment page show balance breakdown.
- 🧪 Tests: Manual — test all 8 test cases above.
- 📁 Files: 9 files modified — main.py (startup SQL), order model, order schemas, api/v1/orders.py (pay_invoice + invoice-summary), admin/orders.py (mark_order_paid + send_invoice_email), email_service.py (send_invoice), 3 frontend pages.
- 🔁 Next prompts: None — partial payment tracking complete.
- 🧠 Reflection: `amount_paid` tracks cumulative payments; charging `balance_due` prevents double-charging; Pydantic `from_attributes=True` reads ORM computed properties automatically, so `balance_due` and `is_fully_paid` serialize without extra service code.

## Evaluation notes (flywheel)

- Failure modes observed: charging full total when partial payment already applied; no timeline entry on invoice send; admin UI always showing invoice actions even after full payment
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): null
- Next experiment: null
