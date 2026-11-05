---
id: 577
title: Wildcard step by step
stage: general
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks for the wildcard domain setup click by click
labels: ["domains", "vercel", "namecheap"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/577-wildcard-step-by-step.general.prompt.md
tests:
 - none
---

## Prompt

kia krun step by step batao jaldi janu

## Response snapshot

One action per step: Vercel (project → Settings → Domains → Add Domain *.printcopilot.co; team Domains → printcopilot.co → Enable Vercel DNS, nameservers unchanged), Namecheap (Domain List → Manage → Advanced DNS → two NS records, Host _acme-challenge, values ns1/ns2.vercel-dns.com; the * CNAME at the value Vercel shows), wait 15 to 30 minutes for Valid Configuration, then tell me to check from outside; a screenshot if any button is missing.

## Outcome

- ✅ Impact: the owner can do it alone.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: outside check; update the "add it in Vercel" emails.
- 🧠 Reflection: none.
