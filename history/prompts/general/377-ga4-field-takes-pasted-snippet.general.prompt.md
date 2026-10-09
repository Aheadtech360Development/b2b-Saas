---
id: 377
title: GA4 field takes a pasted snippet
stage: general
date: 2026-10-09
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/happy-goldberg-nqabe7
user: Aheadtech360Development
command: check whether the GA4 setup in Admin, Tracking & Analytics will work with the whole gtag snippet pasted into the Measurement ID field
labels: ["analytics", "tracking", "ga4", "admin"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/analytics_config.py
 - frontend/src/components/admin/TrackingPanel.tsx
 - frontend/src/components/analytics/TrackingScripts.tsx
 - backend/tests/test_analytics_config.py (new)
 - frontend/src/__tests__/tracking-scripts.test.tsx (new)
tests:
 - backend/tests/test_analytics_config.py, 6 passed (3 fail without the fix)
 - frontend/src/__tests__/tracking-scripts.test.tsx, 2 passed
 - tsc, no new errors in the changed files
---

## Prompt

acha a ye dekhlo ye gtag dala ha mene system mei tracking ana danalyztics mei ye proper dekhlo work krega na bhai

<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-JLFGS9K0GP"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-JLFGS9K0GP');
</script>

## Response snapshot

- As pasted it would not work. The field takes only the measurement ID (G-JLFGS9K0GP). Saving the snippet is refused with "does not look like a measurement id". Saving it anyway would put the markup inside the storefront's GA script and break it.
- The rest of the path is sound: admin save, public /storefront/analytics per brand, TrackingScripts in the root layout, and no CSP that would block Google.
- Fix: each tool now knows how to find its ID inside its vendor's install snippet (GA4, GTM, Clarity, Meta, TikTok, Pinterest, Snap, Klaviyo, Omnisend). The ID is taken out only when the value is not already a valid ID. A snippet saved earlier also reads back as its ID.
- The admin screen shows the saved value after Save, so a pasted snippet turns into just the ID in the field.
- The storefront skips any ID that is not letters, digits and dashes rather than breaking that tool's script.

## Outcome

- ✅ Impact: pasting a vendor's whole snippet into an ID field now saves the right ID.
- 🧪 Tests: as listed.
- 📁 Files: as listed.
- 🔁 Next prompts: merge the PR, then turn on the master switch and GA4 in Tracking & Analytics, and check GA4 Realtime.
- 🧠 Reflection: the common mistake is fixed where it happens (on save) instead of only in the warning text.

## Evaluation notes (flywheel)

- Failure modes observed: an admin pasted a full install snippet into an ID field.
- Graders run and results (PASS/FAIL): PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
