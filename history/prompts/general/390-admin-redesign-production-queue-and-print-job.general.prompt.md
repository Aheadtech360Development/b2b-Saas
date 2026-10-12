---
id: 390
title: Admin redesign Production queue and print job
stage: general
date: 2026-10-12
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: build the Production page (print queue) and the print job review from the screenshots, end to end with a working flow, localhost only
labels: ["admin-redesign", "production", "gang-sheets", "print-queue", "local-only"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/production_board.py (new)
 - backend/app/api/v1/admin/production.py (new)
 - backend/app/main.py
 - backend/app/core/tenant_settings.py
 - backend/app/api/v1/gang_sheets.py
 - backend/app/services/order_queues.py
 - backend/app/services/order_progress.py
 - backend/app/services/admin_home.py
 - backend/tests/test_production_board.py (new)
 - backend/tests/test_order_progress.py
 - backend/tests/test_admin_home.py
 - frontend/src/app/(admin)/admin/production/page.tsx (new)
 - frontend/src/app/(admin)/admin/production/[id]/page.tsx (new)
 - frontend/src/services/production.service.ts (new)
 - frontend/src/services/gangSheets.service.ts
 - frontend/src/components/storefront/GangSheetCanvas.tsx
 - frontend/src/app/(admin)/admin-shell.css
 - frontend/src/components/layout/AdminSidebar.tsx
 - frontend/src/app/(admin)/admin/dashboard/page.tsx
 - frontend/src/app/(admin)/admin/orders/page.tsx
 - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
 - frontend/src/components/admin/OrderGangSheets.tsx
 - frontend/src/app/(admin)/admin/gang-sheets/page.tsx
 - frontend/src/__tests__/production-words.test.ts (new)
 - frontend/src/__tests__/order-artwork-open.test.tsx
tests:
 - backend, pytest --noconftest, no database — test_production_board.py (new), test_order_progress.py, test_admin_home.py, test_order_list_filters.py — 50 passed
 - frontend, vitest — production-words.test.ts (new), order-artwork-open.test.tsx, order-money-and-print-files.test.tsx — 20 passed
 - frontend, tsc — only the 2 old errors in api-client.test.ts
 - local API, demo shop — the board: 6 in the queue, 2 drafts kept out, every job in its column with its next step; drafts list; a cutoff of "noon" refused (400); one job's stage, steps, order, kind and print file
 - browser engine, localhost, demo shop — the board and its counts; the cutoff set to 12:00 (cards then say today's has passed); List and Board; Show drafts; Mark ready to ship from a card (counts and columns follow); a job opened from its card: Clear, Undo, Auto-nest, Snap, Save layout, the private note saved on leaving the box, a message typed and Approve, Start printing, Mark ready to ship, then its order's main button is Mark shipped; another job sent back with a message (the board then says so); an old /admin/gang-sheets?sheet= link opens the new page; Home's link; no sideways scroll at phone width; no page errors
 - NOT run — the full website test suite and a production build for this round; emails (the local shop sends none); a real live order
---

## Prompt

(with three screenshots: "4. Production queue", and "5. Print job review" top and bottom)

acha ab ye jaldi se production wala page dekho zara meri jan jaldi se aur ab ye page poora end to end with working flow design krna ha hamein

## Response snapshot

Both screens are built on the local branch admin-ui-redesign (commit e94288e), not pushed.

- One answer for where a job stands: services/production_board.py (stage, column, steps, next step) read by the board, its counts and the job page.
- The queue: In the queue, In production, Ready to ship, Unpaid drafts; four columns; each card's button moves the job on (Review artwork, Start printing, Mark ready to ship, Ship the order); the same-day cutoff as a shop setting; Board or List; drafts on request.
- One job: Download PDF, Reject, Request revision, Approve, then Start printing and Mark ready to ship; the existing sheet editor with the admin's buttons; status steps; linked order; artwork files with the print check and the print-ready file; message to the customer sent with the email; private note saved on its own.
- The order follows: an order whose sheet is not printed yet is not in "To ship"; marking its last sheet ready puts it there; while printing, its next step opens the job.

Decided without the owner, and told to them: a job is in the queue once its order is placed, paid or not (a cash on delivery job has to be printed before it is paid), so the first card says "In the queue" with how many are not paid yet, not "Paid jobs"; the gang sheet settings stay on their old page under "Gang sheet setup" until their designs come.

## Outcome

- ✅ Impact: 5 of the owner's designs are done (Home, Orders list, Order page, Production queue, Print job).
- 🧪 Tests: as listed, with what was not run.
- 📁 Files: 25, in one commit on the local branch.
- 🔁 Next prompts: the owner's yes on "In the queue" and the ship-queue rule; the next screens.
- 🧠 Reflection: the job's own paid flag is only set by a card at checkout; a queue of "paid jobs" read from it would have left every cash on delivery sheet unprinted. The order's payment is the evidence.

## Evaluation notes (flywheel)

- Failure modes observed: the local API had to be started again for a route written after its first restart (it does not reload).
- Graders run and results (PASS/FAIL): backend 50 PASS; frontend 20 PASS; local walk PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run the whole website suite and a production build before the redesign is merged.
