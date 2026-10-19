---
id: 433
title: Meta pixel settings confirmed
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: User shared the Tracking & Analytics settings and the Meta Pixel install snippet to confirm the setup
labels: ["tracking", "meta-pixel", "gtm", "analytics", "storefront"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/433-meta-pixel-settings-confirmed.general.prompt.md
tests:
 - none (code reading; live site not reachable from the session)
---

## Prompt

[screenshot: Tracking & Analytics. "Track visitors on my storefront" on (2 tools connected); "Product views and add-to-cart" and "Checkout and purchases" on; Google Tag Manager On, GTM-KQ984BCJ; Meta Pixel On, 1131707639791414] <!-- Meta Pixel Code -->

<script>

!function(f,b,e,v,n,t,s)

{if(f.fbq)return;n=f.fbq=function(){n.callMethod?

n.callMethod.apply(n,arguments):n.queue.push(arguments)};

if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';

n.queue=[];t=b.createElement(e);t.async=!0;

t.src=v;s=b.getElementsByTagName(e)[0];

s.parentNode.insertBefore(t,s)}(window, document,'script',

'https://connect.facebook.net/en_US/fbevents.js');

fbq('init', '1131707639791414');

fbq('track', 'PageView');

</script>

<noscript><img height="1" width="1" style="display:none"

src="https://www.facebook.com/tr?id=1131707639791414&ev=PageView&noscript=1"

/></noscript>

<!-- End Meta Pixel Code -->

## Response snapshot

The settings are correct, and the pixel ID matches the snippet. Do not paste the snippet anywhere. The platform
already injects the same base code (TrackingScripts.tsx), so pasting it into the head snippet would duplicate
PageView. One risk to check: GTM is also on, and if the GTM container has its own Meta Pixel tag, events will
double-count, so keep the pixel in only one place. To verify on the live site, use the "Events on this Page" tab,
DevTools Console `fbq` (it should print a function), the Network tab filtered by "facebook", or Events Manager →
Test events.

## Outcome

- ✅ Impact: Setup confirmed. Duplicate-tracking risk with GTM flagged.
- 🧪 Tests: none
- 📁 Files: this PHR only
- 🔁 Next prompts: if fbq is undefined on innterflow.com, debug the storefront analytics response for that host
- 🧠 Reflection: Users often paste vendor snippets in addition to the ID, so warn about double tracking

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
