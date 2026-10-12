---
id: 396
title: Admin redesign customers inbox inventory setup
stage: general
date: 2026-10-13
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: build designs 9-14 (customers list, customer profile, applications, inbox, inventory, gang sheet setup) end to end on real per-shop data, and carry out the five decisions the owner said yes to
labels: ["admin-redesign", "customers", "inbox", "inventory", "gang-sheets", "options-builder", "local-only"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/customer_directory.py (new)
 - backend/app/api/v1/admin/customer_directory.py (new)
 - backend/app/services/inbox.py (new)
 - backend/app/services/stock_view.py (new)
 - backend/migrations/versions/0060_contact_message_state.py (new)
 - backend/app/api/v1/storefront.py
 - backend/app/api/v1/admin/inventory.py
 - backend/app/api/v1/gang_sheets.py
 - backend/app/core/features.py
 - backend/app/main.py
 - backend/tests/test_customer_directory.py, test_inbox.py, test_stock_view.py, test_gang_sheet_size_dedupe.py (new)
 - frontend/src/app/(admin)/admin/customers/page.tsx, [id]/page.tsx, applications/page.tsx, tiers/page.tsx
 - frontend/src/app/(admin)/admin/messages/page.tsx
 - frontend/src/app/(admin)/admin/inventory/page.tsx
 - frontend/src/app/(admin)/admin/reports/inventory/page.tsx
 - frontend/src/app/(admin)/admin/gang-sheets/page.tsx
 - frontend/src/app/(admin)/admin/production/page.tsx, production/all/page.tsx (new)
 - frontend/src/app/(admin)/admin/orders/drafts/page.tsx
 - frontend/src/components/admin/customers/CustomersFrame.tsx, AddCustomerModal.tsx (new)
 - frontend/src/components/admin/production/AllJobs.tsx (new)
 - frontend/src/components/admin/ProductOptionsBuilder.tsx
 - frontend/src/components/admin/products/ProductsFrame.tsx
 - frontend/src/components/layout/AdminSidebar.tsx, frontend/src/components/admin/AdminTopbar.tsx
 - frontend/src/services/customers.service.ts (new), contact.service.ts, admin.service.ts, gangSheets.service.ts
 - frontend/src/lib/customerWords.ts (new)
 - frontend/src/app/(admin)/admin-shell.css
 - frontend/src/__tests__/customer-words.test.ts (new)
tests:
 - backend, pytest --noconftest — 23 new (customers 6, inbox 7, inventory 5, duplicate sizes 4, plus the inbox label fix); 75 with the redesign's others — all passed
 - frontend, vitest — customer-words (3 new); product-edit-template-cards (8) — passed; tsc — only the 2 old errors
 - local API checks — the customer list, counts, filters, pages, export, add, edit, suspend, logins, the last owner kept
 - browser engine, local demo shop — each screen walked (see the five commits), the three wholesale features switched off and back on for the lock states, migration 0060 up on the local database, duplicate sizes made and removed on the local database
 - NOT run — mail arriving (invite, approval, reply: mail is off locally), a real Starter shop, more than one warehouse, incoming purchase orders, a storefront /contact or /quote page, the full website suite and a production build
---

## Prompt

(with six screenshots: "9. Customers list", "10. Customer profile", "11. Applications (plan locked)", "12. Inbox", "13. Inventory (merged with report)", and Gang sheet setup → Sheet sizes; and, pasted, the five decisions from the last answer:)

Production queue mein "Paid jobs" ki jagah "In the queue" likhna.
Ship-queue ka rule.
Categories aur Reviews tabs: design mein nahi thay, maine rakhe taake kuch gum na ho.
Gang sheet setup ko Products ke andar rakhna.
Options builder ka look, design 8 ke mutabiq.

 hn ye hath ke hath krdena saiha jb tk mei tumhein agli screens dera aur dusra ye ke jaha kch miss hojae ab tum theme aur layotut to smjh gye hona bs ek cheez make sure krni ha sari screens bnake usko bs real time data tenant level pr jorna ha bhai mere  aur ab ye new screeens customers wagera applciations customer ke  aur customers inbox ke messages dekhlena ye proper end to end  aur aur ye isi mein inventory page bhi ha dekhlo productis inventpry wala  aur gang sheet setup wala  bhi ha saiha meri jan dekhle proper aur implement kro

## Response snapshot

Five commits on the local branch, none pushed:
- a1705c3 Customers. Accounts and guests are in one list on every plan; before, the list read a wholesale-only path, so Starter could not open it, and guests were never in it. There is a customer's page with five tabs, invites that email a set-password link, Applications with the lock, and Pricing tiers in the frame.
- 23ed91d Inbox. Messages and quote requests are read out of the forms' labels. Reply goes out in the shop's name. Answered and Archived come from migration 0060. A quote can become a draft order.
- 79ceb09 Inventory. Every stocked SKU shows Available, Reserved and On hand. The at-zero truth is spelled out (checkout sells a SKU at 0 without a limit). Incoming comes from purchase orders. Adjust opens a history drawer that now records who made each change. The old report redirects here.
- 8617892 Gang sheet setup. It has the design's four sub-tabs and Remove duplicates (a size a job used is hidden, not deleted). The Dashboard and Print jobs moved to Production → All print jobs.
- cbaf76b Options builder. It now looks like design 8, with one Save bar.

The five decisions: "In the queue", the ship rule, the Categories and Reviews tabs, and Gang sheet setup under Products were already in place. The builder was the one left.

## Outcome

- ✅ Impact: 14 of the owner's designs are built (9 to 14 this round), each on its shop's own data.
- 🧪 Tests: as listed, with what was not run.
- 📁 Files: as listed, five commits.
- 🔁 Next prompts: the owner's next designs; their word on what was left out (the Handoffs tab, "Fill prices by rule", the gang sheet dashboard's two recent lists).
- 🧠 Reflection: three screens needed the data to say something the design took for granted. Customers belonged to a wholesale-only path. 0 stock means "no limit" at checkout. Deleting a size could strand a job. Each screen now says what the data says.

## Evaluation notes (flywheel)

- Failure modes observed: the Inbox commit carried a test still expecting an old label (fixed in the Inventory commit); a check script read rows after a rollback; a stopped heredoc command waited on input; the demo shop grants every feature by override, so its plan alone could not show a lock.
- Graders run and results (PASS/FAIL): backend 75 PASS; website 11 PASS; tsc PASS; local walks PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): an invite email on a shop with mail on.
