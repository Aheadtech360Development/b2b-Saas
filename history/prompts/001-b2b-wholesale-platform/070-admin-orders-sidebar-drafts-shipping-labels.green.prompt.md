---
id: "070"
title: "Admin Orders Sidebar Dropdown, Drafts & Shipping Labels Pages"
stage: green
date: "2026-04-06"
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
command: "add orders dropdown with sub-pages in admin panel"
labels: ["admin", "orders", "sidebar", "shipping-labels", "drafts", "navigation"]
links:
  spec: "null"
  ticket: "null"
  adr: "null"
  pr: "null"
files:
  - frontend/src/components/layout/AdminSidebar.tsx
  - frontend/src/app/(admin)/admin/orders/drafts/page.tsx
  - frontend/src/app/(admin)/admin/orders/shipping-labels/page.tsx
  - backend/app/api/v1/admin/orders.py
  - backend/app/schemas/order.py
tests: []
---

## Prompt

Add Orders dropdown with sub-pages to AF Apparels admin sidebar.

Sub-items: All Orders, Drafts, Shipping Labels, Abandoned Checkouts.

Create Drafts page: pending orders table with Confirm + Edit actions.
Create Shipping Labels page: stats cards, filter tabs, full table with package type select, weight input, courier display, label/delivery status badges, print actions.

AdminSidebar: full rewrite from Tailwind to AF Apparels inline style system.

## Response

### AdminSidebar rewrite
- Removed all Tailwind classes; replaced with inline CSS objects (`NAV_LINK_BASE`, `SUB_LINK_BASE`, `SECTION_HEAD`)
- `NavLink` and `SubLink` components defined inside the parent for active state using `usePathname()`
- Orders section: collapsible dropdown controlled by `ordersOpen` state; auto-opens via `useEffect` when `pathname.startsWith("/admin/orders")`
- Chevron rotates 180° when open (`transform: rotate(180deg)`)
- Sub-links: All Orders, Drafts, Shipping Labels, Abandoned Checkouts

### Drafts page (`/admin/orders/drafts`)
- Fetches `GET /api/v1/admin/orders?status=pending&page_size=100`
- Table: Order #, Company, Status, PO #, Items, Total, Created, Actions
- "✓ Confirm" button: PATCH `{ status: "confirmed" }` → optimistic status update in local state
- "Edit" link navigates to `/admin/orders/${id}`
- Empty state, loading state, hover row highlight

### Shipping Labels page (`/admin/orders/shipping-labels`)
- Fetches `GET /api/v1/admin/orders?status=shipped&page_size=100`
- Delivery status inferred: >5 days since shipped_at → "delivered", else "in_transit"
- 4 stat cards: Total Shipments / In Transit / Delivered / Pending Label
- Filter tabs: All / Pending Label / In Transit / Delivered (pill-toggle design)
- Table columns: Order #, Company, Package Type (select), Weight (number input), Courier, Tracking #, Label status badge, Delivery status badge, Shipped date, Actions (Print Label + Packing Slip)
- Header: Export CSV + Print All buttons

### Backend schema extension
- `AdminOrderListItem`: added `tracking_number`, `courier`, `courier_service`, `shipped_at` optional fields
- `list_admin_orders`: constructor now passes these 4 fields from Order model

### Build result
- All 50 pages compiled successfully
- Pre-existing `/checkout/review` dynamic error unrelated to these changes
- New pages: `/admin/orders/drafts` (○ static), `/admin/orders/shipping-labels` (○ static)
