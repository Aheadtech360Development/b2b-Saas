---
id: 447
title: Go-live held, live pieces brought back
stage: general
date: 2026-10-19
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Owner's go-live answers - hold the push for the manager, bring the three missing live pieces into the redesign
labels: ["admin-redesign", "go-live", "reports", "customers", "production"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/report_view.py (by_day, paid_share)
 - backend/app/services/customer_directory.py (timeline)
 - backend/app/api/v1/admin/customer_directory.py (GET /{id}/timeline, /guest/timeline)
 - backend/tests/test_report_view.py, backend/tests/test_customer_directory.py
 - frontend/src/app/(admin)/admin/reports/page.tsx (Revenue by day, Conversion rate)
 - frontend/src/services/reports.service.ts, frontend/src/services/customers.service.ts
 - frontend/src/app/(admin)/admin/customers/[id]/page.tsx (Timeline card)
 - frontend/src/components/admin/production/AllJobs.tsx (Recent designs, Recent orders)
tests:
 - test_report_view + test_customer_directory + test_stock_view 30 passed
 - vitest 57 files, 634/634; tsc clean
 - API walk 11/11; browser pass 7/7 (phone width too)
---

## Prompt

(Answers to the go-live questions.)
- "Naya admin UI live pe kab push karun? ..." = "Pehle manager se poochunga"
- "Live ki 3 cheezen naye UI mein nahi hain: Analytics ka revenue chart (aur conversion rate), gang sheet dashboard ki 2 recent lists, customer page ki timeline. Inka kya karun?" = "Push se pehle wapas lao (Recommended)"

## Response snapshot

The push is held until the owner brings the manager's answer on the 8 held features. The three live pieces are back in the new screens, committed as b36330f, local only:

- **Reports, Sales:** Revenue by day (revenue bars, orders line, every day of the range) and Conversion rate, meaning paid orders out of all orders placed.
- **All print jobs:** Recent designs and Recent orders, with the order number and the buyer.
- **Customer page:** a Timeline card showing the account opened, each order placed and each order's history, newest first, the latest 50.

Main has not moved since the merge, so the push is still a fast-forward.

## Outcome

- ✅ Impact: the redesign shows everything the live admin shows, and the only thing left before the switch is the manager's answer.
- 🧪 Tests: see above.
- 📁 Files: see above.
- 🔁 Next prompts: the manager's yes or no per held feature; take out what is refused; push and verify Vercel and Railway (deploy SHA, /health schema 0060, the new routes in openapi).
- 🧠 Reflection: "Account opened" cannot be assumed to be the oldest line. An account made from a guest's orders opens after them, which the local data showed.

## Evaluation notes (flywheel)

- Failure modes observed: the timeline's opening was forced last. The live-data walk caught it; the fake-DB unit test did not.
- Next experiment: build timeline-like lists by sorting on time, never by appending.
