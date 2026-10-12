/**
 * The five kinds of product, read from the fields that already decide how a
 * product sells, the same way the server's product list reads them
 * (services/product_catalog.kind_of).
 */
import { describe, expect, it } from "vitest";
import { KIND_WORDS, PRODUCT_KINDS, kindFields, kindOf } from "@/lib/productKinds";

describe("a product's kind", () => {
  it("comes from pricing_mode and the gang sheet builder's type", () => {
    expect(kindOf({ pricing_mode: "variant" })).toBe("stocked");
    expect(kindOf({ pricing_mode: "configurable" })).toBe("made");
    expect(kindOf({ gang_sheet_enabled: true, gang_sheet_type: null })).toBe("gang_sheet");
    expect(kindOf({ gang_sheet_enabled: true, gang_sheet_type: "upload_by_size" })).toBe("upload_by_size");
    expect(kindOf({ gang_sheet_enabled: true, gang_sheet_type: "upload_own" })).toBe("upload_own");
    // A builder type left behind on a product whose builder is off does not count.
    expect(kindOf({ pricing_mode: "variant", gang_sheet_enabled: false, gang_sheet_type: "upload_own" })).toBe("stocked");
  });

  it("is written back the same way when a product is made", () => {
    for (const { kind } of PRODUCT_KINDS) {
      const f = kindFields(kind);
      const back = kindOf({ pricing_mode: f.pricing_mode, gang_sheet_enabled: !!f.gang_sheet_type, gang_sheet_type: f.gang_sheet_type });
      expect(back).toBe(kind);
    }
  });

  it("has a name for each of the five, in the order the new-product step shows them", () => {
    expect(PRODUCT_KINDS.map((k) => k.title)).toEqual(["Stocked item", "Made to order", "Gang sheet", "Upload by size", "Upload your own sheet"]);
    expect(Object.keys(KIND_WORDS).sort()).toEqual(["gang_sheet", "made", "stocked", "upload_by_size", "upload_own"]);
  });
});
