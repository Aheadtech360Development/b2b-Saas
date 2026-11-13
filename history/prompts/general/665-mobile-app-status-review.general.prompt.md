---
id: 665
title: Mobile app status review
stage: general
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner parks the GHL work and asks how far the mobile app is - customer order flow, UI, admin side, what is wired and what remains
labels: ["mobile", "review", "ghl"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none changed in the app (GHL commit 26b2ec1 parked on local branch ghl-leads; main line moved back to a5eae7e with git reset --keep)
tests:
 - read-only: every API path the app calls checked against the backend's route table (in-process, no requests)
 - mobile tsc --noEmit: 3 type errors in ListScreen.tsx (FlatList header/footer/empty typed as Element | null)
---

## Prompt

nh abhi ye ghl wala kam chordo ab aty hain mobile app pr saiha mobile app anaylyze kro aur dekho kitna hogya tha kitna kuch remaing tha sb wire hana mobile app mei jani full customer order flow aur baki cheezein jo bhi hain ui wagera admin side har cheez jaldi se dekhlo ye cheez tum

## Response snapshot

GHL parked: commit 26b2ec1 kept on local branch ghl-leads, main line back on the live a5eae7e, other local edits untouched.

Mobile app (Expo SDK 58, about 4,800 lines, runs in Expo Go, not in the stores). Sign-in (with 2FA), forgot password and the wholesale application by shop code work. A customer gets only an Account screen: profile and the last 20 orders, which cannot be opened. No browsing, product page, cart, checkout, payment, order detail, tracking, reorder or retail sign-up, although the backend has all of those routes. The Scale plan sells "Buyer mobile app" and nothing limits the app to that plan.

Admin side: Home (today and 7-day orders and sales, AI priorities), Orders with filters, detail and actions (confirm, shipped, delivered, paid, invoice, cancel), drafts, abandoned carts, returns, purchase orders, products, collections, reviews, inventory, suppliers, gang sheets (approve artwork, ask for revision), customers, wholesale applications (approve, reject), segments, messages, discounts, discount groups, users, audit log, and the AI assistant; analytics, billing, 2FA and theme say open on a computer. Every list route exists. Broken: opening a return (GET /admin/rma/{id} does not exist), opening a wholesale application (GET /admin/wholesale-applications/{id} does not exist), and the discount edit form (GET /admin/discounts/{id} does not exist). Edit forms (products, collections, customers, discounts, orders, settings) and an Edit button are written but uncommitted and untested. Not there: creating a product or order, photos, shipping labels, refunds, stock changes, variants, push notifications.

Recommended next: the buyer order flow, since the plan sells it and the backend is ready; then fix the three broken screens and finish the edit forms.

## Outcome

- ✅ Impact: the owner knows what the app does and what it lacks.
- 🧪 Tests: route check and mobile type check, read-only.
- 📁 Files: none in the app.
- 🔁 Next prompts: which part to build first.
- 🧠 Reflection: none.
