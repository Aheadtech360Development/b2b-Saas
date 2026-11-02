---
id: 545
title: Show only these choices rule
stage: general
date: 2026-11-02
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner says push the rules fix and build the competitor's "show only" rule properly
labels: ["configurable-products", "option-rules", "website-builder", "storefront", "admin", "feature"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/models/product_option.py
 - backend/app/services/configurator_service.py
 - backend/app/api/v1/admin/product_options.py
 - backend/app/services/product_import.py
 - backend/tests/test_option_rules.py
 - frontend/src/lib/optionRules.ts
 - frontend/src/components/storefront/ThemeProductBuy.tsx
 - frontend/src/components/storefront/ProductConfigurator.tsx
 - frontend/src/components/admin/ProductOptionsBuilder.tsx
 - frontend/src/__tests__/option-rules.test.ts
 - frontend/src/__tests__/builder-option-rules.test.tsx
 - frontend/src/__tests__/configurator-only-values.test.tsx
 - frontend/src/__tests__/options-builder-only-values.test.tsx
 - history/prompts/general/545-show-only-these-choices-rule.general.prompt.md
tests:
 - vitest 8 files, 40 tests (rules lib, builder page, older page, admin form, builder price, sign-in, add product, edit page): pass
 - pytest test_option_rules (8 new), test_price_grid, test_product_export, test_product_import, test_bulk_order: 71 passed, 1 skipped
 - tsc --noEmit: no errors in src; ruff: no new findings in changed files
 - no local DB run (Docker not running); table 0034 has no unique/check constraint or trigger, rows go through the same ORM path as existing rules
---

## Prompt

n ye bhi push kro aur show only wala bhi poora proper kro yar meri jan jaldi se jani

## Response snapshot

Pushed the rules fix (main 6aa0ac3, live on website and backend). Built "show only these choices": new rule action `only_values`, stored as one row per choice kept (no migration: action VARCHAR(20), no CHECK). One trigger's rows add up; two triggers on one question intersect; a question left with nothing it sells is hidden and not asked for. Server: evaluate_rules returns only_values/only_notes, compute_price refuses a removed choice (with the shop's note), default_selections opens on a kept choice. Admin: action "show only these choices" with a tick list of the target question's choices (hint when none ticked; such a rule is not saved), saved as target_values and turned into rows; loads back grouped as one rule; removing a choice shifts the ticks. Products file: export writes one entry per kept choice, import writes both option and choice. Both product pages: removed choices leave the page, the one left is picked, the shop's note shows under the question. Committed locally, push waits for the owner's yes.

## Outcome

- ✅ Impact: 14 pt card -> Coating offers only No Coating with one rule; 16 pt offers every coating.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: owner's yes to push; owner sets the rule on the live product (remove the old "hide the field" rule).
- 🧠 Reflection: a rule that changes what a buyer sees has four readers (server, two pages, admin, products file); all four were changed together.
