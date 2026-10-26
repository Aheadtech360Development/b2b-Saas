---
id: 477
title: GA4 says data collection isn't active for Innterflow
stage: general
date: 2026-10-26
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: GA4 web stream for www.innterflow.com (G-JLFGS9K0GP) shows "Data collection isn't active for your website"
labels: ["tracking", "ga4", "gtm", "innterflow"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (memory: tracking-analytics.md)
tests:
 - live, read only: GET /api/v1/storefront/analytics for innterflow = gtm GTM-KQ984BCJ and meta_pixel only, no ga4
 - gtm.js?id=GTM-KQ984BCJ: Google Ads conversion tags (__awct, __dest_aw), no GA4 tag type, G-JLFGS9K0GP absent
 - https://www.innterflow.com/api/version answers our build: the stream's site is our platform
 - G-JLFGS9K0GP passes the Tracking page's GA4 check (^G-[A-Z0-9]{6,15}$)
---

## Prompt

(screenshot: GA4 Web stream details, stream innterflow, https://www.innterflow.com, Measurement ID G-JLFGS9K0GP, "Data collection isn't active for your website. If you installed tags more than 48 hours ago, make sure they are set up correctly.") ye dekho ga4 analytics ye error dera ha yar jani

## Response snapshot

- No GA4 tag is on the site anywhere: the shop's Tracking settings hold only GTM and the Meta Pixel, and the GTM container has Google Ads conversion tags but no GA4 tag. So Google receives nothing.
- Fix (2 minutes, brand admin): Marketing → Tracking → Google Analytics 4: on, Measurement ID G-JLFGS9K0GP, save. The platform then loads GA4 and sends page views and the whole shop funnel (view_item, add_to_cart, begin_checkout, add_payment_info, purchase, sign_up, generate_lead). Do not also add GA4 inside GTM (every hit twice).
- In GA4: Enhanced measurement → Page views → advanced → turn off "Page changes based on browser history events", because the platform sends each in-site page view itself.
- After saving, the settings can be checked from outside and GA4 Realtime shows visits within minutes; the banner clears once hits arrive.
- Also: the price grid deploy is live (website 2231b08, server has the routes).

## Outcome

- ✅ Impact: the owner knows why GA4 is empty and the exact switch that fills it.
- 🔁 Next prompts: confirm the ID is saved and GA4 Realtime shows visits.
- 🧠 Reflection: check what the site actually loads before assuming the tag is broken.
