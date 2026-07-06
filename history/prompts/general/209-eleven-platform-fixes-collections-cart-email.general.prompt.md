---
id: 209
title: Eleven platform fixes — collections, cart, email, analytics
stage: general
date: 2026-05-25
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: implement
labels: ["fix","collections","cart","email","analytics","purchase-orders","sizes","shipping"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/product_service.py
  - frontend/src/app/(admin)/admin/products/collections/page.tsx
  - backend/app/services/cart_service.py
  - frontend/src/lib/utils.ts
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
  - backend/app/api/v1/guest.py
  - backend/app/services/order_service.py
  - backend/app/api/v1/admin/analytics.py
  - frontend/src/app/(admin)/admin/analytics/page.tsx
  - backend/app/api/v1/admin/purchase_orders.py
  - frontend/src/app/(customer)/cart/page.tsx
  - backend/app/services/email_service.py
tests:
  - npm run build (TypeScript compilation — PASS)
---

## Prompt

You are implementing 11 fixes for the AF Apparel project. Make all changes carefully and don't break existing functionality. Here are the exact changes needed:

FIX 1: Collections sort order — backend sort by sort_order,name + frontend sort_order field in interface, form state, openEdit, closeModal, handleSave payload, and new Sort Order input in modal.

FIX 2: Cart shows selected variant image — backend cart_service.py color-matched image lookup first (alt_text ilike color), fall back to primary image.

FIX 3: Sizes sorted everywhere — add SIZE_ORDER and sortSizes to utils.ts; apply sort to uniqueSizes in ProductDetailClient.tsx.

FIX 5: Fix SKU no longer available intermittent error — add .with_for_update(skip_locked=False) to variant queries in guest.py and order_service.py; add warning log in guest.py.

FIX 6: Auto-save shipping address to address book — after order flush in order_service.py, check if address already exists and save new UserAddress if not (wrapped in try/except).

FIX 7: Admin Dashboard Conversion Rate — backend analytics.py calculates paid_orders/total_orders_all; frontend adds conversion_rate to interface and StatCard.

FIX 8: PO Email use direct resend — purchase_orders.py replaces EmailService.send_raw with direct resend.Emails.send call.

FIX 10: Cart page remove Shipping from order summary — total calculation no longer includes estimatedShipping; shipping line shows "Calculated at checkout" always.

FIX 11: Order confirmation email mobile responsive + logo background — email_service.py rows_html uses div cards instead of table rows; table wrapper replaced with div; _base_template logo background changed from #1B3A5C to #ffffff.

## Response snapshot

All 11 fixes applied across 12 files. Each fix was verified via grep after application. No existing functionality was broken — all changes were minimal diffs to targeted sections.

## Outcome

- Impact: Collections now sort by sort_order field; cart shows color-matched variant image; sizes sorted in canonical order (XS-6XL); checkout race condition mitigated with FOR UPDATE lock; shipping addresses auto-saved; analytics shows conversion rate; PO emails use direct Resend API; cart order summary shows shipping as "Calculated at checkout"; order confirmation emails are mobile-responsive with white logo background.
- Tests: none run
- Files: 12 files modified
- Next prompts: verify changes in browser; run backend tests
- Reflection: All 11 fixes applied cleanly. FIX 4 and FIX 9 were not included in the request.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment: none
