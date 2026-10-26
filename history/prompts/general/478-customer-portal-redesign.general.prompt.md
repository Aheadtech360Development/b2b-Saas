---
id: 478
title: Customer portal redesign from the owner's 18 screens
stage: green
date: 2026-10-26
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Build the complete new customer portal UI (PrintCoPilot Customer Portal.html) without breaking existing functionality
labels: ["customer-portal", "account", "redesign", "frontend", "wholesale", "retail", "brand-mail-identity", "returns"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/app/(customer)/account/portal.css (new: the portal's look, every rule under .cp, accent = the shop's --brand-primary)
 - frontend/src/app/(customer)/account/layout.tsx (new shell: top bar with logo, search menu, Shop, Cart count, Help, buyer; side menu retail or company; footer; phone drawer; same auth guard and sign-out)
 - frontend/src/components/storefront/ShellGate.tsx (/account is bare: no store header or builder chrome around the portal)
 - frontend/src/components/portal/{ui,nav,data,context,regions,AccountTabs,BillingTabs,ReportTabs,PaymentMethodsBody,TeamPage}.tsx|ts (new)
 - frontend/src/app/(customer)/account/page.tsx (Home: retail and company variants)
 - frontend/src/app/(customer)/account/orders/page.tsx (tabs: All orders, Saved for later, Returns and reprints, Receipts)
 - frontend/src/app/(customer)/account/orders/[id]/page.tsx (Order detail)
 - frontend/src/app/(customer)/account/gang-sheets/page.tsx, gang-sheets/[id]/page.tsx (Print jobs, new Print job page)
 - frontend/src/app/(customer)/account/artwork/page.tsx (new: Artwork library)
 - frontend/src/app/(customer)/account/messages/page.tsx (order threads + message to the shop's Inbox)
 - frontend/src/app/(customer)/account/{profile,addresses,payment-methods,change-password}/page.tsx (Account tabs)
 - frontend/src/app/(customer)/account/{invoices,statements,billing/terms,billing/payment-methods}/page.tsx (Billing tabs)
 - frontend/src/app/(customer)/account/{quotes,quick-order,returns/new}/page.tsx (new)
 - frontend/src/app/(customer)/account/{price-list,sales-history,inventory,users,contacts,resend-emails}/page.tsx (redone)
 - frontend/src/app/(customer)/account/{abandoned-carts,templates,rma}/page.tsx (now open the new Orders tabs)
 - backend/app/api/v1/gang_sheets.py (a buyer's print jobs carry their order's number, status and tracking)
 - backend/app/api/v1/quotes_public.py + services/quotes.py (GET /api/v1/quotes: the buyer's own quotes and price requests)
 - backend/app/api/v1/orders.py (GET /api/v1/orders/conversations: the buyer's orders with messages)
 - backend/app/api/v1/account.py (profile/full adds net30 and price tier; price list in one query; returns: no 500 after saving, list and get load their lines, own company's orders and lines only; buyer account emails in the shop's own name, not "AF Apparels")
 - backend/app/services/cart_service.py (SKU quick order follows the shop's stock rule)
tests:
 - npx tsc --noEmit: clean
 - vitest src/__tests__/tracking-funnel.test.ts: 24 passed (every new add-to-cart reports)
 - next build: passed, all portal routes built
 - local demo shop API check (scratchpad portal_api_check.py): 34/34 as a company buyer; retail buyer calls checked by hand
 - local browser walk (scratchpad walk_portal.cjs): all 29 portal addresses + an order + a print job as a company buyer, 13 + an order as a retail buyer: right heading, right menu item, no failed API call, no page error (old addresses redirect to their tabs)
 - local action walk (scratchpad walk_actions.cjs): grid add to cart, SKU paste with a flagged line, top bar search, message to the shop, return request, quote request, profile save, address add (US and Canada forms) and delete; 20/21, the one miss a test timing (API log shows the address 201 then 204)
 - phone width 390: every checked page fits (hidden table labels and a grid column had widened them; fixed)
 - backend unit tests near the change (brand mail, gang sheet names and label, plan gate, price grid): 60 passed
---

## Prompt

acha hamne admin ki ui bnali thi super admin ki bnali thi ab ye customer side ki bnani zara jaldi se ready kro ISKO MERI JAN JALDI SE BNAO ISKI POORI COMPLETE NEW UI WITH PROPER FEATURES READY KRNI SAIHA PLAN READY KRO AND START IMPLEMENTING WITHOUT BREAKING ANY EXISTING FUNCTIONALITY

(followed by: continue plz)

## Response snapshot

- Plan given in chat (shell, every screen on the existing API, two small read endpoints, the design's new features listed for the manager), then built.
- New portal shell and look; every account page redone in it: Home (retail, company), Orders with tabs, Order detail, Print jobs and a new Print job page (the sheet as sent, artwork files with their resolution check, progress, tracking, linked order), Artwork library, Messages, Account (Profile, Addresses, Payment methods, Security), Billing (Invoices, Statements, Credit and terms, Payment methods), Quotes, Quick order (grid and SKU paste), Price list, Reports (Purchase history, Stock levels), Team (Members, Contacts, Groups), Reprint or return, Resend invites. Old addresses still open (saved carts, templates and returns redirect to their tabs).
- Retail and company menus as designed; a shop without print jobs in its plan does not show them.
- Found and fixed on the way: the old Messages page wrote where the shop never reads (now order threads and the shop's Inbox); buyer account emails were signed "AF Apparels" for every shop; a return answered 500 after saving, the returns list failed, and a return could be filed or read across companies; the price list ran a query per product; SKU quick order refused products that do not count stock; the invoices page showed Invalid Date.
- Not built, listed for the manager: approve proof, notification settings, pay several invoices at once, same-day cutoff line, language and currency, photos on returns, group permissions, invite by email link, credit limit, a quantity step before reorder, returns and saved addresses for retail buyers, shop replies inside the portal, saved cards.

## Outcome

- ✅ Impact: buyers of every shop get the new portal with everything the old one did, on the same API.
- 🔁 Next prompts: the manager's answer on the listed features; push when the owner says.
- 🧠 Reflection: building each screen on the live API surfaced faults the old pages hid (the 500 after saving a return, the unread Messages table, the wrong brand in mail).
