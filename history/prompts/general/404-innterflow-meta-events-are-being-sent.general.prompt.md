---
id: 404
title: Innterflow Meta events are being sent
stage: general
date: 2026-10-13
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Innterflow (live, built with our builder) shows no Meta events in Meta's Event Setup Tool; find out whether events are tracked
labels: ["tracking", "meta-pixel", "innterflow", "live-read-only"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - this record only (no code changed)
tests:
 - live, read-only: GET https://www.innterflow.com/api/version (build 2752560, main); GET /api/v1/storefront/analytics as innterflow (enabled; Meta Pixel 1027221219465465; GTM-KQ984BCJ; products and checkout tracking on)
 - live, read-only browser visit as an ordinary Chrome visitor, every hit to facebook.com/tr stopped so nothing reached the ad account: home sent PageView; /products/uv-dtf-gang-sheets sent PageView and ViewContent (product id, value 7.35); the data layer had view_item
 - NOT run on live: add to cart, checkout and purchase (they need a cart and an order); they were checked on a local copy on 2026-10-12
---

## Prompt

(with two screenshots of Meta's Event Setup Tool on innterflow.com: "Events on this Page: No events found on this Page", "All events: There are no events set up for this pixel")

ye dekho bhae ek brand ha innterflow live ha hamare platform pr usne hamare builder ke thru hi site bnai lekin ye meta events dekho track hi nh arhy dekho zara

## Response snapshot

The events are tracked; nothing needed fixing. On the live site the Meta pixel loads and sends PageView on every page, and PageView plus ViewContent on a product page, as an ordinary visitor's browser does. The empty lists are the Event Setup Tool's own: it is Meta's point-and-click tool for adding events without code, and it does not list the events the site already sends by code.

To see them:
- Events Manager → the pixel → Test events, then browse the site.
- Or the Meta Ads Data Advisor extension (formerly Pixel Helper).

Do not add events in the setup tool, and do not add Meta inside GTM: each event would count twice. Purchase and the checkout steps were not tried on live (they need an order).

## Outcome

- ✅ Impact: the owner knows Innterflow's Meta tracking works, how to see it, and how not to double it.
- 🧪 Tests: the live reads and visit, as listed.
- 📁 Files: this record.
- 🔁 Next prompts: if Test events shows nothing while browsing, a screenshot of that screen.
- 🧠 Reflection: the screenshot was of a tool that only shows its own events. Checking what the page actually sent settled it in two minutes, without touching code.

## Evaluation notes (flywheel)

- Failure modes observed: Meta's help pages render in the browser, so their text could not be fetched; the answer leans on Meta's developer docs and the live check.
- Graders run and results (PASS/FAIL): live check PASS (events sent)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
