---
id: 657
title: AdvancePro invalid login credentials
stage: general
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: EZ Mart's Test in Inventory sync answers "AdvancePro did not accept this username and password: Invalid login credentials"
labels: ["integrations", "advancepro"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none
tests:
 - none (read from the owner's screenshot: the message is AdvancePro's own failedResponse.errorMessage, so the live connector reached AdvancePro's API and read its answer)
---

## Prompt

?????????

(screenshot: Products → Inventory sync on EZ Mart, username field filled, password masked, API address empty, red line "AdvancePro did not accept this username and password: Invalid login credentials")

## Response snapshot

The connector works end to end: the words are AdvancePro's own refusal. The login is not an API login for that address: most likely the desktop login rather than an API user, or the desktop company answers on another API address, or the login needs the company's Brand ID (the spec's optional Brand_id header on login; a field can be added if the advisor says so). The client asks the AdvancePro advisor for an API user with two-factor off, the API address, and whether a Brand ID is needed; a ready-to-send English draft given (not sent).

## Outcome

- ✅ Impact: first live contact with AdvancePro confirmed the path; the blocker is the client's API access.
- 🧪 Tests: none.
- 📁 Files: none.
- 🔁 Next prompts: the advisor's answer (API user, address, Brand ID).
- 🧠 Reflection: none.
