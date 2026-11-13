---
id: 664
title: printcopilot forms to GHL
stage: general
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner wants every printcopilot.co form's data to go into GoHighLevel too
labels: ["ghl", "crm", "leads", "marketing-site", "integrations"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/ghl.py
 - backend/app/api/v1/leads.py
 - backend/app/api/v1/contact.py
 - backend/app/api/v1/partners_public.py
 - backend/app/api/v1/signup.py
 - backend/app/api/v1/platform/leads.py
 - backend/app/core/config.py
 - backend/tests/test_ghl.py
 - frontend/src/components/platform/LeadsTab.tsx
 - frontend/src/__tests__/leads-ghl.test.tsx
 - frontend/src/components/marketing/pages/Privacy.tsx
 - frontend/src/app/(customer)/contact/ContactContent.tsx
tests:
 - backend test_ghl (15 new), test_leads, test_review_sources: 67 passed
 - frontend vitest leads-ghl (3 new), marketing-forms: passed
 - tsc --noEmit: clean; ruff F on the changed files: only an old unrelated warning
---

## Prompt

zabardast hogya meri jan zabardast hogya yar ab ek scene ye krni ha mjhy ke jo abhi ye forms hain na mere ye ghl se connect hoskty hain i guess yaha ka data sara ghl mei girana ha agar janu

## Response snapshot

Yes. Kept our database as the record (console Leads, partner applications, brands) and added GoHighLevel on top through HighLevel's API v2 with the sub-account's Private Integration token and Location ID (Railway: GHL_PRIVATE_TOKEN, GHL_LOCATION_ID; empty = off). Every printcopilot.co demo request, contact message (only when sent to PrintCoPilot itself, never a shop's own contact form), partner application (not spam) and new shop sign-up (never the password) becomes a GHL contact (upsert by email), gets tags (printcopilot + printcopilot-demo / -contact / -affiliate / -signup, plus printcopilot-plan-<plan>) on a separate call because upsert tags replace existing ones, and a note with every answer. It runs after the visitor's answer, so a form never waits on or fails because of GHL. Console → Leads gets a GoHighLevel panel: status, Test (reads one contact, sends nothing), and Send earlier leads once (demo, contact, partner applications; tagged -earlier so live workflows do not fire). Also: Privacy names the customer relationship tool among the services we share with, and the contact confirmation's invented "4 business hours (Mon–Fri, 8AM–6PM CT)" now says within 1 business day, on the mail and on the shops' contact page.

## Outcome

- ✅ Impact: once the two values are in Railway, every form on printcopilot.co lands in GHL with tags for workflows.
- 🧪 Tests: 67 backend + frontend suites passed, tsc clean.
- 📁 Files: see list above.
- 🔁 Next prompts: the owner then said to leave GHL for now ("abhi ye ghl wala kam chordo"); the commit (26b2ec1) is parked on local branch ghl-leads, not pushed.
- 🧠 Reflection: HighLevel's upsert replaces a contact's tags, so tags go through their own add call.
