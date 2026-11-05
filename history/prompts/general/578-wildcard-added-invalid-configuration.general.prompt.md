---
id: 578
title: Wildcard added, invalid configuration
stage: general
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner sends the Vercel Domains screenshot: *.printcopilot.co Invalid Configuration, ikrash and ezt-mart DNS Change Recommended
labels: ["domains", "vercel", "namecheap"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/578-wildcard-added-invalid-configuration.general.prompt.md
tests:
 - read-only DNS: _acme-challenge.printcopilot.co has no NS records yet (falls into the * CNAME → cname.vercel-dns.com); * CNAME target is cname.vercel-dns.com
---

## Prompt

(screenshot of Vercel → project → Domains) ?????

## Response snapshot

Step 6 done; red is expected until the challenge delegation exists: checked from outside, Namecheap has no _acme-challenge NS records yet, so that name falls into the * CNAME. Next: Enable Vercel DNS on printcopilot.co in the team's Domains, the two NS records in Namecheap, a screenshot of "View DNS configuration" on *.printcopilot.co so the * CNAME value is confirmed before touching it (it is cname.vercel-dns.com today; brands' sites depend on it). The yellow "DNS Change Recommended" rows work as they are.

## Outcome

- ✅ Impact: the owner knows the red is expected and what is left.
- 🧪 Tests: listed above.
- 📁 Files: this record.
- 🔁 Next prompts: the View DNS configuration screenshot; outside check after the NS records.
- 🧠 Reflection: a wildcard CNAME also answers for _acme-challenge until an explicit record is there.
