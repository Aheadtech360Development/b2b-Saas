"use client";

/**
 * The price table — one price per combination of choices.
 *
 * Per-choice deltas force the price to be separable: price(Small, Rounded) has
 * to equal price(Small) + price(Rounded). Real pricing often is not, because
 * rounded corners cost more on a bigger card. This is where a brand says so.
 *
 * Every option with choices is in the table automatically, so adding an option
 * grows it on its own. Cells are generated, never stored, and only the ones
 * somebody types a price into are saved. A blank cell is not missing data — it
 * means the ordinary per-choice price applies, which is what every product
 * does today. The exception is a product sold in set quantities whose table
 * prices whole lines (a supplier's list): there a blank cell cannot be
 * ordered, since the rule would charge the base price for every item in the set.
 */
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface MatrixOption {
  id: string;
  name: string;
  values: { id: string; label: string }[];
}

interface AllOption {
  id: string;
  name: string;
  in_price_matrix: boolean;
  value_count: number;
}

interface Cell {
  combo_key: string;
  label: string;
  selections: Record<string, string>;
  values: { option: string; value: string }[];
  unit_price: number | null;
  /** The whole line's price, for a product that asks how many as a question. */
  line_price: number | null;
  setup_fee: number | null;
  sku: string | null;
  enabled: boolean;
  note: string | null;
  has_own_price: boolean;
  inherited_from: string | null;
  inherited_unit_price: number | null;
  inherited_line_price: number | null;
}

interface Payload {
  matrix_options: MatrixOption[];
  all_options: AllOption[];
  total: number;
  offset: number;
  limit: number;
  max_matrix: number;
  too_large: boolean;
  combinations: Cell[];
  priced_count: number;
  /** Set when the product asks how many as a question: each cell is then the
   *  price of the whole line for that many ("30 signs: $1,106.84"). */
  quantity_option_id: string | null;
  /** Choices no saved price names, in the questions the saved prices cover:
   *  no combination with one of them has a price of its own. */
  unpriced_choices?: { option: string; choices: string[]; count: number }[];
  /** The saved prices are whole lines: a combination without one cannot be
   *  ordered, rather than being priced by rule. */
  line_priced?: boolean;
}

const PAGE = 50;

export function CombinationPricing({
  productId,
  unsaved,
}: {
  productId: string;
  /** True while the builder above has edits not yet saved — the grid is built
   *  from what the server knows, so it would be showing the wrong options. */
  unsaved?: boolean;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [page, setPage] = useState(0);
  const [edits, setEdits] = useState<Record<string, Partial<Cell>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<Payload>(
        `/api/v1/admin/products/${productId}/combinations?offset=${page * PAGE}&limit=${PAGE}`
      );
      setData(res);
      setEdits({});
    } catch {
      setMsg({ ok: false, text: "Could not load the price table." });
    }
    setLoading(false);
  }, [productId, page]);

  useEffect(() => { load(); }, [load]);

  function edit(key: string, patch: Partial<Cell>) {
    setEdits(e => ({ ...e, [key]: { ...e[key], ...patch } }));
  }

  function valueOf(cell: Cell, field: "unit_price" | "line_price" | "setup_fee" | "sku" | "enabled") {
    const e = edits[cell.combo_key];
    return e && field in e ? e[field] : cell[field];
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    setMsg(null);
    try {
      // Only the cells on this page are sent, so editing page three cannot
      // wipe the prices set on page one.
      const combinations = data.combinations.map(cell => ({
        selections: cell.selections,
        unit_price: normalise(valueOf(cell, "unit_price")),
        line_price: normalise(valueOf(cell, "line_price")),
        setup_fee: normalise(valueOf(cell, "setup_fee")),
        sku: (valueOf(cell, "sku") as string | null) || null,
        enabled: valueOf(cell, "enabled") !== false,
        note: cell.note,
      }));
      const res = await apiClient.put<{ saved: number; cleared: number }>(
        `/api/v1/admin/products/${productId}/combinations`, { combinations }
      );
      setMsg({ ok: true, text: `${res.saved} price${res.saved === 1 ? "" : "s"} saved.` });
      load();
    } catch (e) {
      const err = e as { detail?: string; message?: string };
      setMsg({ ok: false, text: err?.detail || err?.message || "Could not save." });
    }
    setSaving(false);
  }

  if (unsaved) {
    return (
      <div style={NOTE}>
        You have changed the options above. Press <strong>Save</strong> and the combinations
        below will update to match.
      </div>
    );
  }
  if (loading && !data) return <div style={NOTE}>Loading the price table…</div>;
  if (!data) return null;

  const dirty = Object.keys(edits).length > 0;
  const pages = Math.ceil(data.total / PAGE);
  // A product sold in set quantities prices each cell as the whole line.
  const field: "unit_price" | "line_price" = data.quantity_option_id ? "line_price" : "unit_price";
  // ...and once it has such prices, a cell without one is not for sale.
  const listOnly = !!(data.quantity_option_id && data.line_priced);

  // No options with choices yet, so there is nothing to combine.
  if (!data.matrix_options.length) {
    return (
      <div style={NOTE}>
        Add options with choices in step 1 — Size, Quantity, Corners — and save. Every
        combination of them will be listed here, ready for a price.
      </div>
    );
  }

  if (data.too_large) {
    return (
      <div style={{ ...NOTE, borderColor: "#F0C36D", background: "#FFFBEF" }} data-too-large>
        <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 6 }}>
          {data.total.toLocaleString()} combinations: too many to list here
        </div>
        <p style={{ margin: "0 0 8px" }}>
          {data.matrix_options.map(o => `${o.name} (${o.values.length})`).join(" × ")}: every way of answering
          the questions, not a list anyone has to fill in.{" "}
          {data.priced_count
            ? <><strong>{data.priced_count.toLocaleString()}</strong> of them have a saved price.</>
            : <>None of them has a saved price yet. Import your supplier&apos;s price file as it is: it needs only
              the combinations you sell, up to {data.max_matrix.toLocaleString()} with a price.</>}
        </p>
        <Unpriced list={data.unpriced_choices} />
        <p style={{ margin: 0 }}>
          {listOnly
            ? "A combination without a saved price cannot be ordered."
            : "A combination without a saved price is priced by rule, from the base price and each choice's extra cost in step 1."}
          {data.priced_count > 0 && (
            <> If your supplier&apos;s file is the whole price list, import it again and tick <strong>This file is
              the whole price list</strong>: the choices it does not list are switched off, and this table becomes the file.</>
          )}
        </p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ ...HINT, marginBottom: 10 }}>
        <strong>{data.total.toLocaleString()}</strong> combination{data.total === 1 ? "" : "s"}
        {listOnly && " · a combination without a price cannot be ordered"}
      </p>
      <Unpriced list={data.unpriced_choices} />

      <div style={{ overflowX: "auto", border: "1px solid #E3E3E3", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: "#FAFAFA" }}>
              {data.matrix_options.map(o => <th key={o.id} style={TH}>{o.name}</th>)}
              <th style={{ ...TH, width: 160 }}>{field === "line_price" ? "Price for the quantity" : "Price"}</th>
            </tr>
          </thead>
          <tbody>
            {data.combinations.map(cell => (
              <tr key={cell.combo_key}>
                {cell.values.map((v, i) => (
                  <td key={i} style={{ ...TD, fontWeight: 600, whiteSpace: "nowrap" }}>{v.value}</td>
                ))}
                <td style={TD}>
                  <div style={{ display: "flex", alignItems: "center", border: "1px solid #E3E3E3", borderRadius: 8, background: "#fff", width: 140 }}>
                    <span style={{ padding: "0 4px 0 10px", color: "#9CA3AF" }}>$</span>
                    <input
                      type="number" step="0.01" min="0"
                      value={(valueOf(cell, field) as number | null) ?? ""}
                      onChange={e => edit(cell.combo_key, {
                        [field]: e.target.value === "" ? null : Number(e.target.value),
                      })}
                      placeholder={
                        (field === "line_price" ? cell.inherited_line_price : cell.inherited_unit_price) != null
                          ? (field === "line_price" ? cell.inherited_line_price! : cell.inherited_unit_price!).toFixed(2)
                          : valueOf(cell, "enabled") === false || listOnly ? "N/A" : "0.00"
                      }
                      style={{ border: "none", outline: "none", padding: "8px 10px 8px 0", width: "100%", fontSize: 13.5, background: "transparent" }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        {/* Paging only when there is more than one page of it. */}
        {pages > 1 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} style={BTN_LIGHT}>← Previous</button>
            <span style={{ fontSize: 12, color: "#6B6B6B" }}>
              {data.offset + 1}–{Math.min(data.offset + PAGE, data.total)} of {data.total.toLocaleString()}
            </span>
            <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)} style={BTN_LIGHT}>Next →</button>
          </div>
        ) : <span />}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {msg && (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: msg.ok ? "#0F7B3F" : "#B91C1C" }}>{msg.text}</span>
          )}
          <button type="button" onClick={save} disabled={saving || !dirty}
            style={{ ...BTN_DARK, opacity: saving || !dirty ? 0.5 : 1 }}>
            {saving ? "Saving…" : "Save prices"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The choices no saved price names: why a table is bigger than the file it
 *  came from, and which combinations have no price of their own. */
function Unpriced({ list }: { list?: Payload["unpriced_choices"] }) {
  if (!list?.length) return null;
  return (
    <div style={{ margin: "0 0 10px", fontSize: 13, color: "#6B4A00" }} data-unpriced>
      No saved price names these choices, so no combination with one of them has a price of its own:
      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
        {list.map(u => (
          <li key={u.option}>
            <strong>{u.option}:</strong> {u.choices.join(", ")}
            {u.count > u.choices.length ? ` and ${u.count - u.choices.length} more` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An empty box means "no price here", which is not the same as zero. */
function normalise(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const HINT: React.CSSProperties = { fontSize: "12px", color: "#6B6B6B", marginBottom: "12px", lineHeight: 1.6 };
const NOTE: React.CSSProperties = { background: "#F6F6F7", border: "1px solid #E3E3E3", borderRadius: "8px", padding: "14px 16px", fontSize: "13px", color: "#6B6B6B", lineHeight: 1.6 };
const INPUT: React.CSSProperties = { padding: "7px 9px", border: "1px solid #E3E3E3", borderRadius: "7px", fontSize: "13px", boxSizing: "border-box", background: "#fff" };
const TH: React.CSSProperties = { padding: "9px 10px", textAlign: "left", fontSize: "10px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap" };
const TD: React.CSSProperties = { padding: "6px 10px", borderTop: "1px solid #F1F1F1" };
const BTN_DARK: React.CSSProperties = { padding: "9px 18px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };
const BTN_LIGHT: React.CSSProperties = { padding: "7px 14px", background: "#fff", color: "#1A1A1A", border: "1px solid #E3E3E3", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" };
