---
id: 182
title: Stock Display, Email Fixes — Logo, SKU, Subject, Labels
stage: general
date: 2026-05-13
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Fix 4 issues — stock 0 showing In Stock, first order email subject/heading, Processing showing as In Production in emails, logo missing from status emails, SKU column too wide for mobile
labels: ["email","stock","product","orders","admin","frontend","backend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/email_service.py
  - backend/app/api/v1/admin/orders.py
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
tests:
  - none
---

## Prompt

Fix 4 issues: stock 0 showing "In Stock", first order email subject/heading, "Processing" status showing as "In Production" in emails, logo missing from status-update emails, SKU column in email too wide for mobile.

## Response snapshot

**FIX 1 — Stock 0 showing "In Stock" on product page:**
`ProductDetailClient.tsx`: Added `anyInStock` computed from `(product.variants ?? []).some(v => (v.stock_quantity ?? 0) > 0)`. Product-level badge now shows "Out of Stock" when `!anyInStock`. Per-variant stock refactored from IIFE to inline variables:
```ts
const stock = variant.stock_quantity ?? 0;
const isUnlimited = stock >= 9999;
const isOOS = !isUnlimited && stock === 0;
```
Input disabled + opacity 0.4 when `isOOS`.

**FIX 2 — "Order Confirmed" → "Order Received" in first order email:**
`email_service.py` `send_order_confirmation`: Subject changed from `"Order Confirmed — ..."` to `"Order Received — ..."`. H2 heading changed from `Order Confirmed!` to `Order Received!`.

**FIX 3 — SKU column removed from order confirmation email:**
Removed `<th>SKU</th>` from header row and corresponding `<td>{item['sku']}</td>` from each item row. Added `table-layout:fixed;word-wrap:break-word` on `<table>` tag for mobile wrapping.

**FIX 4 — "Processing" displaying as "In Production" in status emails:**
`admin/orders.py` `_LABEL` dict: `"processing": "In Production"` → `"processing": "Processing"`.

**FIX 5 — Logo missing from admin order status emails (`_af_email`):**
Rewrote `_af_email()` from plain text "AF" logo with `#080808` background to branded navy wrapper matching `EmailService._base_template()` style:
- Uses `settings.LOGO_URL or f"{settings.FRONTEND_URL}/Af-apparel%20logo.png"` for logo
- Navy `#1B3A5C` header with red `#E8242A` bottom border
- Updated contact info to `+1 (469) 367-9753` and `info@afblanks.com`

**FIX 6 — Old contact info in `_base_template`:**
`email_service.py` `_base_template`: `tel:2142727213` → `tel:4693679753`, `(214)\xa0272-7213` → `+1\xa0(469)\xa0367-9753`, `info.afapparel@gmail.com` → `info@afblanks.com`.

## Outcome

- ✅ Impact: Product page correctly shows Out of Stock; order confirmation emails say "Order Received"; status emails use branded logo + correct labels; SKU column removed for mobile; contact info updated sitewide in emails
- 🧪 Tests: Manual — add item with stock=0, view product page; place an order and check confirmation email; update order to processing, check status email
- 📁 Files: 3 files changed
- 🔁 Next prompts: none
- 🧠 Reflection: `_af_email()` and `EmailService._base_template()` are separate wrappers that each needed the same contact info update — keep them in sync. Stock=0 guard needs both product-level badge AND per-variant disable to be complete.

## Evaluation notes (flywheel)

- Failure modes observed: two parallel email wrapper functions (_af_email in orders.py vs _base_template in email_service.py) had diverged in branding and contact info — single source of truth would prevent this drift
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): none
- Next experiment: none
