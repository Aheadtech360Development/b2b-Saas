---
id: 690
title: Innterflow purchase full check
stage: general
date: 2026-11-16
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner says the shop where the purchase event looked missing is Innterflow
labels: ["tracking", "gtm", "purchase", "innterflow"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (checks only)
tests:
 - live, read-only, every hit aborted: Innterflow's thank-you page with a held Purchase for a made-up order number sent purchase to GA4 (G-JLFGS9K0GP, en=purchase), the Google Ads purchase conversion (label dE_qCM6j6J0dEP3MlvdE, order id and value) and Meta (ev=Purchase)
 - local, made-up API answers: /checkout → Place order (cash on delivery) → /checkout/thank-you/1042; data layer got begin_checkout, add_shipping_info, add_payment_info, purchase with the order number, value, tax, shipping and items
---

## Prompt

innterflow

## Response snapshot

Checked both halves of the Purchase on Innterflow. The thank-you page sends it to GA4, Google Ads and Meta with the order number and amount (live, all uploads blocked), and the one-page checkout hands it to the thank-you page (local run of the whole path). So a buyer's web order fires it. Things that do not: an order made in the admin, or paid from an invoice link, since no buyer goes through the checkout. Google Ads shows a conversion only after a real order and a few hours. Asked the owner for a screenshot of where they saw it missing and how to test in GTM Preview.

## Outcome

- ✅ Impact: Purchase shown to fire on Innterflow end to end; no code change needed.
- 🧪 Tests: live read-only check and local full-path check.
- 📁 Files: none.
- 🔁 Next prompts: owner's screenshot (Tag Assistant or Google Ads) if it still looks missing.
- 🧠 Reflection: none.
