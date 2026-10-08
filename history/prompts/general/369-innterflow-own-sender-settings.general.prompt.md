---
id: 369
title: Innterflow own sender settings
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: what to enter after making the API key
labels: ["email", "resend", "settings"]
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

(screenshot: Innterflow admin → Settings → General & Email → Email notifications: alerts to info@innterflow.com, Sender name empty, Reply-to empty, own Resend API key filled, Send from empty, "Test & connect")

ab kia krun jani api key bnali

## Response snapshot

Fill Send from with orders@innterflow.com, leave Sender name empty (the store name is used) and Reply-to empty (replies go to info@innterflow.com), and press Test & connect — but only once Resend shows innterflow.com Verified. Read from the code: with a brand key and address set, mail goes only through them, with no fallback to the platform's, and Test & connect checks the addresses but neither the key nor the domain; a key from another account, an unverified domain or a typo stops every Innterflow email silently. Then send one real email (a password reset to yourself) and check From, mailed-by and signed-by. Offered a fix: fall back to the platform's sender when the brand's fails, and make Test & connect send a real test email.

## Outcome

- ✅ Impact: what to enter, and the one condition before saving.
- 🧪 Tests: none.
- 📁 Files: this record only.
- 🔁 Next prompts: test email check; go-ahead for the fallback and real test.
- 🧠 Reflection: the existing own-sender path fails closed and is tested by nothing on the page.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
