---
id: "171"
title: Shipping Mismatch, Guest Orders Link, Retail Sidebar
stage: general
date: 2026-05-11
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix 3 issues: shipping display mismatch, guest orders link to account by email, retail account same sidebar as wholesale. Read ALL files first."
labels: ["shipping","guest-checkout","retail","sidebar","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/checkout.py
  - backend/app/api/v1/guest.py
  - backend/app/api/v1/auth.py
  - backend/app/services/order_service.py
  - frontend/src/app/(customer)/account/layout.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
tests:
  - manual: wholesale checkout — QB charge amount matches shipping shown on review page
  - manual: guest checkout — shipping displayed on review page matches shipping charged and stored on order
  - manual: activate retail account after placing guest order — order appears in /account/orders
  - manual: retail user account sidebar — all 14 nav items visible (same as wholesale)
---

## Prompt

Fix 3 issues: shipping display mismatch, guest orders link to account by email, retail account same sidebar as wholesale. Read ALL files first.

1. FIX 1 (Shipping mismatch): Review step shows $15.50 but actual charge is $9.99. Two different shipping values used — one for display, one for calculation. Need single source of truth. Backend must use `payload.shipping_cost` when provided. Also: guest checkout payload doesn't include `shipping_cost`.
2. FIX 2 (Guest orders link): After retail activation, link all previous guest orders with matching email (`Order.guest_email == user.email, Order.placed_by_id == None`) to the new user and company.
3. FIX 3 (Retail sidebar): Retail nav must be IDENTICAL to wholesale — same `NAV_ITEMS` for all users, no conditional hiding based on `account_type`.

## Response snapshot

**Root causes**:
- FIX 1: `checkout.py` QB flow used `cart.validation.estimated_shipping` (recalculated at submit time) instead of `payload.shipping_cost` (the value the user saw on the review page). `order_service.create_order` only fell back to `confirm.shipping_cost` when server-side calculation yielded $0. Guest checkout payload had no `shipping_cost` field at all — backend used `GUEST_SHIPPING_STANDARD` constant regardless of what the frontend showed.
- FIX 2: `activate_account` created Company + CompanyUser but never linked existing `Order` rows that had `guest_email == user.email`.
- FIX 3: `layout.tsx` used `RETAIL_NAV_ITEMS` (6 items) for retail users instead of `NAV_ITEMS` (14 items). All 14 pages already exist.

**`checkout.py`**:
- Changed `base_shipping = cart.validation.estimated_shipping` → `base_shipping = Decimal(str(payload.shipping_cost)) if payload.shipping_cost else cart.validation.estimated_shipping`

**`order_service.py`**:
- Changed `if shipping_cost == Decimal("0") and confirm.shipping_cost and confirm.shipping_cost > 0:` → `if confirm.shipping_cost and confirm.shipping_cost > 0:` (always use client value when provided, not just when server returns $0)

**`guest.py`**:
- Added `shipping_cost: Decimal | None = None` to `GuestCheckoutRequest`
- After calculating from constants, override with `payload.shipping_cost` when provided

**`auth.py` `activate_account`**:
- Added `from sqlalchemy import update as sql_update` to existing sqlalchemy import
- After `db.add(company_user)` and before `db.commit()`: execute bulk `UPDATE orders SET placed_by_id=user.id, company_id=company.id WHERE guest_email=user.email AND placed_by_id IS NULL`

**`layout.tsx`**:
- Removed `RETAIL_NAV_ITEMS` constant
- Changed `const navItems = user?.account_type === "retail" ? RETAIL_NAV_ITEMS : NAV_ITEMS` → `const navItems = NAV_ITEMS`

**`review/page.tsx`** (guest payload):
- Added `shipping_cost: shippingCost > 0 ? shippingCost : undefined` to the guest `/api/v1/guest/checkout` payload

## Outcome

- ✅ Impact: Shipping charge now matches displayed price for both wholesale and guest checkout. Retail activation links historical guest orders to the new account. Retail users see the full 14-item sidebar identical to wholesale.
- 🧪 Tests: Manual verification needed
- 📁 Files: 6 files modified
- 🔁 Next prompts: none
- 🧠 Reflection: The shipping mismatch was a dual-source problem — the QB charge was computed from a server-side re-estimate at submit time rather than trusting the value the user was shown. Making `confirm.shipping_cost` authoritative in both `checkout.py` and `order_service.py` creates a single source of truth. Guest checkout needed a schema field added before the backend could consume it.

## Evaluation notes (flywheel)

- Failure modes observed: QB charge recalculated independently from display value; order_service only used client shipping as last resort; guest checkout schema lacked shipping_cost field; RETAIL_NAV_ITEMS was a reduced copy of NAV_ITEMS
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
