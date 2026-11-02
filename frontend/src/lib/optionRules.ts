/**
 * A configurable product's "Answers that rule others out": what the answers
 * picked so far switch off.
 *
 * Mirror of `configurator_service.evaluate_rules`, which the server runs on
 * every price and every add to cart. Both product pages (the older one's
 * ProductConfigurator and the website builder's ThemeProductBuy) read the rules
 * through this, so the form a buyer sees and what the server accepts can never
 * disagree.
 */
export interface OptionRule {
  when_value_id: string;
  action: "hide_option" | "disable_option" | "disable_value";
  target_option_id?: string | null;
  target_value_id?: string | null;
  note?: string | null;
}

export function evaluateRules(rules: OptionRule[], sel: Record<string, string | string[]>) {
  const picked = new Set<string>();
  for (const v of Object.values(sel)) {
    if (Array.isArray(v)) v.forEach((x) => picked.add(x));
    else if (v) picked.add(v);
  }
  const hidden = new Set<string>();
  const disabledOptions = new Map<string, string>();
  const disabledValues = new Map<string, string>();
  for (const r of rules) {
    if (!picked.has(r.when_value_id)) continue;
    const note = r.note || "Not available with your current selection";
    if (r.action === "hide_option" && r.target_option_id) hidden.add(r.target_option_id);
    else if (r.action === "disable_option" && r.target_option_id) disabledOptions.set(r.target_option_id, note);
    else if (r.action === "disable_value" && r.target_value_id) disabledValues.set(r.target_value_id, note);
  }
  return { hidden, disabledOptions, disabledValues };
}
