---
id: 542
title: SanMar integration report
stage: general
date: 2026-11-02
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks for SanMar connected the way S&S Activewear is, and a report first
labels: ["suppliers", "sanmar", "ss-activewear", "integration", "planning"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/542-sanmar-integration-report.general.prompt.md
tests:
 - none (report; code read: services/suppliers/*, api/v1/admin/suppliers.py routes, marketing Home/Features SanMar lines; web: SanMar Web Services guide 24.6 and FTP guide 23.6 via search, PDFs not downloadable by script)
---

## Prompt

acha suno ab jis taraha yaha pr ssactivewerar conencted hana wese hi mjhy isme sanmar krna zara dekho proper aur batao kia report ha

## Response snapshot

Code: Suppliers API and settings are already per supplier (/suppliers/{supplier}/...), SanMar sits in CATALOG with available False. Reusable: settings (filters, pricing rules, stock location map, schedule), job runner, field mapping, orders screen. S&S-only and to be written for SanMar: API client (SOAP/XML vs S&S REST/JSON), catalogue reader, product converter, stock reader, PO sender and tracking; jobs.py and orders.py hard-code S&S. SanMar (guide 24.6, Aug 2026): SOAP web services + PromoStandards (Product Data 2.0, Media 1.1, Inventory 2.0, Pricing and Configuration, Order Status 2.0, Invoice 1.0) + FTP bulk files (product file, SanMar_EPDD.csv bulk stock, sanmar_dip.txt stock by warehouse); login = customer number + sanmar.com username/password, FTP separate; access only after emailing sanmarintegrations@sanmar.com with the customer number and signing an integration agreement; POs tested in EDEV first. Blocker: no SanMar account with web services access to build against. Marketing site claims SanMar is already connected (Home FAQ, Home card, Features). Same-blank overlap with S&S points back to the multi-supplier plan (540). Steps: access, client + catalogue + stock, orders + EDEV test, switch on.

## Outcome

- ✅ Impact: owner knows what SanMar needs before any build.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: SanMar access (customer number with web services and FTP), owner's go-ahead, marketing wording decision.
- 🧠 Reflection: unlike S&S, a brand cannot self-connect SanMar in a minute; SanMar's approval sits in front of every brand.
