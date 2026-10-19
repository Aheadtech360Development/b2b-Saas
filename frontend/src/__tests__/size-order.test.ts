/**
 * Sizes on the size chart in the browser (lib/utils compareSizes / sizeRank).
 *
 * The same cases as backend/tests/test_size_order.py: the shop sorts sizes on
 * the server for the builder's product page and the filters, and here for the
 * other product page, the size grid and quick order, and the two must agree.
 * The grid used to sort alphabetically (L, M, S, XL, XS).
 */
import { describe, expect, it } from "vitest";
import { compareSizes, sizeRank, sortSizes } from "@/lib/utils";

const chart = (sizes: string[]) => [...sizes].sort(compareSizes);

describe("the size chart order", () => {
  it("puts letter sizes on the chart", () => {
    expect(chart(["XL", "M", "XS", "L", "S"])).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(chart(["3XL", "XL", "XXS", "2X", "L", "4XL"])).toEqual(["XXS", "L", "XL", "2X", "3XL", "4XL"]);
  });

  it("reads the same size written another way", () => {
    expect(chart(["Large", "Small", "X-Large", "Medium", "XX-Large"])).toEqual(["Small", "Medium", "Large", "X-Large", "XX-Large"]);
    expect(sizeRank("2XL")).toEqual(sizeRank("XXL"));
    expect(sizeRank("2x")).toEqual(sizeRank("XXL"));
    expect(sizeRank(" xs ")).toEqual(sizeRank("XS"));
  });

  it("puts children before adults and one size last", () => {
    expect(chart(["S", "YL", "YS", "M", "One Size"])).toEqual(["YS", "YL", "S", "M", "One Size"]);
    expect(chart(["4T", "2T", "0-3M", "NB", "6-12M", "3-6M"])).toEqual(["NB", "0-3M", "3-6M", "6-12M", "2T", "4T"]);
    expect(chart(["M (Youth)", "S (Youth)", "S"])).toEqual(["S (Youth)", "M (Youth)", "S"]);
  });

  it("orders numbered sizes by number", () => {
    expect(chart(["10", "2", "8", "4"])).toEqual(["2", "4", "8", "10"]);
    expect(chart(["10.5", "9", "9.5"])).toEqual(["9", "9.5", "10.5"]);
    expect(chart(["32x30", "30x32", "30x30"])).toEqual(["30x30", "30x32", "32x30"]);
    expect(chart(["10-12", "8-10", "14-16"])).toEqual(["8-10", "10-12", "14-16"]);
  });

  it("puts tall and two-size fits by their sizes", () => {
    expect(chart(["XLT", "L", "LT", "XL"])).toEqual(["L", "LT", "XL", "XLT"]);
    expect(chart(["L/XL", "S/M", "M"])).toEqual(["S/M", "M", "L/XL"]);
  });

  it("keeps unknown sizes in the order they came, after the chart", () => {
    expect(chart(["15oz", "S", "11oz", "M"])).toEqual(["S", "M", "15oz", "11oz"]);
    expect(chart(["8x10 in", "5x7 in"])).toEqual(["8x10 in", "5x7 in"]);
  });

  it("sorts rows by their size for the pages that hold variants", () => {
    const rows = [{ size: "L" }, { size: "XS" }, { size: "M" }];
    expect(sortSizes(rows, (r) => r.size).map((r) => r.size)).toEqual(["XS", "M", "L"]);
  });
});
