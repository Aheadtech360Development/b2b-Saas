---
id: 481
title: Innterflow's account and sign-in pages showed an old logo
stage: green
date: 2026-10-26
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: The new portal and the sign-in page at innterflow.com show a "BRAVO APPARELS" logo; the shop's logo is set in the website builder
labels: ["branding", "logo", "website-builder", "customer-portal", "brand-mail-identity"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/shop_logo.py (new: the logo buyers see; the live builder header's logo block picture, else the settings' logo)
 - backend/app/api/v1/storefront.py (public branding answers with that logo; the admin's own settings read is unchanged)
 - backend/app/core/database.py (mail and PDF logo: the same, read in a savepoint rolled back after, since the identity is set before the request's row scope is bound)
 - backend/tests/test_shop_logo.py (new, 5 tests)
tests:
 - live, read only: Innterflow's branding logo_url is an image from tenants/bravo-apparels/; its live builder header's logo block shows tenants/innterflow/...png; header_logo_of on that live header returns the Innterflow logo
 - local demo shop with a temporary live builder site (removed after): public branding gives the header logo, admin branding read unchanged, invoice PDF still 200; brand identity with an empty tenant setting gives the header logo and leaves the session's settings as they were
 - pytest: test_shop_logo 5, test_brand_mail and neighbours, 29 passed
---

## Prompt

(two screenshots: innterflow.com/account with a "BRAVO APPARELS" logo beside "Innterflow" in the portal's top bar; the shop's real Innterflow logo in its storefront header) aby bhai ye innterflow pe ye logo to ha hi nh bhai ye ku arha ha yar bhai mere isko hatao aur ye innterflow ke login page pr bhi arha ha bhai hatao yar isey bhai jaldi se logo to mene website builder mei jake ye lagaya hua ha

## Response snapshot

- Cause: two logo places. The portal and the sign-in page read the logo in the shop's branding settings, which for Innterflow still held an old image from a "bravo-apparels" folder; the storefront header draws the logo block set in the website builder.
- Fix: one answer for the logo buyers see. A shop live on the builder shows its header logo everywhere: account portal, sign-in page, and its emails and PDFs, which had the old logo too. Shops not on the builder are unchanged; the settings themselves are not rewritten.
- Pushed and checked live.

## Outcome

- ✅ Impact: Innterflow's buyers see Innterflow's logo on every page and in its mail.
- 🔁 Next prompts: replace the old image in the shop's settings too, so a switch away from the builder would not bring it back.
- 🧠 Reflection: the builder's logo block falls back to the settings' logo, so the two can disagree without anyone noticing on the storefront itself.
