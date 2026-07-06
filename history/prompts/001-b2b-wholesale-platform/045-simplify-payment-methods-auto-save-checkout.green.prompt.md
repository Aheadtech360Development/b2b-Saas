---
id: "045"
title: Simplify Payment Methods Auto-Save on Checkout
stage: green
date: 2026-03-26
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Remove add-card form from Payment Methods page; auto-save card after checkout
labels: ["payment-methods","checkout","qb-payments","simplification"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/account/payment-methods/page.tsx
  - backend/app/api/v1/checkout.py
  - backend/app/api/v1/account.py
tests:
  - docker logs afapparel_backend --tail 4 (Application startup complete)
---

## Prompt

Simplify Payment Methods page — remove "Add New Card" form. Cards auto-save after checkout.

## Response snapshot

### Frontend: `payment-methods/page.tsx` (rewritten)
- Removed: `CardForm` interface, `EMPTY_CARD_FORM`, `US_STATES`, `inputCls`, `formatCardNumber`, `showForm` state, `form` state, `saving` state, `handleZipLookup`, `handleAddCard`, add button in header, entire add-card form block, "Add your first card" link.
- Kept: card list, Set Default + Remove buttons per card, `loadMethods`, `handleSetDefault`, `handleDelete`.
- Empty state now reads: "No saved cards yet. Cards are automatically saved when you complete a checkout."

### Backend: `checkout.py` — enhanced auto-save
Replaced conditional `if payload.save_card and payload.qb_token and payload.qb_customer_id` with:
```python
if payload.qb_token:
    try:
        company = (await db.execute(...)).scalar_one_or_none()
        qb_cust_id = payload.qb_customer_id or (company.qb_customer_id if company else None)
        if qb_cust_id:
            qb_pay.save_card(qb_cust_id, payload.qb_token)
    except Exception:
        pass  # non-fatal
```
Now saves automatically whenever a qb_token is used, looking up company's QB customer ID from DB if not supplied in payload.

### Backend: `account.py` — removed POST `/account/payment-methods`
Entire ~50-line `add_payment_method` endpoint removed. Cards are now only saved via checkout flow.

## Outcome

- ✅ Payment Methods page simplified — no add-card form
- ✅ Checkout auto-saves card to QB wallet using company's stored qb_customer_id
- ✅ `POST /account/payment-methods` removed — no confusion about two save paths
- ✅ Backend restarted cleanly
- 📁 Files: payment-methods/page.tsx, checkout.py, account.py
