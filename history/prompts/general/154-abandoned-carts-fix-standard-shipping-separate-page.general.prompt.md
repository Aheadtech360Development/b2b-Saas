---
id: "154"
title: Abandoned Carts Fix + Standard Shipping Separate Page
stage: green
date: 2026-05-07
surface: agent
model: claude-sonnet-4-6
feature: ui-fixes
branch: main
user: umeradnan7106
command: fix abandoned carts error, fix guest shipping to use admin standard_shipping setting, create separate Standard Shipping admin page, remove tier discount from order summary, replace USP emojis with icons
labels: ["abandoned-carts","standard-shipping","guest-cart","admin","sidebar","lucide","cart","emoji"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/account/abandoned-carts/page.tsx
  - frontend/src/app/(customer)/cart/page.tsx
  - frontend/src/app/(admin)/admin/standard-shipping/page.tsx
  - frontend/src/app/(admin)/admin/customers/tiers/page.tsx
  - frontend/src/components/layout/AdminSidebar.tsx
  - backend/app/api/v1/guest.py
tests:
  - manual: abandoned carts page shows loading spinner (no longer stuck on empty array truthy bug)
  - manual: guest cart shipping reads from admin standard_shipping setting via GET /api/v1/guest/shipping-estimate
  - manual: order summary has no "Tier Discount (X% applied)" line
  - manual: order summary USPs show Truck/Lock/Phone/Mail icons (no emojis)
  - manual: admin sidebar shows "Standard Shipping" under Marketing
  - manual: /admin/standard-shipping opens standalone page with save button
  - manual: tiers page no longer has Standard Shipping tab
---

## Prompt

In the Customer Dashboard, an error is appearing on Abandoned Carts. Shipping (Standard Ground) is showing correctly for logged-in users, but it is not correct for logged-out users. In the cart, the same logic should apply that we added in the Admin panel under Customers → Discount Groups & Pricing → Standard Shipping. Also, do not keep this under Customers → Discount Groups & Pricing. Create a separate tab for it, just like Discounts etc., and name it Standard Shipping. Show this there: 'Standard Shipping — applies to customers who are not in any discount group and have no shipping tier assigned. Configure a flat rate or bracket-based shipping rate for these customers.' Also mention logged-out users in this sentence as well. On the cart page, we previously had 'Tier Discount (10% applied)' but later we removed all of that. However, in one or two places the data is still saved, so remove it from the Order Summary because we are not using it anymore.

## Response snapshot

1. `abandoned-carts/page.tsx` line 96: `if (loading && !carts)` → `if (loading)` — `carts` initializes as `[]` (truthy), so loading state never rendered.

2. `cart/page.tsx`:
   - Removed `discountPercent > 0` Tier Discount block from OrderSummary
   - Replaced USP emoji array with typed `{ icon: ReactNode; text: string }[]` using TruckIcon/LockIcon/PhoneIcon/MailIcon from `@/components/ui/icons`
   - Guest cart useEffect made async: after building guestCart, calls `GET /api/v1/guest/shipping-estimate?units=X&subtotal=Y`, updates `validation.estimated_shipping` from response; catches errors silently
   - OrderSummary estimatedShipping now reads `Number(cart?.validation?.estimated_shipping ?? (isGuest ? 9.99 : 0))` instead of hardcoding 9.99 for guests

3. `backend/app/api/v1/guest.py`: Added `GET /guest/shipping-estimate` endpoint — reads `standard_shipping` setting from DB, applies flat-rate or bracket logic for given units/subtotal, falls back to `GUEST_SHIPPING_STANDARD` (9.99).

4. `frontend/src/app/(admin)/admin/standard-shipping/page.tsx`: New standalone page with full flat-rate/bracket UI, save button, and info banner mentioning logged-out users.

5. `AdminSidebar.tsx`: Added `TruckIcon` import; added `NavLink href="/admin/standard-shipping"` under Marketing section.

6. `customers/tiers/page.tsx`: Removed all standard shipping state/functions, removed "standard" tab button and tab content section, updated activeTab type to `"groups" | "variants"`.

## Outcome

- ✅ Impact: Abandoned carts loading fixed; guest cart shows real shipping from admin setting; Standard Shipping has its own admin page; Tier Discount removed from order summary; USP emojis replaced with icons
- 🧪 Tests: Manual verification in browser
- 📁 Files: 6 files modified, 1 file created
- 🔁 Next prompts: Guest cart can also pass the shipping estimate to checkout so the same rate shows at order confirmation
- 🧠 Reflection: `!carts` bug is subtle because TypeScript doesn't warn on `![]` — a falsy check on an initialized array always returns false

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
