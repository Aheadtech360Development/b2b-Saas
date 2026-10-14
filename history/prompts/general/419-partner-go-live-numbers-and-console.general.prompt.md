---
id: 419
title: Partner go-live, every number a setting, console like the design
stage: general
date: 2026-10-14
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Fix the two stale refresh tests; take the partner program live with every number in the super admin's hands and the console as designed
labels: ["partner-program", "tests", "platform-console", "settings", "release-plan"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/__tests__/api-client.test.ts
tests:
 - api-client.test.ts 7/7; tsc on the branch 0 errors
 - partner commits cherry-picked onto main 52238a0: one conflict (main.py), merged keeping main's billing autostart loop and adding the partner retry loop; migration 0061 re-chained onto 0059_audit_user_unlink, one head
 - read-only numbers audit of the partner program (63 items)
---

## Prompt

Token refresh ke 2 purane tests fail ho rahe hain, kyunke woh purana address mock karte hain. Ye chhota sa test fix hai. Theek kar doon? hn ye fix krdo aur suno meri jan wo jo partners wala kam tha wpo bhi live krdo bs manager ne ek cheez boldi ha mhy ke har cheez jitney bhi numbers hain na yani commision hogya cookie expiration policy wagra wo sb super admin apne pass se handle kr sky saiha bs ye ek cheez tum krlo saiha meri jan jaldi se aur live kro aur super admin ki ui bhi badlni ha jo kl design mei thi na whi krni ha baki features wagea kch nh cherna kro jaldi se jani

## Response snapshot

**The tests are fixed.** The two refresh tests now mock /api/v1/auth/refresh, the address the client calls. The type check asked for the same file's two header checks to say the first call exists. Commit f189a2a.

**Prepared for main:**
- The partner commits and their records were cherry-picked onto live main 52238a0.
- main.py keeps main's billing autostart loop beside the partner retry loop.
- Migration 0061 follows 0059_audit_user_unlink.

**The numbers audit found:**
- Already editable: hold, minimum payout, cookie window, return window, rates, terms, switches, plans, captions and the support email.
- Fixed in code:
  - how long a referral earns (lifetime);
  - the clawback window (none);
  - the 2-day application promise;
  - the W-9 rule (every payout);
  - the 1099 threshold;
  - the default rate plan control;
  - the rate-change notice (30 days promised, none in code).
- Several texts state numbers that are settings.
- A bug: an ended partner's earned commission never reaches a payout.

**The console difference.** The design has a dark top bar with the tabs inside it and an SA avatar, with Affiliates full width. The built console keeps the old white header, a "Brands" title on every tab, and a boxed Affiliates card.

## Outcome

- ✅ Impact: tests fixed; the go-live prepared and the gaps listed. Paused before building them (record 420).
- 🧪 Tests: listed above.
- 📁 Files: the client test.
- 🔁 Next prompts: resume with the settings, the console UI, the bug fix, a review and the push.
- 🧠 Reflection: two of the three read-only agents stopped at the session limit; the console was read by hand instead.

## Evaluation notes (flywheel)

- Failure modes observed: subagent session limit
- Graders run and results (PASS/FAIL): tests PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
