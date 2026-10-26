---
id: 480
title: Would an email automation deploy on Railway
stage: general
date: 2026-10-26
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: An AI automation contractor planned the product's email marketing; would the email automation deploy on Railway
labels: ["email", "automation", "railway", "deployment", "marketing"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (read backend/railway.json, railway.worker.json, app/main.py lifespan, services/trial_notices.py)
tests:
 - none
---

## Prompt

acha ab jaldi suno abhi ne ek ai automation wale bndy ne na plan bnaya ha is prodcut ki email marketing kasaiha meri jan to kuch plan ha ye batao ismejo email automation ha wo agar bnjae to railway pe deploy hojaegi na

## Response snapshot

- Built in this codebase: yes, it goes to Railway with every push, like the portal did. No new server needed.
- Live runs uvicorn only (railway.json); railway.worker.json / railway.beat.json exist but no Celery worker or beat runs. Timed emails therefore follow the pattern already live for trial reminders: an in-process loop in main.py's lifespan, one worker acting per tick through a Redis lock, each email recorded as sent. Resend is already the sender.
- Built in an outside tool (n8n, Make, Zapier, GoHighLevel, Instantly): it runs on that tool's servers, not Railway (n8n can be its own Railway service, its own cost).
- Two cautions: cold email to people who never signed up must not use the product's own sending domain (orders and password mail would land in spam); marketing mail needs an unsubscribe link and its own subdomain.
- Asked for the plan to say which parts are code and which are a tool, and what exists already.

## Outcome

- ✅ Impact: the owner knows where such automation would run and what it needs.
- 🔁 Next prompts: the contractor's plan.
- 🧠 Reflection: the memory said trial emails never sent on live; the code had moved them in-process (f1e9a94). Corrected the note.
