---
id: 432
title: Meta Event Setup Tool no events
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: Diagnose why the Meta Event Setup Tool shows "no events set up for this pixel" on a brand storefront
labels: ["tracking", "meta-pixel", "analytics", "debugging", "storefront"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/432-meta-event-setup-tool-no-events.general.prompt.md
tests:
 - none (code reading; innterflow.com is not reachable from the session)
---

## Prompt

[screenshot: innterflow.com with the Meta Event Setup Tool open on the "All events" tab, showing "There are no events set up for this pixel." and a "Finish setup" button] bhae ek cheez ha abhi dekho mene pixel id add ki ha settings mei jake tracking and analytics mei saiha to meta pe jb jarha hana to meta ka wo dikhara ha no events dekho screenshot zara ye meri taraf se issue ha kia

## Response snapshot

Most likely not an issue. The "All events" tab of the Event Setup Tool lists only events created by clicking in
that tool (codeless events). The platform sends its events from code (frontend/src/lib/tracking.ts): PageView,
ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, Purchase, Search, Lead and CompleteRegistration.
So that tab is empty by design.

Things to check:
- Both toggles are on in Tracking & Analytics. "Track visitors on my storefront" is the master switch, and Meta
  Pixel needs "On" as well. Typing the ID does not tick "On" (TrackingPanel.tsx), and
  analytics_config.public() sends nothing unless both are on.
- Save the settings.
- Verify with the "Events on this Page" tab, the Meta Pixel Helper extension, or Events Manager → Test events.
- Do not add events in the Event Setup Tool, because they would double-count the coded ones.
- Turn off any ad blocker while testing.

## Outcome

- ✅ Impact: User told it is expected behaviour, with concrete checks
- 🧪 Tests: none (live site not reachable from the session)
- 📁 Files: this PHR only
- 🔁 Next prompts: if "Events on this Page" stays empty after both toggles are on, debug the storefront analytics endpoint for that host
- 🧠 Reflection: The codeless-events tab is easy to misread as "pixel broken"

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): consider auto-ticking "On" when an ID is typed in TrackingPanel
