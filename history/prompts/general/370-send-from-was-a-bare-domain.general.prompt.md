---
id: 370
title: Send from was a bare domain
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: brand signup email did not arrive
labels: ["email", "resend", "settings", "debugging"]
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

nh jani mene har chees jesa tumne bola krdi domain verify hogya dns verify hogye resend se lekin abhi mene ek account bnaya saiha ek brand ke shop pe usually mail ati ha abhi lekin nh ai jani dekho code wagera kuch issue to nh hana jani

(then, interrupting: screenshot of Settings → Email: alerts info@innterflow.com, Sender name "innterflow", own key saved ••••kecq, Send from "innterflow.com")

ye dekho yar sb to krdia phir bhi nh hua jani

## Response snapshot

"Send from" holds innterflow.com — a domain, not an address — so every email's From was "innterflow <innterflow.com>", which Resend rejects; with a brand key set there is no fallback, so mail stopped. The key itself is read as saved. Fix: Send from orders@innterflow.com, Sender name Innterflow or blank, Test & connect, wait a few minutes (settings are cached up to five minutes in background workers), then sign up again. The code gap: the form accepted a bare domain and the send path does not fall back to the platform sender; offered to add both checks.

## Outcome

- ✅ Impact: cause found from the screenshot; one field to correct.
- 🧪 Tests: none.
- 📁 Files: this record only.
- 🔁 Next prompts: confirm the email arrives; go-ahead for validation and fallback.
- 🧠 Reflection: the page accepts input that silently stops a brand's mail.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
