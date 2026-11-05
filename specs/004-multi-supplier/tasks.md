# Tasks: one product, several sources

## Phase 1 (LIVE 2026-11-05, main 66c0109)

- [x] T1 Migration 0073: `warehouses.supplier`, `variant_sources`, `order_item_sources` (+ RLS); models.
- [x] T2 `sourcing.py`: locations, matching (colour+size, barcode, close name), preview, link, unlink, product sources.
- [x] T3 Checkout and reprint: own stock first, then a supplier; shares recorded.
- [x] T4 S&S sending uses the shares; order page shows each line's split; SanMar's part to order by hand.
- [x] T5 Syncs refresh linked stock (and cost on a full sync); import refuses a linked style.
- [x] T6 Supplier locations kept out of own-stock paths (feeds, default location, PO receiving, returns, Stock box); buyers see "Partner warehouse".
- [x] T7 Admin API + Sources card on the product page.
- [x] T8 Checks: tests/test_sourcing.py; frontend product-sources; local database walk 28/28; full backend suite 743 passed, 0 failed (81 errors = the known conftest seed issue); tsc clean in src.

## Phase 2 (2026-11-05, owner: "jo proper baki ha wo krdo")

- [x] T9 Turn an imported S&S/SanMar product into the shop's own with that supplier as its source (`sourcing.convert`): same page and SKUs, the supplier's stock moves from its feed locations to its own location, own stock elsewhere stays; `jobs._claim` never takes a product with sources back.
- [x] T10 Pick a colour/size by hand in the preview (`apply_manual`, link `pairs`): wrong close matches undone, missing ones picked, one supplier SKU per variant, another product's SKU refused.
- [x] T11 The shop's rule (setting `sourcing_rule`, tenant-scoped): the cheapest supplier, where one that has the whole rest of the line goes first (one parcel), or one supplier first always.
- [x] T12 Migration 0074: `order_item_sources.unit_cost`; the order page shows what each part cost.
- [x] T13 SanMar "Orders to place" (Suppliers → SanMar → Edit supplier → Orders to place): the parts to order on SanMar's website, totals per SKU, CSV, "Mark as ordered" with SanMar's number (a `supplier_orders` row, once; a line on the order's history).
- [x] T14 An imported duplicate of the linked style can be set to Draft from the preview.
- [x] T15 Checks: tests/test_sourcing.py 13; frontend product-sources 9 + supplier-manual-orders 2; local database walk part 2 (scratchpad sourcing_local_check2.py) 18/18, part 1 re-run; full backend suite.

## Not built

- [ ] Orders sent to SanMar automatically: needs SanMar's order access for the shop (web services login, integration agreement) and a test in SanMar's EDEV first.
- [ ] Profit by source in Reports (each order shows its parts' cost already).
