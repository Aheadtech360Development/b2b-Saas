---
id: 324
title: Order totals and gang sheet print files
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: order page detail like Shopify
labels: ["orders", "discounts", "tax", "gang-sheets", "print-files", "pdf"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/order_money.py
 - backend/app/services/gang_sheet_render.py
 - backend/app/services/pdf_service.py
 - backend/app/api/v1/gang_sheets.py
 - backend/app/api/v1/admin/orders.py
 - backend/app/api/v1/orders.py
 - backend/app/schemas/order.py
 - backend/tests/test_order_print_files.py
 - backend/tests/test_gang_sheet_render.py
 - frontend/src/components/admin/GangSheetLineFiles.tsx
 - frontend/src/components/admin/OrderGangSheets.tsx
 - frontend/src/lib/orderMoney.ts
 - frontend/src/types/order.types.ts
 - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
 - frontend/src/app/(admin)/admin/gang-sheets/page.tsx
 - frontend/src/app/(customer)/account/orders/[id]/page.tsx
 - frontend/src/__tests__/order-money-and-print-files.test.tsx
tests:
 - backend/tests/test_order_print_files.py (29 passed)
 - backend/tests/test_gang_sheet_render.py (5 passed)
 - frontend/src/__tests__/order-money-and-print-files.test.tsx (10 passed)
 - full vitest suite (369 passed; the 2 api-client refresh tests fail as before)
 - tsc (only the 2 known api-client.test.ts errors)
 - browser check on the local demo shop (admin order page, preview, download, admin edit, buyer order page)
---

## Prompt

(two screenshots: the admin order page's totals; a Shopify order line listing a gang sheet's production files)

ab ek issue jo manager mera kehra ha wo ye ha ke ye jo first pic ha ispe usne mention krty hue ye kaha "should give full detail. how much discount. how much tax." and second mjhy shopify ki pic di aur uspe ye quote kra mjhy [3:40 AM, 10/7/2026] Ikrash Maniya: see the production ready files here in this and in ours [3:40 AM, 10/7/2026] Ikrash Maniya: we need to show it like this so it's easy for the client so plz see this i want this like shopify plz do it properly for gang sheets upload by size and upload a print ready gang sheet we have three builders plz

## Response snapshot

Totals: the admin and buyer order pages now list each discount with its code and kind ("Discount (SAVE90 · 90% off) −$6.62") and the tax with where and at what rate ("Tax (WY · 6%) $0.44", shown at $0.00 too). The lines come from the codes recorded against the order (discount_usage), and anything the total is still short of is shown as a discount, so the lines always add up. The invoice and confirmation PDFs had a Discount row that never appeared (it read a field orders do not have); it now shows, with the tax's rate.

Production files: under every gang sheet line on the admin order page, as Shopify's print apps list it: Size (× quantity), Builder, Preview, Edit (the buyer's link to copy while they may still change it, else "Locked — <status>"), Admin edit (opens that sheet in the review editor via /admin/gang-sheets?sheet=<id>), Print ready file, Has low resolution (Yes with the files and their DPI, or No with the lowest DPI), and Not in the PNG for vector or oversized files. One shape for all three builders: the sheet builder, Upload by size, and a buyer's own finished sheet (whose print file and preview are their own file).

The print-ready file is a 300 DPI PNG drawn by the server when the link is opened, reached by a signed link good for 7 days (HMAC of sheet, brand, kind, expiry). It streams a band of rows at a time; each artwork is decoded when the first band reaches it and released after its last, and a band takes only the rows it covers, so a packed 22″ × 240″ sheet (90 pieces) drew in 17 s with a 279 MB peak, and a single 22″ × 60″ design in 5.7 s with 522 MB. Artwork above 160 MP is left out and named. Lines find their sheets by reference, then by name (Upload by size lines carry no reference), then in order.

## Outcome

- ✅ Impact: the order page says what the total is made of and what to print, for every builder; the PDFs show the discount.
- 🧪 Tests: 29 + 5 backend checks, 10 frontend tests, full vitest and tsc as before, browser check on the demo shop.
- 📁 Files: listed above.
- 🔁 Next prompts: go-ahead to push to main; the order from the earlier card bug still shows tax on the full $7.35 (charged before that fix).
- 🧠 Reflection: the first renderer held every design at once and converted a whole design for every band; measuring a packed long sheet found it before it shipped.

## Evaluation notes (flywheel)

- Failure modes observed: a non-Latin-1 header value (fixed by percent-encoding); Upload by size lines have no reference in their name (matched by name); straight-alpha comparisons exaggerate rounding on near-transparent pixels (tests compare premultiplied colour).
- Graders run and results (PASS/FAIL): all listed tests PASS.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
