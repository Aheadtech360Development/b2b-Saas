---
id: 485
title: Conversion summary on the order page, like Shopify
stage: general
date: 2026-10-27
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Show where each order came from (direct, organic, Meta, Google, UTMs) in a Shopify-style Conversion summary on every brand
labels: ["attribution", "utm", "orders", "conversion-summary", "storefront"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/attribution.ts
 - frontend/src/components/admin/ConversionSummary.tsx
 - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
 - frontend/src/app/(admin)/admin-shell.css
 - frontend/src/__tests__/attribution-journey.test.ts
 - backend/app/services/attribution.py
 - backend/app/api/v1/admin/orders.py
 - backend/app/schemas/order.py
 - backend/tests/test_attribution_journey.py
tests:
 - backend/tests/test_attribution_journey.py (new, 8) + test_meta_capi.py: 29 passed
 - frontend/src/__tests__/attribution-journey.test.ts (new, 9) + server-tracking.test.ts: 13 passed
 - order page tests: 25 passed, 1 failed (the buyer's order page test, failing since the customer portal redesign d9c2353, not touched here)
 - tsc --noEmit: clean
 - local DB (5440, rolled back): the buyer's order count matched a hand count (company 9 = 9, guest 1 = 1); a 3-visit journey named Bing search, direct, Google Ads with its UTMs
---

## Prompt

[two screenshots of Shopify's order page: "Conversion summary" (This is their 3rd order, 1st session from Bing, 3 sessions over 4 days, View conversion details), the "Conversion details" dialog (Total sessions 3, Days to conversion 4, 1st session from Bing, Returned 1 time, Converted after a visit from Bing) and "Session details" (Visited your store from an organic search result on Bing, The first page they visited was ezdtfmaker.com, Visited on October 23, 2026 at 04:02 pm, UTM Parameters: No UTM parameters were available for this session.)]

Show in conversion details from the where the order came from whether direct, organic , meta or google whereever if utms should show utms aswell , same like shopify does. mera manager jo ha wo dekho ye bolrha ha plz isko proper dekho meri jan har brand pr ye hona chayie jis tarah shopify krke deta plz see this asap jani

(followed by "continue plz", then "kia krrhy ho jani kro na kitna sochre ho", then "continue plz")

## Response snapshot

- Found the platform already kept one source per buyer (last campaign or referrer, lib/attribution.ts → orders.utm_* + orders.attribution, migration 0040) and showed it in a "Where it came from" card; a buyer who came direct got nothing recorded.
- Storefront now also lists every visit (session) in the same localStorage record: start time, first page, referrer, UTMs, ad click ids (gclid, gbraid, wbraid, fbclid, msclkid, ttclid). New visit after 30 minutes away or when the buyer comes back from another source; a reload, a second tab or moving between pages is the same visit; payment pages (Stripe, PayPal…) are not a source; the brand's admin, platform, partners and builder pages record nothing. First visit + latest 24 kept, full count in `visits`; visits older than 90 days drop off, and a campaign older than that is no longer credited. The checkout already sends this record, so no checkout change.
- Server cleans the list (`attribution.clean`, sessions inside orders.attribution JSONB, no migration), names each visit (`classify`: direct, organic search on Google/Bing/Yahoo/DuckDuckGo…, Google Ads, Microsoft Ads, Facebook/Instagram/TikTok ads and links, email, ChatGPT and other assistants, other sites, campaign links) and builds the journey (`journey`: sessions, total, days to conversion). The admin order API adds `conversion`, with which of the buyer's orders it is (company, else the person, else the guest email; drafts aside).
- Order page: the "Where it came from" card is replaced by "Conversion summary" under Customer (This is their Nth order, 1st session from X, N sessions over D days, View conversion details, All orders from this campaign). The dialog shows Total sessions and Days to conversion, the first visit, "Returned N times" (opens the visits in between), the visit that converted, each with View details: where from, the first page, date and time, where they came from, the ad click, and the UTM parameters or "No UTM parameters were available for this session."
- Orders placed by the team, or before this, show "No visit details"; older orders with a campaign show their one recorded visit.

## Outcome

- ✅ Impact: every brand's order page shows where the buyer came from, visit by visit, with UTMs, the way Shopify does.
- 🧪 Tests: 8 backend + 9 storefront tests added; type check clean; local DB check rolled back.
- 📁 Files: listed above.
- 🔁 Next prompts: owner's yes to push; the buyer order page test from the portal redesign needs its mock updated.
- 🧠 Reflection: the old rule "an unknown source stays unknown" was right for the campaign columns, so it stays there; the journey lists the direct visits beside it instead of turning them into a campaign.
