/**
 * What a product's rules switch off for the answers picked so far: the one
 * reading both product pages use (lib/optionRules), the mirror of the
 * server's configurator_service.evaluate_rules.
 */
import { describe, expect, it } from "vitest";
import { evaluateRules, offered, type OptionRule } from "@/lib/optionRules";

const OPTIONS = [
  { id: "paper", values: [{ id: "p14" }, { id: "p16" }] },
  { id: "coating", values: [{ id: "uv" }, { id: "none" }, { id: "matte" }] },
  { id: "corners", values: [{ id: "square" }, { id: "round" }] },
];

const keep = (when: string, option: string, value: string, note?: string): OptionRule =>
  ({ when_value_id: when, action: "only_values", target_option_id: option, target_value_id: value, note });

describe("show only these choices", () => {
  it("offers only the choices a rule keeps, and only while its trigger is picked", () => {
    const rules = [keep("p14", "coating", "none"), keep("p14", "coating", "matte")];
    const on = evaluateRules(rules, { paper: "p14" }, OPTIONS);
    expect([...on.onlyValues.get("coating")!]).toEqual(["none", "matte"]);
    expect(offered(on.onlyValues, "coating", "uv")).toBe(false);
    expect(offered(on.onlyValues, "coating", "none")).toBe(true);
    expect(offered(on.onlyValues, "corners", "round")).toBe(true);

    const off = evaluateRules(rules, { paper: "p16" }, OPTIONS);
    expect(off.onlyValues.size).toBe(0);
    expect(offered(off.onlyValues, "coating", "uv")).toBe(true);
  });

  it("leaves only what two triggers both keep", () => {
    const rules = [
      keep("p14", "coating", "none"), keep("p14", "coating", "matte"),
      keep("round", "coating", "matte"), keep("round", "coating", "uv"),
    ];
    const r = evaluateRules(rules, { paper: "p14", corners: "round" }, OPTIONS);
    expect([...r.onlyValues.get("coating")!]).toEqual(["matte"]);
    expect(r.hidden.has("coating")).toBe(false);
  });

  it("hides a question left with nothing to offer, rather than ask for it", () => {
    const disagree = [keep("p14", "coating", "none"), keep("round", "coating", "uv")];
    expect(evaluateRules(disagree, { paper: "p14", corners: "round" }, OPTIONS).hidden.has("coating")).toBe(true);
    // Kept, but not a choice the page offers (switched off in the admin).
    const gone = [keep("p14", "coating", "foil")];
    expect(evaluateRules(gone, { paper: "p14" }, OPTIONS).hidden.has("coating")).toBe(true);
    expect(evaluateRules(gone, { paper: "p14" }).hidden.has("coating")).toBe(false);
  });

  it("carries the shop's note only when it wrote one", () => {
    expect(evaluateRules([keep("p14", "coating", "none", "Uncoated paper takes no coating")], { paper: "p14" }, OPTIONS)
      .onlyNotes.get("coating")).toBe("Uncoated paper takes no coating");
    expect(evaluateRules([keep("p14", "coating", "none")], { paper: "p14" }, OPTIONS).onlyNotes.has("coating")).toBe(false);
  });

  it("leaves the other rules as they were", () => {
    const r = evaluateRules([
      { when_value_id: "p14", action: "hide_option", target_option_id: "corners" },
      { when_value_id: "p14", action: "disable_value", target_value_id: "uv", note: "Not on uncoated" },
    ], { paper: "p14" }, OPTIONS);
    expect(r.hidden.has("corners")).toBe(true);
    expect(r.disabledValues.get("uv")).toBe("Not on uncoated");
    expect(r.onlyValues.size).toBe(0);
  });
});
