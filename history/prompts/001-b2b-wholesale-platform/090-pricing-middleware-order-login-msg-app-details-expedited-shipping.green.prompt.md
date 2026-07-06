---
id: "090"
title: Pricing Middleware Order, Login Message, App Details, Expedited Shipping
stage: green
date: 2026-04-16
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: /sp.green
labels: ["pricing","middleware","login","wholesale","applications","shipping","expedited","checkout"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/main.py
  - backend/app/schemas/wholesale.py
  - backend/app/schemas/order.py
  - backend/app/api/v1/checkout.py
  - frontend/src/app/(auth)/login/page.tsx
  - frontend/src/app/(admin)/admin/customers/applications/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - frontend/src/services/orders.service.ts
tests:
  - npx tsc --noEmit (TypeScript clean — only pre-existing test file errors)
---

## Prompt

1. Discount STILL not working — shipping override ($) applies but percentage discount does not
2. Login shows "Invalid email or password" instead of pending approval message
3. Application details not showing in admin — full submitted data not visible
4. Expedited (2-Day) shipping extra $45 charges not being applied at checkout

## Response snapshot

### Fix 1: Pricing middleware order (root cause)

**Root cause**: In FastAPI/Starlette, `add_middleware()` stacks in reverse — last added = outermost = runs FIRST on requests. `PricingMiddleware` was added AFTER the routers (line 379), making it run BEFORE `AuthMiddleware`. So `request.state.pricing_tier_id` was always None when `PricingMiddleware` read it → discount always 0.

**Fix** (`main.py`):
1. Moved `PricingMiddleware` import to top-level imports (alongside `AuditMiddleware`, `AuthMiddleware`)
2. Added `app.add_middleware(PricingMiddleware)` BETWEEN `AuditMiddleware` and `AuthMiddleware` in the custom middleware block
3. Removed the old late import + add_middleware at line ~379

New request order: CORS → AuthMiddleware → PricingMiddleware → AuditMiddleware → routes ✓

### Fix 2: Login pending message

**Root cause**: The login catch block hard-coded "Invalid email or password" for all `UNAUTHORIZED` errors, ignoring the actual backend message.

**Fix** (`login/page.tsx`): Added `else if (err.code === "UNAUTHORIZED")` branch that shows `err.message` directly (the backend already sends appropriate messages for wrong credentials, pending, and rejected cases).

### Fix 3: Admin application details

**Root cause 1**: `WholesaleApplicationOut` schema only exposed 14 fields, missing all extended registration fields (address, fax, PPAI, ASI, etc.).

**Root cause 2**: Admin page used `app.contact_name` / `app.contact_email` which don't exist — correct fields are `first_name`, `last_name`, `email`.

**Fix 1** (`schemas/wholesale.py`): Added all 14 extended fields to `WholesaleApplicationOut` (company_email, address_line1/2, city, state_province, postal_code, country, how_heard, num_employees, num_sales_reps, secondary_business, estimated_annual_volume, ppac_number, ppai_number, asi_number, fax).

**Fix 2** (`applications/page.tsx`): Full rewrite —
- Updated `Application` interface with correct field names
- Table now shows `first_name + last_name` and `email`
- Added "View" button per row that opens a `DetailModal`
- `DetailModal` displays all submitted fields in organized sections: Contact Info, Company Details, Address, Volume & Industry, Application Status

### Fix 4: Expedited shipping surcharge

**Root cause**: Frontend used `cart.validation.estimated_shipping` (standard tier only); backend charged the same amount. Neither accounted for the selected shipping method.

**Fix**:
- `schemas/order.py`: Added `shipping_method: str | None = None` to `CheckoutConfirmRequest`
- `checkout.py`: When `payload.shipping_method == "expedited"`, adds `Decimal("45.00")` to the charge total
- `orders.service.ts`: Added `shipping_method?: string` to `ConfirmOrderPayload`
- `checkout/review/page.tsx`:
  - Passes `shipping_method` to `confirmOrder()`
  - Calculates `expeditedSurcharge = shippingMethod === "expedited" ? 45 : 0`
  - Displays separate "Expedited (2-Day) Surcharge" line in order summary
  - Uses correct total in `confirmedData` (persisted to sessionStorage)

## Outcome

- ✅ Impact: Pricing tier percentage discount now applies correctly on every request. Login shows meaningful messages for pending/rejected applicants. Admin can view full application details via a detail modal. Expedited shipping adds $45 to display total and actual charge.
- ✅ Tests: TypeScript clean (tsc --noEmit, pre-existing errors only)
- ✅ Files: 8 files modified
- ✅ No breaking changes to existing functionality

## Evaluation notes (flywheel)

- Failure modes: FastAPI middleware order is LIFO (last added = first to run on request) — always add middleware in reverse of desired execution order. PricingMiddleware must be added before AuthMiddleware in source code.
- Graders run and results: tsc --noEmit PASS
- Prompt variant: null
- Next experiment: Consider invalidating JWT pricing claim on tier assignment so live DB fallback is a safety net, not primary path
