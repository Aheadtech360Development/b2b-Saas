---
id: 381
title: Tax not loading long ZIP
stage: general
date: 2026-10-09
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: the tax key is set on the server but a client says tax fails to load; check it
labels: ["tax", "ziptax", "checkout", "live-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/tax_service.py
 - backend/tests/test_tax_zip.py (new)
tests:
 - live server, read-only, the shop innterflow, before the change — the same calculation the checkout makes: 75243 gives 8.25%, 10001 gives 8.875%, 90001 gives 10.25%, 37203 gives 9.75%, 83702 gives 6%, all from the provider, so the key and the lookup work; 75243-1234 and 752431234 give no tax; an empty ZIP gives none (expected); Oregon gives 0% from the provider (expected); the browser is allowed to call it from the shop's address
 - backend/tests/test_tax_zip.py — 6 passed (no database, no network; the provider is replaced by something that records what it was asked)
 - NOT done — the client's own screen was not seen, so this is the one failing case that was found, not proof it is the only one; the admin's Taxes page was not opened (it needs a sign-in on the live shop); no order was placed
---

## Prompt

(a screenshot of the server's variables: ZIPTAX_API_KEY with its value in full view. The value is not copied into this record.)

ye already dali hui ha lekin mera client kehra ha bhai tax fail horha ha load nh ho parha ha plz isko check kro yar meri jan

## Response snapshot

- The key is fine and the lookup works on the live server. Tax fails for one kind of address: a ZIP in its long form (75243-1234). The provider reads five digits only, and its refusal came out as no tax, shown and charged.
- Fixed in the one place every path goes through: the rate is looked up by the first five digits. Sent to main on its own, built in a separate clean copy of main, so nothing of the admin redesign went with it.
- The key was readable in the screenshot. It was not used or written anywhere here; it should be replaced with a new one at the provider and on the server.

## Outcome

- ✅ Impact: a buyer whose address has the long ZIP sees tax and is charged it.
- 🧪 Tests: as listed, with what was not done.
- 📁 Files: two.
- 🔁 Next prompts: whether orders already taken with no tax should be looked at; whether the reason the provider gives should reach the admin (the resolver drops it today).
- 🧠 Reflection: "it fails" with a key that is set looked like a key problem. Asking the live server the checkout's own question, with ordinary and awkward postcodes, separated "the lookup is down" from "one form of input is refused" in two calls.

## Evaluation notes (flywheel)

- Failure modes observed: a provider's refusal turned into a silent zero; the same input cleaned in two places with a rule that only padded short values.
- Graders run and results (PASS/FAIL): unit tests PASS (6); live calculation before the change as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after the deploy, the same live call with 75243-1234 should give 8.25%.
