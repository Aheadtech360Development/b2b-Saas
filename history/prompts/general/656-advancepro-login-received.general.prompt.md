---
id: 656
title: AdvancePro login received
stage: general
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner shares the client's AdvancePro login (a screenshot of a chat message) and asks what next
labels: ["integrations", "advancepro", "credentials"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none
tests:
 - none
---

## Prompt

ye lo bhae agye bhai mere?

(screenshot: a chat message carrying a username and a password for AdvancePro. Not copied here or anywhere.)

## Response snapshot

Did not copy, store or use the login. Told the owner to enter it only in EZ Mart's admin: add-on on in the console Features, Products → Inventory sync, username and password exactly, API address empty, Test. What each answer means (connected: Connect, location, Save with automatic off, Preview and a screenshot; not accepted: likely a desktop login rather than an API user, or a separate API address needed from the AdvancePro advisor; two-factor on; cannot reach: an address needed). Screenshots of errors only, never of passwords; once working, the client changes the password (it was shared in chat) and updates it in Inventory sync. No Sync now before the Preview.

## Outcome

- ✅ Impact: the login goes only where it belongs, with a plan for every Test answer.
- 🧪 Tests: none.
- 📁 Files: none.
- 🔁 Next prompts: the Test result, then the Preview screenshot.
- 🧠 Reflection: a credential pasted in chat is never repeated, recorded or used from here.
