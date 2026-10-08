---
id: 365
title: Innterflow DNS records walkthrough
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: which DNS records go where
labels: ["email", "resend", "dns", "shopify-domains", "vercel"]
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

(screenshots: Resend's DNS records for innterflow.com — TXT resend._domainkey, CNAME rsend, CNAME send, optional TXT _dmarc; Shopify (zrwholesale) Domains with innterflow.com and www.innterflow.com "Disconnected"; Vercel production on main b77005b with www.innterflow.com; Vercel domains: innterflow.com "Invalid Configuration" (308 to www), the rest "DNS Change Recommended")

ye proper dekho ab batao mei kia krun jani jaldi se yar

## Response snapshot

The domain is managed in the zrwholesale Shopify store; "Disconnected" only means it is not that Shopify store's address, and its DNS is still edited there. Add the four Resend records in Shopify → Settings → Domains → innterflow.com → Domain settings → Edit DNS settings → Add custom record (TXT resend._domainkey, CNAME rsend, CNAME send, TXT _dmarc), copying full values with Resend's copy buttons and names without the domain; edit an existing _dmarc rather than add a second. Verify in Resend, create a Sending-access key for innterflow.com, enter it with orders@innterflow.com in Innterflow's Settings → Email → More options, and use the store name. Separately: innterflow.com without www does not reach the site (Vercel "Invalid Configuration"); set the apex A record in Shopify to the value Vercel shows under View DNS configuration. "DNS Change Recommended" rows are Vercel's newer values, not breakage.

## Outcome

- ✅ Impact: exact records and places for the email domain, and the bare domain fix.
- 🧪 Tests: none (no code).
- 📁 Files: this record only.
- 🔁 Next prompts: confirm Resend verified; then the key and settings.
- 🧠 Reflection: none.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
