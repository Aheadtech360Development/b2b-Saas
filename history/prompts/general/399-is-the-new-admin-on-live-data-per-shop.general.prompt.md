---
id: 399
title: Is the new admin on live data per shop
stage: general
date: 2026-10-13
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: answer whether the redesigned admin will run on live data per shop like today's dashboard, and whether going live will cause problems
labels: ["admin-redesign", "go-live", "multi-tenant", "merge", "local-only"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (a question; two read-only checks: a merge preview against origin/main and the newest migrations on each side)
tests:
 - git merge-tree origin/main HEAD (nothing changed) — 2 files conflict (backend/app/api/v1/gang_sheets.py, frontend admin gang-sheets page); main.py, the billing page, OrderGangSheets and gangSheets.service merge by themselves
 - migrations — main ends at 0059; the branch's one migration, 0060, follows it
 - NOT run — the merge itself, a production build of the branch, the full test suites, a second shop on the local database
---

## Prompt

acha ye jo tum poora ui bnarae ho na bad mei live jese abhi jo live dashboard ha wo sb live deata har cheez krrha per tenant to tum apis connect krdogy na koi issue to nh create krogy na bhai?

## Response snapshot

Yes, and there is no separate "connect the APIs" step: the new admin is not a mock. Every screen already calls the same backend the live dashboard uses, scoped per shop the same way (the shop on every query, and the database's own row rules on live). On localhost the only difference is the database. Markets is the one screen with nothing behind it, because there is nothing to save.

No blanket promise of "no issues". What stands between the branch and live, checked just now:
1. Main moved 14 commits since the branch was cut (the billing fix, gang sheet jobs with the order's number and name, tracking, tax). A merge preview shows 2 files in conflict; they are joined by hand, keeping main's fixes.
2. One migration (0060): two new columns on contact messages, nothing removed. It is in order after main's newest.
3. A production build and the full test suites have not been run on the branch.
4. The screens were run on one shop locally. Before going live, a second shop on the local database, to see that neither sees the other's rows.

Only live data can show: a label from a real carrier, a connected S&S account, a real Copilot answer, mail going out.

Also said: customers will see a new line, "Artwork approved", in their order's history (the email already goes); old report and analytics links land on the new Reports.

## Outcome

- ✅ Impact: the owner knows the new admin already reads real per-shop data, and what has to happen before it goes live.
- 🧪 Tests: two read-only checks, as listed.
- 📁 Files: this record only.
- 🔁 Next prompts: the owner's test on live data; their yes before any push.
- 🧠 Reflection: the honest answer to "will it cause an issue" was a short list of what is unproven, with the two facts that could be checked on the spot checked first.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): merge preview read; migrations in order
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): the merge in a scratch worktree, then a production build there.
