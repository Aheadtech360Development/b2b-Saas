---
id: 113
title: Guest Cart Header Badge No Redirect
stage: general
date: 2026-04-26
surface: agent
model: claude-sonnet-4-6
feature: guest-checkout
branch: main
user: umeradnan7106
command: manual
labels: ["guest-checkout","header","cart-badge","ux","localStorage"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/components/layout/Header.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
tests:
  - none
---

## Prompt

In the customer-facing header/navbar component, the cart icon is not showing for guest/logged-out users. Fix it so the cart icon always shows for all users (both logged-in and guests). For guests, the cart count should be read from af_guest_cart in localStorage and show the total number of items.

In ProductDetailClient.tsx, the handleAddToCart function for guests is calling router.push("/checkout/address") immediately after saving to localStorage, instead of showing a success message and letting the user continue browsing. Fix it so guests get the same experience as logged-in users — show a success message "X units added to cart!" for 4 seconds, then the user can manually click proceed to checkout. Do not auto-redirect on add to cart.

## Response snapshot

**Header.tsx:**
- Added second `useEffect` that fires when `!isLoading && !user` (guest state); reads `af_guest_cart` from localStorage and sums quantities into `cartCount`
- Listens for both `storage` (cross-tab) and `af_guest_cart_updated` (same-tab custom event) to keep badge live without polling
- Changed desktop cart icon condition from `isAuthenticated() && !isAdmin()` → `!isAdmin()` so icon shows for all non-admin users
- Added mobile menu cart link inside the `!isAuthenticated()` block (shows count in parentheses)

**ProductDetailClient.tsx:**
- Removed `router.push("/checkout/address")` from guest branch of `handleAddToCart`
- Replaced commented-out success message with active `setCartMsg({ type: "success", text: \`${totalUnits} unit(s) added to cart!\` })` + `setTimeout(..., 4000)` — identical to authenticated flow
- Dispatches `window.dispatchEvent(new Event("af_guest_cart_updated"))` after writing to localStorage so the header badge updates immediately in the same tab

## Outcome

- ✅ Impact: Guests now see the cart icon in the header with live item count; adding items shows a success toast instead of auto-redirecting; consistent UX between guest and authenticated users
- 🧪 Tests: None automated; manual verification needed
- 📁 Files: 2 files modified
- 🔁 Next prompts: Add "Proceed to Checkout" button on cart page for guests; consider adding a mini cart dropdown on hover
- 🧠 Reflection: Custom event pattern (`af_guest_cart_updated`) bridges same-tab localStorage writes to the Header since native `storage` event only fires in other tabs

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results: none
- Prompt variant: null
- Next experiment: mini cart drawer on cart icon hover
