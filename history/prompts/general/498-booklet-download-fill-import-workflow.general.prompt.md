---
id: 498
title: Booklet download, fill and import workflow at 64,584 rows
stage: general
date: 2026-10-28
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Owner builds options, downloads the CSV, has prices filled in, imports it back; the download fails
labels: ["product-options", "price-grid", "csv-import", "performance", "background-job"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/combinations.py (MAX_MATRIX 100,000)
 - backend/app/services/price_grid.py (file rows 2 x the table; a whole-list import removes the rows it did not write by its own updated_at stamp, not by 64,584 keys sent as one 38 MB array)
 - backend/app/api/v1/admin/product_options.py (preview counts unlisted rows by md5 digests; import plans then writes in the background with its state in Redis, GET .../price-grid/import says how it went, a second import while one runs is refused, no Redis = writes in the request as before)
 - frontend/src/components/admin/PriceGridImport.tsx (asks every 2 s, shows the seconds, tolerates a few missed answers)
 - frontend/src/__tests__/price-table-whole-list.test.tsx (+1)
tests:
 - backend tests/test_price_grid.py: 38 passed, 1 skipped; app imports
 - frontend price-table-whole-list: 4 passed; tsc clean
 - local database (scratchpad booklet_import_local.py, booklet_import_profile.py): the booklet shape filled in full; before: preview 115 s, import 163 s, and the 38 MB key array failed Postgres' shared memory; after: preview 4-5 s, import 55-59 s in the request
 - local database + Redis (scratchpad booklet_background_import.py): request answers in 2.2 s; second import refused (409); running x17 then done in 38 s, 64,584 prices; 40 random booklets priced exactly as the file
---

## Prompt

bhare abhi to mei ye krta hn mei options bnata hn download csv krta hn phir usme prices dalwata hn phir dubara import krdeta hn saiha ab masla ye horha ha download bhi to nh hori hana csv bhae plz dekho isko yar

## Response snapshot

- The download is fixed by 2f9572f; the owner's next step would have failed too: a booklet table filled in full is 64,584 priced rows, over the 50,000 a product held. Raised to 100,000.
- At that size the import was slow and fragile: the whole-list removal and the preview's count sent every key (~600 characters each with eight questions) to Postgres as one 38 MB array, which ran out of shared memory locally. Removal now goes by the import's own updated_at stamp; the preview compares md5 digests in Python.
- Even then, writing 64,584 rows took about a minute on the local disk, close to the 60 s Railway's edge is reported to allow a silent request. The import now plans in the request (2 s), writes in the background, and the page asks every 2 s until it is done.

## Outcome

- ✅ Impact: download, fill every row, import works for the booklet's 64,584 combinations.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: owner's yes to push; after the deploy, download the booklet table on live and try a filled file.
- 🧠 Reflection: a key that grows with the number of questions makes "send the keys" a size problem; mark what was written instead of listing it.
