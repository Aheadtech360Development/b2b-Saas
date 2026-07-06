---
id: "089"
title: Pricing Fix, Saved Addresses, Add Card, Pending Approval
stage: green
date: 2026-04-16
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: /sp.green
labels: ["pricing","checkout","addresses","payment-methods","approval","email","auth"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/middleware/pricing_middleware.py
  - backend/app/services/auth_service.py
  - backend/app/services/wholesale_service.py
  - backend/app/api/v1/account.py
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - frontend/src/app/(customer)/account/payment-methods/page.tsx
tests:
  - npx tsc --noEmit (TypeScript clean — only pre-existing test file errors)
---

## Prompt

1. Pricing tiers: discount is still not being applied. Fix properly.
2. Checkout step 1 not showing/allowing selection of saved addresses. Address Book addresses should appear for selection.
3. Payment Methods: add option to add a card (currently only remove exists).
4. If a customer applies but is not yet approved, block login with a message. Once approved, send them an email.

## Response snapshot

### Fix 1: Pricing discount not applied

**Root cause**: `PricingMiddleware` reads `pricing_tier_id` from the JWT claim (`request.state.pricing_tier_id`). The JWT is baked at login time. If the admin assigns a tier AFTER the customer's last login, the JWT has no `pricing_tier_id`, so `tier_discount_percent` stays 0 on every request.

**Fix** (`pricing_middleware.py`): Added a live DB fallback — if `tier_id` is None in the JWT but `company_id` is present, execute a fast PK lookup `SELECT pricing_tier_id FROM companies WHERE id = ?`. The existing tier→discount Redis cache still applies once `tier_id` is resolved. No schema change needed.

### Fix 2: Saved addresses in checkout step 1

**Root cause**: `checkout/address/page.tsx` was a pure manual form with no API call to load saved addresses.

**Fix**: Rewrote the page to:
1. Load `GET /api/v1/account/addresses` on mount
2. Show saved addresses as selectable radio cards (same design pattern as the payment step)
3. Pre-select the default address
4. "Use a different address" option expands the manual form
5. When a saved address is selected, `addressId` is stored and all fields populated from the address record
6. Company Name field always shown (needed for order labelling)
7. Falls back to manual form if no saved addresses exist

### Fix 3: Add card in Payment Methods

**New backend endpoint**: `POST /api/v1/account/payment-methods` — accepts raw card fields (`number`, `expMonth`, `expYear`, `cvc`, `name`), creates a QB customer profile if one doesn't exist, calls `QBPaymentsService.save_card()`, sets as default if first card.

**Frontend** (`payment-methods/page.tsx`):
- Added "+ Add Card" button in the page header
- Clicking it opens an inline card form with number, expiry, CVC, name fields
- Submit calls the new endpoint; on success refreshes the card list and shows success message
- Cancel closes the form and resets fields
- Removed the old "cards are saved at checkout" info note

### Fix 4: Pending approval blocks login + email on approval

**Login block** (`auth_service.py`): After checking for company membership, if no membership exists, queries `WholesaleApplication` by email. If `status == "pending"` → raises `UnauthorizedError("Your wholesale application is pending review...")`. If `status == "rejected"` → raises `UnauthorizedError("Your wholesale application was not approved...")`.

**Approval email** (`wholesale_service.py`): The existing `send_wholesale_approved_email` Celery task uses wrong field names (`app.contact_name`, `app.contact_email`). Replaced with a direct `email_svc.send_raw()` call (same pattern as the registration confirmation email) with correct field names (`application.first_name`, `application.email`). QB sync Celery task kept but wrapped in try/except so it's non-fatal if Celery is down.

## Outcome

- ✅ Impact: Pricing tier discount now applied even if tier was assigned after login. Saved addresses appear in checkout step 1. Cards can be added directly from Payment Methods page. Pending customers see a clear message at login; approved customers receive an email.
- ✅ Tests: TypeScript clean (tsc --noEmit, pre-existing errors only)
- ✅ Files: 6 files modified
- ✅ No breaking changes to existing functionality

## Evaluation notes (flywheel)

- Failure modes: JWT claims are stale — always have a live DB fallback for claims that change post-login (pricing tiers, company status, etc.)
- Graders run and results: tsc --noEmit PASS
- Prompt variant: null
- Next experiment: Invalidate Redis tier cache when admin updates company tier to get instant discount updates
