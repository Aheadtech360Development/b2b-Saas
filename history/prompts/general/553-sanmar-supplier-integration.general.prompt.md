---
id: 553
title: SanMar supplier integration
stage: general
date: 2026-11-04
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks me to fill the SanMar login myself and build the SanMar connection like S&S Activewear's
labels: ["suppliers", "sanmar", "sftp", "import", "inventory", "integration"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/sanmar_service.py
 - backend/app/services/suppliers/sources.py
 - backend/app/services/suppliers/config.py
 - backend/app/services/suppliers/jobs.py
 - backend/app/services/suppliers/ss_products.py
 - backend/app/services/ss_activewear_service.py
 - backend/app/services/integrations_service.py
 - backend/app/api/v1/admin/suppliers.py
 - backend/app/api/v1/admin/integrations.py
 - backend/app/services/copilot/tools.py
 - backend/app/services/copilot/guide.py
 - backend/requirements.txt
 - backend/tests/test_sanmar.py
 - frontend/src/components/admin/suppliers/words.ts
 - frontend/src/components/admin/suppliers/EditSupplier.tsx
 - frontend/src/components/admin/suppliers/ProductSettings.tsx
 - frontend/src/components/admin/suppliers/SyncSettings.tsx
 - frontend/src/components/admin/suppliers/SupplierOverview.tsx
 - frontend/src/components/admin/suppliers/SuppliersManager.tsx
 - frontend/src/components/onboarding/OnboardingWizard.tsx
 - frontend/src/services/suppliers.service.ts
 - frontend/src/__tests__/supplier-sanmar-connection.test.tsx
 - frontend/src/__tests__/onboarding-wizard.test.tsx
 - .gitignore
 - history/prompts/general/553-sanmar-supplier-integration.general.prompt.md
tests:
 - pytest tests/test_sanmar.py (13 new) + product file, bulk, copilot, onboarding tests: pass
 - vitest supplier-sanmar-connection (5 new), onboarding-wizard (updated): pass; tsc clean
 - real SanMar files: 3,186 styles, 132,105 SKUs with no SKU clash, titles/descriptions/sizes checked
 - local DB through the job (_import, second _import, _update, _inventory): 13/13, cleaned up
---

## Prompt

bhai meri jan dekho tum khud hi krlo yar ye usrrname password jo tum mjhse file bnware hona plz khud hi krlo yar jaldi se bhai mei kch nh krrha hmmat nh jaldi se dekho ab kia krun ssactivewear ki tarah proper integration to krni ha yar

## Response snapshot

Wrote the login from the owner's screenshot into the git-ignored backend/.sanmar-test.env (never in chat, commits, memory or records). SanMar's port 21 offers plain FTP only (AUTH TLS refused), so nothing was sent there; SFTP on ftp.sanmar.com:2200 works (host key pinned in code). Read the account's SanMarPDD folder: SanMar_SDL_N.zip (products, 160,643 rows, 4,058 styles) and SanMar_EPDD_csv.zip (same SKUs with QTY, clean descriptions). Built `services/sanmar_service.py` (brand's own SFTP login, files cached on disk per account, read in a thread, rows turned into S&S's shapes: trimmed styles with stats, SKU rows with customerPrice = PIECE_PRICE, MSRP, case/dozen prices, GTIN, four picture links per colour, QTY), `suppliers/sources.py` (the one switch between S&S and SanMar), jobs and supplier API dispatching by supplier with supplier-scoped "already imported" checks and one-pass prefetch, integrations provider `sanmar` (FTP username + password, SFTP verifier, catalogue warmed in the background after connecting), SanMar available in the supplier list, orders closed for SanMar (409) until its order connection exists. Screens: words.ts per supplier (login fields, no Country, no Order Settings, one "All SanMar warehouses" stock source), onboarding's SanMar row connects (`/admin/suppliers?supplier=sanmar`), copilot guide and data updated.

## Outcome

- ✅ Impact: brands can connect SanMar and import, price and sync its products and stock like S&S's; orders to SanMar still to come.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: owner's yes to push; later SanMar orders (web services or FTP PO, EDEV test).
- 🧠 Reflection: SanMar's files fit S&S's pipeline once turned into S&S's shapes; the only supplier checks live in sources.py.
