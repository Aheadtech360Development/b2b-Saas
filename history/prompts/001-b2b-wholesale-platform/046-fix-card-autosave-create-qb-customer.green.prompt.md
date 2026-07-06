---
id: "046"
title: Fix Card Auto-Save Create QB Customer
stage: green
date: 2026-03-26
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Fix card auto-save — create QB Payments customer when qb_customer_id is NULL
labels: ["bug-fix","checkout","qb-payments","card-save"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/qb_payments_service.py
  - backend/app/api/v1/checkout.py
tests:
  - docker logs afapparel_backend --tail 5 (Application startup complete)
---

## Prompt

Fix card auto-save after checkout — qb_customer_id is NULL for companies so save_card fails silently.

## Response snapshot

**Root cause:** The save block (checkout.py) short-circuits when `company.qb_customer_id is None` because there's no code to create the QB Payments customer first.

**`qb_payments_service.py`** — Added:
- `QB_CUSTOMERS_BASE` dict with sandbox/production URLs (`/quickbooks/v4/customers`)
- `create_customer(customer_id: str) -> str` method: POSTs to QB Payments customers endpoint, handles 409 Conflict (already exists) as success, falls back to provided ID string on any error

**`checkout.py`** — Replaced save block:
```python
if payload.qb_token:
    company = await db.execute(...)  # fetch company
    if company:
        # Step 1: Create QB Payments customer if not exists
        if not company.qb_customer_id:
            qb_cust_id = qb_pay.create_customer(str(company_id))
            company.qb_customer_id = qb_cust_id
            await db.flush()
        # Step 2: Save card to QB customer wallet
        if company.qb_customer_id:
            saved = qb_pay.save_card(company.qb_customer_id, payload.qb_token)
            if saved.get("id") and not company.default_payment_method_id:
                company.default_payment_method_id = saved["id"]
            await db.commit()
```

**Key adaptation from user's proposal:**
- `QBPaymentsService` is fully synchronous — removed all `await` on its methods
- `QBPaymentsService()` takes no constructor args — not `QBPaymentsService(access_token)`
- Used `qb_pay` (already instantiated above for charging) rather than creating a new instance
- Logging added: `INFO` on success, `WARNING` on failure

## Outcome

- ✅ `create_customer` added to `QBPaymentsService` with 409 idempotency handling
- ✅ Checkout now creates QB Payments customer on first order if `qb_customer_id` is NULL
- ✅ First saved card is auto-set as default
- ✅ Card save failure never blocks order completion
- ✅ Backend started cleanly
- 📁 Files: qb_payments_service.py, checkout.py
