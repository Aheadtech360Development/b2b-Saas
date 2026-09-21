---
id: 263
title: Order Page Timeline And Tracking Audit
stage: plan
date: 2026-09-22
surface: agent
model: claude-opus-5
feature: order-management
branch: main
user: development.aheadtech360@gmail.com
command: manual audit + proposal
labels: ["orders", "timeline", "order-events", "analytics", "utm", "attribution", "audit", "plan"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/order.py (inspected)
  - backend/app/models/rma.py (inspected)
  - backend/app/api/v1/admin/orders.py (inspected)
  - backend/app/api/v1/orders.py (inspected)
  - backend/app/api/v1/checkout.py (inspected)
  - backend/app/api/v1/admin/integrations.py (inspected)
  - backend/app/core/tenant_settings.py (inspected)
  - backend/app/services/integrations_service.py (inspected)
  - backend/app/services/suppliers/orders.py (inspected)
  - frontend/src/app/(admin)/admin/orders/page.tsx (inspected)
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx (inspected)
  - frontend/src/app/layout.tsx (inspected)
  - frontend/src/components/providers/BrandingProvider.tsx (inspected)
tests:
  - None yet — audit and proposal only, no code changed.
---

## Prompt

(Screenshots of a Shopify order list, order detail, order timeline, More-actions menu and
conversion-details modal were attached.)

First, please review the attached Shopify order page screenshots.

My manager wants our Order page to have similar functionality to Shopify, but **do not copy
Shopify's UI**.

Our existing UI/design system should remain consistent with our platform. We only need to add
the required functionality.

### 1. Order Page

We need to improve our Order page with the important order-management features that Shopify
provides.

The UI should remain consistent with our existing platform.

### 2. Accurate Order Timeline — VERY IMPORTANT

This is one of the most critical requirements.

Every order must have an accurate timeline/history showing exactly when each important event
happened.

For example:

* Order created
* Order confirmed
* Order processing started
* Order fulfilled/shipped
* Order delivered
* Order cancelled
* Return requested
* Return approved
* Return processed
* Refund issued

Each event should store and display its **actual date and time**.

The timeline must update correctly whenever the order status changes.

We must NOT show an incorrect or manually guessed timeline.

The timeline should be based on real order events stored in our system.

### 3. Tracking & Analytics

Our current system does not properly track UTM data.

We need proper tracking similar to an ecommerce platform.

The system should support:

* UTM source
* UTM medium
* UTM campaign
* UTM term
* UTM content

We also need to allow users/admins to connect their own tracking tools.

Required integrations should include:

* Google Analytics
* Microsoft Clarity
* Meta/Facebook Pixel
* Other pixel/tracking IDs where applicable
* Omnisend
* Klaviyo

The goal is that a store/business can connect its own tracking IDs/accounts and track customer
activity and orders correctly.

### 4. Important Requirement

Before making changes, inspect our existing order system, database models, APIs, status flow,
and frontend.

Do not break the existing functionality or existing UI.

Reuse our current architecture and components wherever possible.

The main priority is:

**Accurate order data + accurate order status history/timeline + proper tracking/analytics
data.**

Please first understand the existing implementation and then propose the required changes
before making large changes.

## Response

Audit of the existing implementation, with a three-phase proposal. No code changed yet.

### What exists today

**Timeline.** `orders.timeline` is a JSONB array of
`{status, message, created_by, created_at}`. It is written from eight scattered places, every
one of them a read-modify-write (`UPDATE orders SET timeline = CAST(:tl AS jsonb)`) of the
whole array, so two concurrent writers silently lose each other's entry. The "Order placed"
row on the order page is not stored at all — the frontend fabricates it from `created_at`.
`created_by` is the literal string `"admin"`, never which admin.

**Events that are never recorded.** Order created; order confirmed; cancellation
(`cancel_admin_order` writes no entry and overwrites `notes`); refunds (`refund_admin_order`
writes no entry); every RMA transition; label purchased; delivered (nothing in the system
ever sets `delivered` except the S&S path).

**Order page.** Has: status change, tracking, direct-carrier labels (UPS/FedEx/USPS), rate
shopping, add/remove items, cancel, Stripe refund, invoice send, mark paid, notes, comments,
CSV export, PDFs, supplier PO card. Missing: refund history, returns on the order, tags,
archive, staff identity on actions, restock on cancel, delivered automation.

**Tracking/analytics.** Nothing. No UTM capture anywhere in backend or frontend, and no
GA/Clarity/Pixel/Klaviyo/Omnisend. The generic per-brand integrations registry
(`integrations_service.PROVIDERS` + the tenant-scoped `integrations` settings key) exists but
is built for secret credentials with a `verify()` call, not for public analytics IDs the
storefront must read.

### Proposal

1. **`order_events` table** (migration 0039) as the single append-only source of truth:
   `order_id, type, message, actor_type, actor_id, actor_name, meta JSONB, occurred_at`.
   One `order_events.record()` service; every existing call site switched to it; the old
   `orders.timeline` dual-written for one release so nothing that reads it breaks. The
   migration backfills from `orders.timeline`, `created_at`, `shipped_at`, `invoice_sent_at`
   and `marked_paid_at`, so no history is lost and no date is invented.

2. **Order page functionality**, in our own design system: refund history, cancel with restock
   and optional refund, returns surfaced and actioned on the order, tags and archive, staff
   identity on every action, and delivered set from a carrier tracking poll.

3. **Attribution and analytics**: first-party `at_attr` cookie capturing `utm_*`, `gclid`,
   `fbclid`, referrer and landing page, sent at checkout and stored on the order; a
   "Where this order came from" card plus orders-list filters and CSV columns; a tenant-scoped
   `analytics` settings key with GA4, GTM, Clarity, Meta Pixel, TikTok/Pinterest/Snap,
   Klaviyo and Omnisend IDs; a public `/storefront/analytics` endpoint and a
   `<TrackingScripts />` component that loads only what the brand configured.

Three open questions put to the user before starting: whether partial fulfillment (multiple
shipments per order) is needed, whether server-side conversion APIs (Meta CAPI, Klaviyo) are
in scope, and which phase to build first.
