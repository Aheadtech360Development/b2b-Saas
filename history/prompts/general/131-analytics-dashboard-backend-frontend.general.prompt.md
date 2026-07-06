---
id: 131
title: Analytics Dashboard — Backend + Frontend
stage: general
date: 2026-04-29
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Build a complete Analytics dashboard for the AF Apparels admin
labels: ["feature","frontend","backend","admin","analytics","recharts"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/analytics.py
  - backend/app/main.py
  - frontend/src/app/(admin)/admin/analytics/page.tsx
  - frontend/src/components/layout/AdminSidebar.tsx
tests:
  - manual: Analytics page loads at /admin/analytics
  - manual: Period selector (Today / 7d / 30d / 90d / Custom) filters all data
  - manual: Overview cards show correct revenue, orders, AOV, customer counts with % change
  - manual: Revenue chart renders dual-axis with Daily/Weekly toggle
  - manual: Order status donut and New vs Returning donut render correctly
  - manual: Top Products table shows product names, units sold, revenue with View links
  - manual: Top Customers table rows navigate to /admin/customers/{id}
  - manual: Orders by State horizontal bar chart renders
  - manual: Analytics sidebar link appears under Overview section
---

## Prompt

Build a complete Analytics dashboard for the AF Apparels admin. Requirements:

**Backend** — `GET /api/v1/admin/analytics`:
- Params: `period` (today|7d|30d|90d|custom), `start_date`, `end_date`
- Return: overview (revenue, orders, AOV, customers, % changes), revenue_chart (daily), order_status_breakdown, top_products (with slug), top_customers, orders_by_state, new_vs_returning
- Only count ACTIVE_STATUSES orders for revenue

**Frontend** — `/admin/analytics`:
- Date range pill buttons + custom date pickers + Refresh
- 6 overview stat cards in 3-col grid with % change arrows
- Revenue line+bar ComposedChart with Daily/Weekly toggle
- Order status breakdown as donut pie chart
- New vs Returning customers donut
- Top Products table (10 rows) with View links
- Top Customers table (10 rows) clickable → customer detail
- Orders by State horizontal bar chart
- Skeleton loading states and error banner
- Add "Analytics" link in admin sidebar under Overview section

## Response snapshot

**Backend** (`analytics.py`):
- `ACTIVE_STATUSES` tuple for revenue filtering
- `_date_range()` computes current + equal-length previous period
- `_pct_change()` with zero-division guard
- Overview query: revenue, orders, guest/wholesale split, distinct companies
- New customers: subquery with `HAVING MIN(created_at) BETWEEN start AND end`
- Daily chart with zero-fill for missing days
- Top products: joined OrderItem → ProductVariant → Product for slug
- Orders by state: raw `text()` SQL with `::json->>'state'` extraction
- Registered in `main.py` under `/api/v1`

**Frontend** (`analytics/page.tsx`):
- `StatCard` component with animated % change indicator
- `SkeletonCard` with CSS pulse animation for loading state
- `ComposedChart` (recharts) with dual axes and `toWeekly()` aggregation helper
- `PieChart` with `innerRadius` for donut effect + `STATUS_COLORS` map
- `BarChart layout="vertical"` for horizontal state bars
- Responsive via `@media` in `<style jsx global>`

**Sidebar** (`AdminSidebar.tsx`):
- Added `TrendingUpIcon` import
- Added `<NavLink href="/admin/analytics" label="Analytics" icon={<TrendingUpIcon size={15} color="currentColor" />} />` under Dashboard

## Outcome

- ✅ Impact: Full analytics visibility for admin — revenue trends, customer metrics, product performance, geographic distribution
- 🧪 Tests: Manual
- 📁 Files: 4 files created/modified
- 🔁 Next prompts: None
- 🧠 Reflection: Raw SQL `text()` was necessary for JSON field extraction from `shipping_address_snapshot`; the staging pattern (period comparison against same-length window) gives meaningful % change deltas for all time ranges

## Evaluation notes (flywheel)

- Failure modes observed: none anticipated
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
