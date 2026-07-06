---
name: Admin Dashboard and Orders Courier Selection
description: Redesigned admin dashboard with Shopify-style stats/sparkline/alerts, and added courier selector to orders detail page
type: green
stage: green
date: 2026-04-06
feature: 001-b2b-wholesale-platform
surface: agent
model: claude-sonnet-4-6
branch: main
user: RT
id: "069"
labels: ["admin", "dashboard", "orders", "courier", "frontend"]
links:
  spec: "null"
  ticket: "null"
  adr: "null"
  pr: "null"
---

## Prompt

Build Admin Panel Dashboard and Orders page for AF Apparels.

PART 1: Admin Dashboard - Shopify-style stats cards, sparkline chart, alert cards, recent orders table, recent applications with approve/reject.

PART 2: Orders Detail - Add courier selection section (FedEx/UPS/USPS/DHL/Other), service type, tracking number, Mark as Shipped button calling PATCH /admin/orders/:id/status.

## Response

### Files Modified

**`frontend/src/app/(admin)/admin/dashboard/page.tsx`** — full redesign:
- 4 stat cards: Sessions (static), Total Sales, Orders, Conversion Rate — all with ↑/↓ change badges
- `Sparkline` component: SVG polyline + gradient fill, computed from `created_at` timestamps in last 10 orders grouped by day
- `AlertCard` component: pending orders, pending applications, low stock — each links to relevant admin page
- Recent Orders table (10 rows): order#, customer, date, items, total, StatusBadge
- Recent Applications table (5 rows): company, type, date, status + Approve/Reject buttons calling PATCH wholesale-applications/:id/approve|reject
- Data from: sales report, wholesale-applications, inventory report, orders list, pending orders filter

**`frontend/src/app/(admin)/admin/orders/[id]/page.tsx`** — extended:
- `COURIERS` constant: FedEx, UPS, USPS, DHL, Other with service arrays
- Courier grid: 5-col clickable cards, blue active state, `selectedCourier` / `setSelectedService("")` on change
- Service dropdown + tracking number input (shown when courier selected)
- `handleMarkShipped`: PATCH `/api/v1/admin/orders/${id}/status` with `{status, tracking_number, courier, courier_service}`
- Pre-fills from `order.courier`/`order.courier_service` when order already shipped
- Full AF Apparels design system redesign (inline styles, Bebas headings, StatusBadge component)

## Outcome

- Build: PASS (no TS errors, 48 pages)
- Commit: `b827559` — "feat: admin dashboard redesign and orders detail courier selection"
- Pushed to: origin/main
