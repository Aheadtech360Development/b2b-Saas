---
id: 411
title: Add by hand already there, checked
stage: general
date: 2026-10-14
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Add the button that gives a shop to a partner by hand
labels: ["partner-program", "affiliates", "correction"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/410-what-we-see-of-partner-leads.general.prompt.md (correction note)
 - this record (no code changed)
tests:
 - manual_referral_check.py (session scratchpad), 14/14 through the local API, everything it made removed
---

## Prompt

hn chalo ye choti si kami poori krdo

## Response snapshot

There was nothing to build. The button was already there:
- **"Add by hand"** on Affiliates, then Referrals. Its modal asks for the affiliate (terminated ones are not offered), searches shops by name or web address, and needs a reason.
- The server side and the shop search (`GET /platform/affiliates/shops`) were already built.

Record 410 said the button was missing. That was wrong: the search behind it was piped into `head`, which cut off the matching lines.

The button had never been walked, so it was checked through the local API (14 of 14 passed, all test data removed):
- the shop search by name and by address
- refusals for one letter, an empty reason, an unknown shop, and the same shop twice (which points to Reassign)
- the result on the Manual tab, on its own page, on the affiliate's page and in the activity log

The commission engine finds a referral by shop, whatever its source, so a shop added by hand earns from its next paid invoice. Past invoices are not counted; an adjustment covers them if wanted.

## Outcome

- ✅ Impact: the owner knows the button exists and works; the false gap is corrected in record 410 and in memory.
- 🧪 Tests: the manual referral check, 14/14.
- 📁 Files: records 410 and 411; memory (partner-affiliate-program).
- 🔁 Next prompts: the manager's numbers; the push.
- 🧠 Reflection: check that something is missing with an untruncated search before saying so.

## Evaluation notes (flywheel)

- Failure modes observed: `grep ... | head` hid the matches, and "no hits shown" was read as "not there".
- Graders run and results (PASS/FAIL): manual_referral_check.py PASS (14/14)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): use files_with_matches or count before claiming something is absent.
