---
id: 402
title: New features wait for the manager
stage: general
date: 2026-10-13
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: keep the functionality the live platform does not have in memory; the owner asks the manager, and only then is it built
labels: ["admin-redesign", "scope", "manager-approval", "memory", "local-only"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - this record (two memory notes outside the repository: the rule, and the list of what waits)
tests:
 - none (a decision, no code changed)
---

## Prompt

nh abhi jo functionality existing platforms mei nh ha unko apni memory mei asve krlena wo mei manager se poochunga phir hi implement hoga saiha

## Response snapshot

Nothing new is built. The rule and the list are kept in memory:

- Not built (in a design, nothing on live behind it): automatic discounts without a code; selling beyond the US and Canada, other currencies, languages and units; a pickup cutoff; an international shipping zone with its own rate; the "AI ordering agent" card; the roles table as the design draws it (it takes access from people on live); and, from earlier rounds, a Quotes tab, a Handoffs tab, "Fill prices by rule", and customer notes as a list.
- Built on the local branch but new on top of live: the pickup switch, the Canada switch, the shop's time zone, "free shipping above", the Production role, staff invites by link, Reports' on-time measure and its "Artwork approved" line, the Copilot's page name. They are held back: the manager says yes before the push, and anything refused is taken out.
- On live but not yet in the redesign: the old revenue-by-day chart and "conversion rate", the gang sheet dashboard's two recent lists, the old customer timeline. They come back before the push, or the owner says drop them.

## Outcome

- ✅ Impact: new functionality now waits for the manager; nothing is built or pushed until the owner brings a yes.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: the manager's answers; the next designs.
- 🧠 Reflection: the same rule covers what was already built, so those parts were listed as held back rather than left to slip into the push.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
