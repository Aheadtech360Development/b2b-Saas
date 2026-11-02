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
  /** only_values: the target question offers only the rule's choices (one
   *  rule row per choice kept); the rest leave the page. */
  action: "hide_option" | "disable_option" | "disable_value" | "only_values";
  target_option_id?: string | null;
  target_value_id?: string | null;
  note?: string | null;
}

/**
 * What the answers switch off. With the product's questions passed in, a
 * question a "show only these choices" rule leaves with nothing to offer is
 * hidden too, as the server leaves it out rather than ask for it.
 */
export function evaluateRules(
  rules: OptionRule[],
  sel: Record<string, string | string[]>,
  options?: { id: string; values: { id: string }[] }[],
) {
  const picked = new Set<string>();
  for (const v of Object.values(sel)) {
    if (Array.isArray(v)) v.forEach((x) => picked.add(x));
    else if (v) picked.add(v);
  }
  const hidden = new Set<string>();
  const disabledOptions = new Map<string, string>();
  const disabledValues = new Map<string, string>();
  // The choices each trigger keeps for each question: they add up, row by row.
  const kept = new Map<string, { optionId: string; choices: Set<string> }>();
  const onlyNotes = new Map<string, string>();
  for (const r of rules) {
    if (!picked.has(r.when_value_id)) continue;
    const note = r.note || "Not available with your current selection";
    if (r.action === "hide_option" && r.target_option_id) hidden.add(r.target_option_id);
    else if (r.action === "disable_option" && r.target_option_id) disabledOptions.set(r.target_option_id, note);
    else if (r.action === "disable_value" && r.target_value_id) disabledValues.set(r.target_value_id, note);
    else if (r.action === "only_values" && r.target_option_id && r.target_value_id) {
      const key = `${r.when_value_id}|${r.target_option_id}`;
      const entry = kept.get(key) ?? { optionId: r.target_option_id, choices: new Set<string>() };
      entry.choices.add(r.target_value_id);
      kept.set(key, entry);
      if (r.note && !onlyNotes.has(r.target_option_id)) onlyNotes.set(r.target_option_id, r.note);
    }
  }
  // Two triggers narrowing one question leave only what both keep.
  const onlyValues = new Map<string, Set<string>>();
  for (const { optionId, choices } of kept.values()) {
    const before = onlyValues.get(optionId);
    onlyValues.set(optionId, before ? new Set([...before].filter((c) => choices.has(c))) : new Set(choices));
  }
  for (const [optionId, choices] of onlyValues) {
    const values = options?.find((o) => o.id === optionId)?.values;
    const offered = values ? values.some((v) => choices.has(v.id)) : choices.size > 0;
    if (!offered) hidden.add(optionId);
  }
  return { hidden, disabledOptions, disabledValues, onlyValues, onlyNotes };
}

/** Whether a choice is still on offer: a "show only these choices" rule takes the rest off the page. */
export function offered(onlyValues: Map<string, Set<string>>, optionId: string, valueId: string): boolean {
  const keep = onlyValues.get(optionId);
  return !keep || keep.has(valueId);
}
