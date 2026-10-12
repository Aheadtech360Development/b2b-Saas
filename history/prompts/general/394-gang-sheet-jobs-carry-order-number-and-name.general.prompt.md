---
id: 394
title: Gang sheet jobs carry order number and name
stage: general
date: 2026-10-13
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: every gang sheet order or artwork upload must show the order number and the customer's name to the shop, fixed on live now, nothing of the new admin UI with it
labels: ["gang-sheets", "admin", "print-files", "live-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/gang_sheets.py
 - backend/tests/test_gang_sheet_owner_names.py (new)
 - backend/tests/test_order_print_files.py
 - frontend/src/app/(admin)/admin/gang-sheets/page.tsx
 - frontend/src/components/admin/GangSheetLineFiles.tsx
 - frontend/src/components/admin/OrderGangSheets.tsx
 - frontend/src/lib/download.ts
 - frontend/src/lib/gangSheetPdf.ts
 - frontend/src/services/gangSheets.service.ts
 - frontend/src/__tests__/gang-sheet-owner-names.test.ts (new)
 - frontend/src/__tests__/order-money-and-print-files.test.tsx
tests:
 - backend, pytest --noconftest — test_gang_sheet_owner_names.py (8 new) with test_gang_sheet_render.py (5) — 13 passed
 - frontend, vitest — gang-sheet-owner-names (2 new), order-money-and-print-files (one new case; its download mock keeps the real withOwner), build-with-ai-switch, gang-sheet-studio, studio-assistant — 78 passed
 - frontend, tsc — only the 2 old errors in api-client.test.ts
 - local demo database, read-only — six checked-out jobs with their order numbers, names and emails; a guest order's name; the order page's print file name; the signed print download's Content-Disposition (artwork not fetched)
 - NOT run — test_order_print_files.py and test_upload_own_sheet.py (they need the test database on port 55432, not running here; expected names updated); a production build; a real guest checkout on live
---

## Prompt

acha iske bad ek kam jo abhi live pr krna ha jaldi se wo ye ke tumhein mene kaha tha jb gang sheet koi order kre ya artwork upload ya kch bi to bhae order number aur bnde ka name ana chayie lekin abhi bhi nh arha ha ye kam tumne kaha tha hogya lekin abhi tk nh hua plz isko dekho meri jan plz isko dekho bhae gorse dekho aur ye abhi krke push kro make sre kch bhi new ui se reated kam live na ho ui pehle complete krke ek sath hu kregy kam abhi ye kro jaldi priority ha bhae

## Response snapshot

The first ask (2026-09-28) was that a submitted job reach the shop under the customer's name. What was done then (a8c49d5, 2026-10-03) put the buyer's initials in the reference and the signed-in account's name on the job. It missed two things:

- A guest makes the job before checkout and types their name only at checkout, onto the order. The job never got it, so the queue said "Guest".
- No admin screen showed the order number for a job.

Fixed on main, without the admin redesign:

- The queue reads the order's number and the buyer from the order the job was checked out on. One query; nothing written, so jobs already in the queue show them too.
- The job list has an Order column, the job's page says "Order #N", and the dashboard rows carry both.
- Files are named for the order and the customer: the print-ready sheet, a buyer's own file, each design's download, and the sheet PDF.
- The saved "Print file-name format" setting is now used.

## Outcome

- ✅ Impact: the shop sees, for every gang sheet job (builder, upload by size, upload your own), the order's number and who bought it, including guests, and the files it downloads say the same.
- 🧪 Tests: as listed, with what was not run.
- 📁 Files: 11, one commit on main.
- 🔁 Next prompts: the owner opens a gang sheet job on live and downloads its print file; at the redesign's merge, the branch's _orders_of / _admin_job and this commit's _linked_orders meet in gang_sheets.py and should become one.
- 🧠 Reflection: "the customer's name" was read last time as the name the job was made with, which a guest's job does not have. The order is where a guest's name lives, so it is read from there, not copied.

## Evaluation notes (flywheel)

- Failure modes observed: the earlier fix covered signed-in buyers only and never showed the order number; the order page's test mocked the whole download module, so the new export was missing until the mock kept the real one.
- Graders run and results (PASS/FAIL): backend 13 PASS; website 78 PASS; tsc PASS (2 old errors); local read-only checks PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a guest checkout on a test shop, then the job in the queue.
