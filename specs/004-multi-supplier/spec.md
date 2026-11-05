# One product, several sources (multi-supplier), phase 1

**Asked:** the manager, 2026-11-04: the same blank (e.g. Gildan 5000) from the shop's own stock, S&S and SanMar showed as separate products. The owner, 2026-11-05: "apply what is most proper".

## What a shop gets

- On one of its own stocked products (Products → product → Variants and stock → **Sources**), the shop links the same style at S&S Activewear and/or SanMar. Each colour/size is matched to the supplier's: same colour and size (2XL = XXL), then the barcode another supplier gave, then a close colour name in the same size. Before linking it sees what matched, what did not, any close names to check, and a warning if it also has that style as a separately imported product.
- Buyers see **one product**. Its stock is the shop's own plus each linked supplier's.
- At checkout a line takes the shop's own stock first, then the cheapest supplier that has it, then the next. What a supplier covers is recorded per line.
- S&S is sent only its part (the existing "Send to S&S" and automatic sending). SanMar's part shows on the order page to order by hand (SanMar orders are not built).
- Every sync (stock-only and full) refreshes each linked supplier's stock; the full sync also its cost. Importing a style that is already a source is refused, so it never shows twice.
- The Stock box on the product page is the shop's own stock; typing a number never touches a supplier's.
- Retail (no supplier catalogues) does not see Sources.

## Decisions (chosen 2026-11-05)

1. Own stock first; then suppliers cheapest first; more stock breaks a tie.
2. A line may be split between own stock and suppliers.
3. One selling price whatever the source; cost kept per source.
4. Each supplier's existing safety stock setting applies.
5. The product keeps its own SKUs; supplier SKUs live on the source.

## Out of scope (phase 2 or later)

- Turning an already imported S&S/SanMar product into one with sources, or merging duplicates.
- Matching a colour/size by hand when no match is found.
- Sending orders to SanMar; a per-shop choice of rule (priority list, one supplier per order).
- Profit per source in reports.

## Acceptance (all checked, see tasks.md)

- Linking, matching, stock shown, checkout split, S&S request, sync, import refusal, returns and removal behave as above on the local database.
- Shops without sources: checkout takes stock exactly as before (most stock first); imported products unchanged.
