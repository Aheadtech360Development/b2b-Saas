---
id: 445
title: New order, labels, notifications designs 32-34
stage: general
date: 2026-10-19
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Build designs 32 (New order wizard), 33 (Buy labels batch) and 34 (Notification template editor) end to end on the local redesign branch
labels: ["admin-redesign", "orders", "shipping", "notifications", "email"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/draft_orders.py (new; design 32)
 - backend/app/schemas/order.py
 - backend/app/api/v1/admin/orders.py
 - backend/app/api/v1/admin/products.py
 - backend/tests/test_new_order_wizard.py (new)
 - frontend/src/app/(admin)/admin/orders/new/page.tsx (new)
 - frontend/src/app/(admin)/admin/orders/drafts/page.tsx
 - frontend/src/components/admin/orders/BuyLabelsDialog.tsx (design 33)
 - frontend/src/app/(admin)/admin-shell.css
 - frontend/src/__tests__/buy-labels-batch.test.tsx (new)
 - backend/app/services/notifications.py (new; design 34)
 - backend/app/api/v1/admin/notifications.py (new)
 - backend/app/api/v1/checkout.py, guest.py, gang_sheets.py, admin/invoices.py, admin/quotes.py, admin/settings.py
 - backend/app/services/email_service.py, core/tenant_settings.py, core/permissions.py, main.py
 - frontend/src/app/(admin)/admin/settings/notifications/page.tsx (new)
 - frontend/src/app/(admin)/admin/settings/email-templates/page.tsx
 - frontend/src/components/admin/settings/SettingsFrame.tsx
 - backend/tests/test_notifications.py (new), frontend/src/__tests__/notifications-settings.test.tsx (new)
tests:
 - design 32: test_new_order_wizard (2), local API walk 19/19, browser 11/11
 - design 33: buy-labels-batch.test.tsx 4/4, screenshot with made-up rates
 - design 34: test_notifications (11), notifications-settings.test.tsx (5), local API walk 16/16, browser 14/14 (phone width too)
---

## Prompt

(Images of design 32 New order wizard, design 33 Buy labels (batch), design 34 Notification template editor.)

jani ab zara ye poora design wire krdo end to end bs aj sb screens khatam kregy aur bs poora admin ui shift krdegy to the new one saiha bhai mere

## Response snapshot

All three built and committed on the local branch `admin-ui-redesign` (not pushed):

- **235d37b, design 32, New order:** three steps (customer, items, payment).
  - Customer: an account at its tier price, a new customer, or a guest.
  - Items: product search, SKU paste and configurable products.
  - Payment: ship or pickup, tax and shipping worked out again, then invoice (terms), payment link or paid.
  - Drafts continue where they stopped.
- **1c6b149, design 33, Buy labels:** one carrier and one service for the whole batch, each order's own rate. An order the service does not reach shows "Not offered". The window shows the total.
- **8ff2c8f, design 34, Notifications:** the 8 customer emails, each with an on/off switch and the shop's own subject and message, plus a test mail and a preview in the shop's own frame.
  - Wired at every sender.
  - An email the shop has not touched goes out exactly as before.
  - The shared `email_templates` rows are now platform-admin only.

## Outcome

- ✅ Impact: the last three designs sent are built. 29 design numbers in all (1-15, 17-24, 29-34); 16 never arrived; 25, 27 and 28 are on hold.
- 🧪 Tests: see above. The conftest-based suites (test_checkout, test_admin_orders) need a migrated test database that is not set up locally, so they were not run.
- 📁 Files: see above.
- 🔁 Next prompts:
  - merge main into the redesign branch;
  - re-chain the 0060 migration after 0063;
  - port the live inventory and size changes;
  - the go-live checklist and the owner's final yes before anything is pushed.
- 🧠 Reflection: an editor's "standard wording" must be the words customers really get, or the preview misleads. The first catalog was new copy; it now mirrors each email as sent today. Changing the sent wording for every shop would be a behaviour change that needs a yes.

## Evaluation notes (flywheel)

- Failure modes observed:
  - the POST preview had no database dependency, so the request was never signed as the shop and the frame showed the platform's fallback name;
  - a heredoc turned `\n` into real line breaks in a Python file.
- Next experiment: give every route that renders mail `get_db` (or `use_brand_identity`), even when it reads nothing.
