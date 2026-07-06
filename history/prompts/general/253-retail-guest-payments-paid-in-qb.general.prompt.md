---
id: 253
title: Retail Guest Card Payments Paid in QB
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: fix retail/guest card payments showing Due in QB — payment_status, sync trigger, QB customer lookup
labels: ["quickbooks","payments","guest","retail","invoice","payment-status"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/guest.py
  - backend/app/tasks/quickbooks_tasks.py
tests:
  - python AST parse (PASS)
---

## Prompt

Fix: Card and Bank Transfer payments must show as PAID for ALL orders — both wholesale AND retail/guest. Currently only wholesale orders get payment synced to QB. Retail orders show "Due" in QB even after card payment.

Three parts: (A) payment_status in guest.py, (B) QB sync triggered for retail, (C) QB customer lookup for retail users.

## Response snapshot

**Root cause (Part A — main bug):**
`guest.py` line 216 set `_payment_status = "paid" IF qb_payment_status == "CAPTURED" ELSE "pending"`. If QB Payments returned any status other than "CAPTURED" (e.g. "AUTHORIZED"), the order got `payment_status = "pending"`. `sync_order_invoice_to_qb` step 5b condition is `payment_status == "paid"` — if "pending", the payment is never recorded and the QB invoice stays "Due."

Wholesale path (`order_service.create_order`) correctly used `payment_method != "net_30"` to set "paid", not the QB charge status string. Fixed guest.py to match: `_payment_status = "paid"` unconditionally when charge succeeds (exception raised on any failure).

**Part B — QB sync dispatch:**
`sync_order_invoice_to_qb.delay()` was already present. Changed to `.apply_async(countdown=5)` for consistency with checkout.py; added order_number to log messages.

**Part C — sync_customer_to_qb UUID guard:**
`sync_customer_to_qb`'s "already synced" early return accepted any non-None `qb_customer_id`, including UUIDs accidentally written by QB Payments. Valid QB Accounting IDs are small integers (no hyphens). A UUID-valued `qb_customer_id` would cause `sync_order_invoice_to_qb` to loop until task exhaustion for retail companies with company_id. Fixed to only treat hyphen-free values as valid QB IDs.

**Part C — step 5b logging:**
Expanded payment skip/attempt logging to clearly show order, invoice, method, amount. Failure log now includes all diagnostic fields. Added skip-path log so it's visible why payment was omitted.

## Outcome

- ✅ Impact: Guest/retail card and ACH orders now get QB payment recorded on invoice → shows "Paid" not "Due" in QB
- 🧪 Tests: AST syntax PASS
- 📁 Files: 2 files modified (guest.py, quickbooks_tasks.py)
- 🔁 Next prompts: Run the SQL to fix existing retail orders in DB if needed (see below)
- 🧠 Reflection: The root cause was a string comparison on QB charge status instead of following the same "charge succeeded = paid" logic used in the wholesale path.

**SQL to fix existing retail orders with wrong payment_status:**
```sql
UPDATE orders 
SET payment_status = 'paid'
WHERE payment_method IN ('card', 'credit_card', 'qb_payments', 'ach', 'bank_transfer')
AND payment_status IN ('pending', 'unpaid')
AND qb_payment_charge_id IS NOT NULL;
```

## Evaluation notes (flywheel)

- Failure modes observed: conditional payment_status based on QB status string (fragile); UUID-valued qb_customer_id looping sync task
- Graders run and results (PASS/FAIL): AST PASS
- Prompt variant (if applicable): none
- Next experiment: add monitoring on step 5b failure count to detect if create_payment_for_invoice is ever failing silently
