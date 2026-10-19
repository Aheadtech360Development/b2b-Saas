---
id: 440
title: How to bring work into redesign branch
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: Explain how to bring this session's work into the user's own branch from their local Claude Code and push it
labels: ["git", "handoff", "deploy"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/440-how-to-bring-work-into-redesign-branch.general.prompt.md
tests:
 - none
---

## Prompt

saiha zabardast hogya ha batado kese push krna mei claude code se kralunga saiha jani ye sb

## Response snapshot

Gave a paste-ready prompt for the user's local Claude Code: fetch claude/compassionate-albattani-0c4vur, cherry-pick
5cabda1 (Meta Conversions API) and 9e343ef (sold-out fix), keep the redesign UI on conflicts while re-adding the small
additions, run the new tests plus tsc and vitest, then push. Also gave the plain git commands. No migrations or new env
vars are required (META_GRAPH_API_VERSION is optional).

## Outcome

- ✅ Impact: User can merge and ship the work themselves
- 🧪 Tests: none
- 📁 Files: this PHR only
- 🔁 Next prompts: help with conflicts, or with the CAPI test after deploy
- 🧠 Reflection: A paste-ready prompt suits a user who drives their own Claude Code

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
