---
id: 210
title: PO email mobile-responsive card layout
stage: general
date: 2026-05-25
surface: agent
model: claude-sonnet-4-6
feature: purchase-orders
branch: main
user: development.aheadtech360@gmail.com
command: fix: PO email mobile-responsive card layout - replace table with stacked cards
labels: ["purchase-orders","email","mobile","responsive","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/purchase_orders.py
tests:
  - n/a (email template only)
---

## Prompt

Fix PO email template - make it mobile responsive, table is overflowing on mobile.

In backend/app/api/v1/admin/purchase_orders.py, in the send_po_email function,
replace the HTML table for line items with mobile-friendly stacked cards.

Replace rows_html (table rows) with rows (div cards with nested table for 2-column grid).
Replace content_html wrapped in EmailService._base_template() with a self-contained html_body
using full DOCTYPE/html structure with viewport meta tag, white header with logo, card items,
navy total bar, notes block, and footer with contact info.

## Response snapshot

- Replaced `rows_html` table row builder with `rows` card builder using `<div>` + nested 2-col `<table>` per item
- Replaced `content_html` + `EmailService._base_template()` with self-contained `html_body` f-string
- New template: viewport meta, white logo header, PO info 2-col table, HR divider, card items, navy total bar, notes, footer
- Removed unused `from app.services.email_service import EmailService` import from within the function
- Item cards: border-left navy accent, product name bold header, 2-col grid (SKU/Color, Size/Qty, Unit Cost/Total) using table for email client compatibility

## Outcome

- ✅ Impact: PO email no longer overflows on mobile — line items render as stacked cards instead of a 7-column table
- 🧪 Tests: n/a (email template change only)
- 📁 Files: 1 file modified
- 🔁 Next prompts: Test by sending email from PO detail page and checking on mobile
- 🧠 Reflection: Email clients don't support CSS grid/flexbox reliably; used nested table for 2-col layout inside each card to ensure compatibility across Gmail, Apple Mail, Outlook

## Evaluation notes (flywheel)

- Failure modes observed: CSS grid/display:flex not supported in email clients — replaced with table-based 2-col layout inside each card
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): null
- Next experiment: null
