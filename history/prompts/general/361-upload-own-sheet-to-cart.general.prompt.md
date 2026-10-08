---
id: 334
title: Own gang sheet goes into the cart
stage: green
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: fix upload your own gang sheet add to cart
labels: ["gang-sheets", "upload-own", "cart"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/gang_sheets.py
 - backend/tests/test_upload_own_sheet.py
tests:
 - backend/tests/test_upload_own_sheet.py (5 passed; 2 fail without the fix, with the reported error)
 - backend/tests/test_order_print_files.py (30 passed)
 - backend/tests/test_gang_sheet_render.py, test_address_suggest.py, test_connect_dashboard_link.py (19 passed)
---

## Prompt

(screenshot: the "Upload your own gang sheet" modal, 22×40 chosen, error "This gang sheet has no saved layout yet. Open it in the builder, arrange your designs, and save before adding it to the cart.")

ek issue achuka ha bhai wo ye achuka ha jo upload your own gang sheet wala builder hana bhai wo dekho add to cart krty hue ye error derha ha bhai ye to blkl simple hana banda ata ha apnoi ready made gang sheet dalta ha aur save aur add to cart simple ha jani dekho isey

## Response snapshot

The cart refuses a gang sheet with no saved layout (added 3 Oct for builder sheets that lost their layout). The "Upload your own gang sheet" modal submits one file that is the whole sheet and adds it to the cart in the same click, and nothing ever gave it a layout, so every own sheet was refused. The general submit endpoint now lays out a buyer's own sheet when the product is upload_own and there is one file: the file centred on the sheet, inside the bleed, as Upload by size records its one design. Builder sheets are unchanged and still need their layout saved first.

## Outcome

- ✅ Impact: buyers can add their own finished gang sheet to the cart.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: go-ahead to push to main.
- 🧠 Reflection: a guard written for one builder applied to all three; the third had no step that could satisfy it.

## Evaluation notes (flywheel)

- Failure modes observed: sheet sizes store bleed to the hundredth (0.125 is 0.13), so the test sizes the file as the modal does.
- Graders run and results (PASS/FAIL): all listed tests PASS.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
