---
id: 386
title: Admin redesign Orders list and Order page
stage: general
date: 2026-10-12
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: build the Orders list and the Order page from the three screenshots, with nothing static and every button working, on localhost only
labels: ["admin-redesign", "orders", "order-page", "order-progress", "order-queues", "shipping-labels", "returns", "local-only"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/order_progress.py (new)
 - backend/app/services/order_queues.py
 - backend/app/services/order_events.py
 - backend/app/services/admin_home.py
 - backend/app/api/v1/admin/orders.py
 - backend/app/schemas/order.py
 - backend/app/core/tenant_settings.py
 - backend/tests/test_order_progress.py (new)
 - backend/tests/test_order_list_filters.py (new)
 - backend/tests/test_admin_home.py
 - frontend/src/app/(admin)/admin-shell.css
 - frontend/src/app/(admin)/admin/orders/page.tsx
 - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
 - frontend/src/app/(admin)/admin/orders/drafts/page.tsx
 - frontend/src/app/(admin)/admin/orders/shipping-labels/page.tsx
 - frontend/src/app/(admin)/admin/returns/page.tsx
 - frontend/src/components/admin/orders/OrdersFrame.tsx (new)
 - frontend/src/components/admin/orders/BuyLabelsDialog.tsx (new)
 - frontend/src/components/admin/OrderRefunds.tsx
 - frontend/src/components/layout/AdminSidebar.tsx
 - frontend/src/lib/orderPrint.ts (new)
 - frontend/src/services/admin.service.ts
 - frontend/src/__tests__/order-artwork-open.test.tsx (new)
tests:
 - backend, pytest --noconftest, no database — tests/test_order_progress.py, tests/test_order_list_filters.py, tests/test_admin_home.py — 31 passed
 - frontend, vitest, full run before the last two guards — 488 of 490 passed; the 2 that failed are src/__tests__/api-client.test.ts, whose test and code are the same as on main
 - frontend, vitest — src/__tests__/order-artwork-open.test.tsx (new, 6) and src/__tests__/order-money-and-print-files.test.tsx (10) — 16 passed
 - frontend, tsc --noEmit — only the 2 old errors in src/__tests__/api-client.test.ts
 - frontend, next build — passed (run beside the dev server; nothing deployed)
 - local API, demo shop — every tab's count equals its list's total and its rows; unpaid 10 + paid 33 + refunded 0 = 43; pickup 1 + ship 42 = 43; notes, packed (twice is once, refused on a shipped order), saved views, rates without a weight
 - browser engine, localhost, demo shop — tabs, search, Payment, Method, Date range, save / apply / remove a view, bulk Confirm (To confirm 4 to 2), bulk Mark shipped, Buy labels (no carrier path), pick list, packing slip, Export (43 rows; Unpaid 10 = the list's 10), the panel, and on the order page Confirm, Move to processing, a note, Edit items add and remove (43.59 to 57.59 to 43.59), Mark packed, Mark shipped with tracking and no email, Mark delivered, a pickup order ready then collected, Shipments mark delivered, Returns approve, New order, the artwork warning answered "no" (nothing sent), no sideways scroll at phone width, no page errors
 - NOT run — buying a label or reading live rates with a real carrier (the local shop has none); a refund on a card payment; a real phone; a staff account with fewer permissions
---

## Prompt

(with three screenshots of the design: "2. Orders list", and "3. Order detail" in two parts, top and bottom)

ye lo ab orders page aur order list page yani inner order page saiha isko dekho kuch bhi static mat rkhna bhut sara kam already hua wa ha kch new bnana pare to bnadena lekin kch bhi buttons statci nh hone chayie ke kch krne pe kch ho hi na rha ho kindly start implmeneting and main cheez ye yad rkhna ye pooora abhi jitna ham ui redesign krrhy ye localhost tk rhega galti se bhi production pe nh jaega jb tk poora na krdein hum kam saiha

## Response snapshot

Both screens are built on the local branch `admin-ui-redesign` (commit 4cea0c2), not pushed. `origin/main` is unchanged at f4034bd and the branch does not exist on GitHub.

- One answer for where an order stands: `services/order_progress.py` gives the payment, artwork and fulfilment words, the next step and the steps. The list's rows, the panel and the order page read it. The tabs count from `services/order_queues.py`, the same conditions Home uses.
- The list: tabs with counts (All, To confirm, To ship, Ready for pickup, Drafts, Returns and reprints, Shipments), search, Payment, Method, Date range, saved views kept per shop, select rows to Confirm / Print pick list / Buy labels / Mark shipped, a panel per row, and an export of the rows on screen.
- One order: steps, pills and the main button from the server; Print, More, Refund; Items and artwork with Edit items; Fulfil for shipping (weight, rates, Buy label, Mark shipped, Mark packed) and for pickup (Mark ready, Mark collected); Notes; Customer; Money; Timeline.
- New on the server: packed as a history entry, team notes as history entries, saved views, `notify` to skip the customer's email, the tabs' counts, one filter shared by the list and its export.
- Two slips stopped: an order whose artwork is not approved asks before it is sent (and is left out when several are sent at once), and a line with a print job cannot be removed under Edit items.

Decided without the owner, and told to them: no Quotes tab (no quotes feature exists); "Returns and reprints" is the returns list; the Shipments tab replaces the old Shipping labels page; packed is an optional step; Orders is one line in the sidebar, Abandoned carts under Marketing, Purchase orders under Products; "Capture payment", the "Guest orders" tab and the fixed "Order source / Device" lines are not carried over.

## Outcome

- ✅ Impact: 3 of the admin's screens are redone (Home, Orders list, Order page) with the frame; the Drafts, Returns and Shipments screens sit in the same frame as tabs.
- 🧪 Tests: as listed, with what was not run.
- 📁 Files: 23, in one commit on the local branch.
- 🔁 Next prompts: the owner's yes or no on the decisions above; the next screens' designs; a carrier on a test account to try a real label.
- 🧠 Reflection: the checks in a browser engine reported faults that were not there (a same-page navigation is "idle" at once, so old rows were read). The list now says which address its rows answer (`data-shown`, `aria-busy`), which is also what a person's screen reader needs. The two slips at the end were found by reading the demo data the checks had left behind: an order "Collected" with artwork "In review".

## Evaluation notes (flywheel)

- Failure modes observed: reading the page before its rows arrived; pressing sign-in before the form was live; a "last remove button" that was not the line just added because the server returned lines in no order (now ordered by when they were added).
- Graders run and results (PASS/FAIL): backend 31 PASS; frontend 494 PASS, 2 FAIL (api-client, unchanged from main); build PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): connect a carrier's test key on the local shop and buy one label end to end.
