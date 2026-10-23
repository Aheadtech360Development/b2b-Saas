---
id: 474
title: Order number and customer above each gang sheet
stage: green
date: 2026-10-23
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Print the order number and the customer at the top of every gang sheet's print file
labels: ["gang-sheet", "print-file", "production"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/gang_sheet_render.py (label strip above the sheet)
 - backend/app/api/v1/gang_sheets.py (_sheet_label, _order_label_on, preview and print file)
 - backend/tests/test_gang_sheet_label.py (new, 4)
 - frontend/src/app/(admin)/admin/gang-sheets/page.tsx, frontend/src/services/gangSheets.service.ts (Print output switch, on by default)
tests:
 - test_gang_sheet_label.py 4 passed; all gang sheet tests 21 passed
 - a sample preview drawn and looked at: the label reads clearly above the sheet
 - frontend tsc clean
---

## Prompt

(screenshots: an order's "Print jobs and artwork files", gang sheet GS-IC-2610-0036 22x30, an arrow at the top of the sheet) aur han bs ek kam aj aur krna ha mjhy wo ye krna ha bhai ke mera client kehra yar har artwork ya jo bhi gang sheet wagera ka order hona uske top pe order name aur jo order krne wala bnda ha uska name ae yaha pe dekho  top pe space adjust krke ajae take wo kehra ham ek sath print rkrhy hoty to wo ham katdegy isse hamare lie asani rehegi plz yar  ye dekhlo jani krdo plz meri jan jaldi se zara dekhlo dasti dasti mere bhai plz jb tk push horha ha tum ye krdo meri jan saiha jaldi se

## Response snapshot

- The print file and the preview get a half-inch strip above the sheet: "Order #1009 · Faisal Hanif · GS-IC-2610-0036 · 22" x 30"" (and "Qty 3" when more than one), in black, a quarter inch in. The sheet itself is untouched; the file is half an inch taller. A long label shrinks to fit, then ends in an ellipsis.
- Customer: the job's contact name, else the order's company, guest or person (as the print file's name already uses).
- Gang sheet Settings → Print output: "Print the order number and customer above each sheet", on unless the brand turns it off.
- Also confirmed: the earlier push is live (console and price import routes on the server; Innterflow's store unchanged apart from its own stock edits).

## Outcome

- ✅ Impact: sheets printed together on one roll can be cut apart and matched to their orders.
- 🔁 Next prompts: the client's look at a real print file.
- 🧠 Reflection: add above the sheet rather than on it, so no layout can be covered.
