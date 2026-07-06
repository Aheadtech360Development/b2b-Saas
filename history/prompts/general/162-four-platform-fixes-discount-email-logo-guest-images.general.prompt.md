---
id: "162"
title: Four Platform Fixes — Discount, Email, Logo, Guest Images
stage: general
date: 2026-05-11
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix 4 issues in AF Apparels — discount on total, email shipping, logo in emails/PDFs, guest checkout images"
labels: ["cart","discount","email","pdf","checkout","guest","logo","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/cart/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - backend/app/services/email_service.py
  - backend/app/services/pdf_service.py
tests:
  - manual: apply coupon in cart — discount_amount should be based on subtotal+shipping
  - manual: order confirmation email shows discount row when discount_amount > 0
  - manual: PDF order confirmation shows discount and tax rows
  - manual: email header shows logo image when LOGO_URL env var is set
  - manual: PDF header shows logo image when LOGO_URL env var is set
  - manual: guest checkout review step shows product images
---

## Prompt

Fix 4 issues in AF Apparels. Read ALL relevant files before making changes.

1. Discount applies to Total (subtotal + shipping), not just subtotal
2. Email — add discount row to order confirmation
3. AF Apparels logo in emails and invoices via LOGO_URL setting
4. Checkout step 3 — product images not showing for guest users

## Response snapshot

**Fix 1 (cart/page.tsx)**:
- Lifted `estimatedShipping` computation to CartPage level (was only inside OrderSummary)
- `handleApplyCoupon` now passes `cart_total: subtotal + (hasShippingTier ? estimatedShipping : 0)` to `/api/v1/discounts/validate`
- Removed duplicate `estimatedShipping` computation from OrderSummary prop

**Fix 2 (email_service.py + pdf_service.py)**:
- `send_order_confirmation`: added `discount_row` — shown in green when `order.discount_amount > 0`; inserted between Subtotal and Shipping rows
- `_totals_block` in pdf_service.py: now builds rows dynamically — includes Discount row if > 0, Tax row if > 0 (mirrors invoice's `sum_tbl`)

**Fix 3 (email_service.py + pdf_service.py)**:
- `_base_template` (static method): imports settings lazily, renders `<img src=LOGO_URL>` when set; falls back to text "AF / APPARELS" when not set
- `_header` (module-level function): attempts to download logo from `settings.LOGO_URL` using `urllib.request` with 5s timeout, embeds as ReportLab `Image` (1.5×0.5in); falls back to text on any exception
- Logo file in frontend/public: `Af-apparel logo.png` — set `LOGO_URL` env var to `{FRONTEND_URL}/Af-apparel%20logo.png`

**Fix 4 (checkout/review/page.tsx)**:
- Added `image_url?: string | null` to local `GuestCartEntry` type (was missing, so images were never read)
- Guest item rows: render `<img>` when `item.image_url` is set, with `onError` fallback to hide broken image; show 👕 emoji fallback when no image

## Outcome

- ✅ Impact: Coupon discounts now correctly apply on the full order total including shipping; confirmation emails show discount lines; PDF confirmations include discount/tax; logo image renders in emails/PDFs when LOGO_URL is configured; guest checkout review shows product images
- 🧪 Tests: Manual verification needed
- 📁 Files: 4 files modified
- 🔁 Next prompts: Set LOGO_URL env var in .env / Docker secrets to `{FRONTEND_URL}/Af-apparel%20logo.png`
- 🧠 Reflection: Fix 2 shipping was already dynamic in existing code; the real gap was missing discount row. Fix 4 root cause was type omission — GuestCartEntry in review page had no image_url field

## Evaluation notes (flywheel)

- Failure modes observed: type-omission bug (image_url missing from GuestCartEntry); cross-component data flow issue (estimatedShipping not accessible in handleApplyCoupon)
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
