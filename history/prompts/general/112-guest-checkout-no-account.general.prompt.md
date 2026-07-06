---
id: 112
title: Guest Checkout No Account Required
stage: general
date: 2026-04-24
surface: agent
model: claude-sonnet-4-6
feature: guest-checkout
branch: main
user: umeradnan7106
command: manual
labels: ["guest-checkout","retail","no-auth","order-tracking","admin-orders"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/migrations/versions/o8p9q0r1s2t3_add_guest_order_fields.py
  - backend/app/models/order.py
  - backend/app/schemas/order.py
  - backend/app/api/v1/guest.py
  - backend/app/main.py
  - backend/app/middleware/auth_middleware.py
  - backend/app/api/v1/admin/orders.py
  - frontend/src/app/(customer)/cart/page.tsx
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - frontend/src/app/(customer)/checkout/payment/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - frontend/src/app/(customer)/checkout/confirmed/page.tsx
  - frontend/src/app/(customer)/track-order/page.tsx
  - frontend/src/services/admin.service.ts
  - frontend/src/app/(admin)/admin/orders/page.tsx
tests:
  - none
---

## Prompt

Implement guest checkout (no account required) for the AF Apparels platform. Retail/guest users can browse, add to cart, and complete purchase without logging in.

Backend:
1. Alembic migration: add guest_email, guest_name, guest_phone, is_guest_order columns to orders table; make company_id and placed_by_id nullable
2. POST /api/v1/guest/checkout (public) — validate stock, charge QB Payments token, create Order, send confirmation email
3. GET /api/v1/guest/orders/{order_number}?email={email} — order tracking

Frontend:
4. Cart page reads af_guest_cart localStorage for unauthenticated users
5. Checkout address page shows guest form (name, email, phone) for guests; saves to sessionStorage
6. Checkout payment page shows QB form only for guests (no saved cards)
7. Checkout review page calls guest endpoint; clears storages on success
8. Confirmed page — Track Order link for guests
9. New /track-order page — form + order status display
10. Admin orders — Guest Orders tab, LEFT JOIN for guest orders, guest badge on rows

## Response snapshot

**Backend:**
- Migration `o8p9q0r1s2t3`: makes `company_id` and `placed_by_id` nullable; adds `guest_email`, `guest_name`, `guest_phone`, `is_guest_order` columns to `orders`
- `Order` model: `company_id/placed_by_id` → `Optional[UUID]`; 4 new guest fields; relationships → `Optional`
- `AdminOrderListItem` schema: `company_name: str | None`; added `is_guest_order`, `guest_email`, `guest_name`
- `AdminOrderDetail` schema: `company_id: UUID | None`; added guest fields
- `guest.py`: `POST /api/v1/guest/checkout` (MSRP pricing, QB charge, order creation, email); `GET /api/v1/guest/orders/{order_number}` (lookup by email)
- `auth_middleware.py`: `/api/v1/guest/*` added to public paths
- `main.py`: guest router registered
- `admin/orders.py`: outerjoin for LIST and GET; guest_only filter param; customer enrichment from guest fields

**Frontend:**
- `cart/page.tsx`: detects auth state; loads `af_guest_cart` localStorage for guests; `buildGuestCart()` helper; guest remove; hides coupon + template for guests
- `checkout/address/page.tsx`: guest form with Full Name, Email, Phone fields; saves to `sessionStorage("af_guest_checkout")`; flat $9.99 shipping for guests
- `checkout/payment/page.tsx`: skips saved cards for guests, shows QB form directly; `guestSubtotal` from localStorage
- `checkout/review/page.tsx`: shows guest cart items; calls `apiClient.post("/api/v1/guest/checkout")`; clears `af_guest_cart` + `af_guest_checkout` on success; stores `isGuest: true` in confirmed data
- `checkout/confirmed/page.tsx`: "Track Your Order" link for guests (reads `isGuest` from `af_confirmed_order` sessionStorage)
- `track-order/page.tsx`: new page with order number + email form; calls `/api/v1/guest/orders/...`; shows status, items, totals
- `admin/orders/page.tsx`: All Orders / Guest Orders tabs; `is_guest_order` badge; guest name+email in company column
- `admin.service.ts`: `listOrders` accepts `guest_only` param

## Outcome

- ✅ Impact: Guests can now complete full retail checkout without creating an account; admins can filter/view guest orders; guests can track orders by number + email
- 🧪 Tests: None automated; manual verification needed after `alembic upgrade head`
- 📁 Files: 15 files modified/created across backend and frontend
- 🔁 Next prompts: Run `alembic upgrade head`; add guest order count to admin dashboard; consider rate-limiting guest checkout endpoint

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results: none
- Prompt variant: null
- Next experiment: add MSRP display to product list cards
