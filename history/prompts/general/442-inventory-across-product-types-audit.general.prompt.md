---
id: 442
title: Inventory across product types audit
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: Audit how stock works for every product type (blanks, gang sheets by size, gang sheet builder, configurable like yard signs) after the user reported orders still go through at 0 stock
labels: ["inventory", "audit", "gang-sheets", "configurable-products", "requirements"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/442-inventory-across-product-types-audit.general.prompt.md
tests:
 - none (read-only audit)
---

## Prompt

bhae abhi bhi koi inventory ka msla hal nh hua pehle dekho ek bat smjhlo mere pass jo hana wo alag type ke products hain saiha bhai jisme dtf gang sheets by size gang sheet builder premium blanks tees saiha jiski alag alag configuration ha jese yard signs wagera to gang sheet wagera inme to stock ka opt hi nh arha ha bhaer poora dekho phir batao yar manager ne zaleel krdia mjy bhai

## Response snapshot

Findings:
1. Stock exists only for variant products (blanks): per variant, in InventoryRecord.
2. Gang sheet products (gang_sheet / upload_by_size / upload_own) and configurable products (yard signs) have no
   variants, so they have no stock at all. Checkout code says "no stock to check" for those lines. Only on/off
   switches exist: product status, option value `enabled`, gang sheet size `is_active`.
3. The admin products list sums variant stock, so it shows "0 in stock" for gang sheets, configurables and any blank
   whose variants never had a stock number entered. The storefront treats those blanks as unlimited (9999), so
   "0" in admin does not mean sold out.
4. A newly created variant gets no inventory record, so it shows 0 but sells without limit. Fix 9e343ef only
   covers variants whose stock was set to 0.
5. Signed-in checkout ignores variant status (out_of_stock / discontinued) and an inactive configurable product.
   Guest checkout checks both.
Asked the user to decide what "stock" means for untracked blanks and for gang sheets/configurables.

## Outcome

- ✅ Impact: Root cause explained (no stock model for non-variant products, and a misleading 0 in admin)
- 🧪 Tests: none
- 📁 Files: this PHR only
- 🔁 Next prompts: implement the chosen stock model in one consolidated commit
- 🧠 Reflection: The first fix addressed a real bug but not the user's actual product mix, so audit every product type first

## Evaluation notes (flywheel)

- Failure modes observed: fixed a narrow path without checking every product type
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
