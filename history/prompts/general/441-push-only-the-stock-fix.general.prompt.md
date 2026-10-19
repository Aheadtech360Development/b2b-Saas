---
id: 441
title: Push only the stock fix
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: Give steps to bring only the sold-out inventory fix into the user's branch
labels: ["git", "handoff", "inventory"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/441-push-only-the-stock-fix.general.prompt.md
tests:
 - none
---

## Prompt

meta wala kam krdia ha push sirf is ka batao inventory qwale ka

## Response snapshot

The Meta work is already in. Gave a paste-ready Claude Code prompt and plain git commands to cherry-pick only 9e343ef
(fix: stop orders for sold-out items). It touches 4 backend files plus a new test, with no frontend changes, so a
conflict is unlikely. Run tests/test_stock_check.py, then push. No migration is needed.

## Outcome

- ✅ Impact: User can ship just the inventory fix
- 🧪 Tests: none
- 📁 Files: this PHR only
- 🔁 Next prompts: verify on the live store after deploy
- 🧠 Reflection: Scope the handoff to exactly the commit the user still needs

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
