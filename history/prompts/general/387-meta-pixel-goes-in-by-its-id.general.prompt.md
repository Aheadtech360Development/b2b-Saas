---
id: 387
title: The Meta Pixel goes in by its ID
stage: general
date: 2026-10-12
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: can the Meta Pixel snippet be put on the live site quickly, under Tracking and Analytics
labels: ["tracking", "meta-pixel", "innterflow", "read-only-check"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none changed
tests:
 - read on main (the live code) — backend/app/services/analytics_config.py has a Meta Pixel tool (field "Pixel ID", 10 to 20 digits) and cuts a pasted snippet down to the number in fbq('init', …); frontend/src/components/analytics/TrackingScripts.tsx writes the pixel's base code and PageView on every page; frontend/src/lib/tracking.ts sends ViewContent, AddToCart and Purchase
 - read only, live — GET /api/v1/storefront/analytics for innterflow — tools on: the Tag Manager container only; no Meta Pixel saved; both custom code boxes empty; product and checkout tracking on
 - read only, live — the shop's published Tag Manager container — no Meta Pixel in it, and still no GA4 tag
 - NOT done — nothing was saved on the live shop; the pixel was not seen firing, because it is not saved yet
---

## Prompt

<!-- Meta Pixel Code -->

<script>

!function(f,b,e,v,n,t,s)

{if(f.fbq)return;n=f.fbq=function(){n.callMethod?

n.callMethod.apply(n,arguments):n.queue.push(arguments)};

if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';

n.queue=[];t=b.createElement(e);t.async=!0;

t.src=v;s=b.getElementsByTagName(e)[0];

s.parentNode.insertBefore(t,s)}(window, document,'script',

'https://connect.facebook.net/en_US/fbevents.js');

fbq('init', '1027221219465465');

fbq('track', 'PageView');

</script>

<noscript><img height="1" width="1" style="display:none"

src="https://www.facebook.com/tr?id=1027221219465465&ev=PageView&noscript=1"

/></noscript>

<!-- End Meta Pixel Code -->

 acha ab jo live site hana usme ye tag lagana ha meta ka dekh ke batao zara laga skta hn na jaldi se tracking and analyztics mei jaldi

## Response snapshot

Yes, in about a minute, and no code is needed. In the shop's admin, Settings → Tracking & Analytics → Meta Pixel: enter only the number 1027221219465465 as the Pixel ID, switch it on, save. The platform writes the same base code on every page of the shop.

- Do not also paste the snippet in the custom code box, and do not also add the pixel inside the Tag Manager container: either would count every event twice. Neither holds it today (checked).
- Sent on its own once saved: PageView on every page, ViewContent on a product page, AddToCart, and Purchase with the order number.
- Not sent yet: InitiateCheckout (written, never called) and the gang sheet builder's add to cart.
- The noscript image is not added; it only matters for a visitor with scripts switched off.
- Said again: the Tag Manager container still holds no GA4 tag and GA4 by ID is off, so Google Analytics is measuring nothing.

Offered: once it is saved, a read-only check from outside that the ID is saved and the pixel's request leaves the page.

## Outcome

- ✅ Impact: the owner knows where the pixel goes, what it will send and what would double it.
- 🧪 Tests: read-only checks as listed; nothing saved on live.
- 📁 Files: none.
- 🔁 Next prompts: the owner saves it; then the outside check. Whether to wire InitiateCheckout and the builder's add to cart.
- 🧠 Reflection: the same question as the Tag Manager snippet three days ago; the answer is the ID field again. A pasted snippet would also have worked (it is cut down to its ID), but the number alone leaves nothing to go wrong.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after the save, load the home page headless and look for the request to facebook.com/tr with this ID.
