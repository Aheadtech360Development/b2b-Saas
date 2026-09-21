"use client";

/**
 * The price table — one price per combination of choices.
 *
 * Per-choice deltas force the price to be separable: price(Small, Rounded) has
 * to equal price(Small) + price(Rounded). Real pricing often is not, because
 * rounded corners cost more on a bigger card. This is where a brand says so.
 *
 * Two things keep it usable rather than overwhelming:
 *
 * The admin picks which options price turns on. A product with fourteen option
 * groups would otherwise present a grid with more cells than atoms worth
 * caring about; over the three that matter it is a readable table.
 *
 * Cells are generated, never stored, and only the ones somebody types a price
 * into are saved. A blank cell is not missing data — it means the ordinary
 * per-choice price applies, which is what every product does today.
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
  setup_fee: number | null;
  sku: string | null;
  enabled: boolean;
  note: string | null;
  has_own_price: boolean;
  inherited_from: string | null;
  inherited_unit_price: number | null;
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
}

const PAGE = 50;

export function CombinationPricing({
  productId,
  onPickOptions,
  unsaved,
}: {
  productId: string;
  /** Opens the option list so the admin can tick which ones price turns on. */
  onPickOptions?: () => void;
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

  function valueOf(cell: Cell, field: "unit_price" | "setup_fee" | "sku" | "enabled") {
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
        Save your options first, then set combination prices — the table is built from
        the options as saved.
      </div>
    );
  }
  if (loading && !data) return <div style={NOTE}>Loading the price table…</div>;
  if (!data) return null;

  const dirty = Object.keys(edits).length > 0;
  const pages = Math.ceil(data.total / PAGE);

  // Nothing ticked: explain what this is for rather than showing an empty table.
  if (!data.matrix_options.length) {
    return (
      <div>
        <p style={HINT}>
          Normally each choice adds its own amount, whatever else is picked. Use this when
          that is not true — when rounded corners cost more on a large card than a small
          one, for example.
        </p>
        <p style={HINT}>
          Tick <strong>&ldquo;price changes with this&rdquo;</strong> on the options price really
          turns on, save, and every combination of them appears here to price.
        </p>
        {!!data.all_options.length && (
          <div style={NOTE}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: "#1A1A1A" }}>This product&apos;s options</div>
            {data.all_options.map(o => (
              <div key={o.id}>{o.name} — {o.value_count} choice{o.value_count === 1 ? "" : "s"}</div>
            ))}
            {onPickOptions && (
              <button type="button" onClick={onPickOptions} style={{ ...BTN_LIGHT, marginTop: 10 }}>
                Choose which options price turns on
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (data.too_large) {
    return (
      <div style={{ ...NOTE, borderColor: "#F0C36D", background: "#FFFBEF" }}>
        <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 6 }}>
          That is {data.total.toLocaleString()} combinations
        </div>
        <p style={{ margin: 0 }}>
          More than anyone could work through, so the table is not shown. Untick an option
          or two — {data.matrix_options.map(o => `${o.name} (${o.values.length})`).join(" × ")} —
          and price only what really changes. Everything else can keep using per-choice
          amounts.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline", marginBottom: 12 }}>
        <p style={{ ...HINT, marginBottom: 0 }}>
          {data.matrix_options.map(o => `${o.name} (${o.values.length})`).join(" × ")}
          {" = "}<strong>{data.total.toLocaleString()}</strong> combinations.
          {" "}{data.priced_count} priced.
        </p>
        <span style={{ fontSize: 12, color: "#6B6B6B" }}>
          Leave a price blank to use the per-choice amounts.
        </span>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid #E3E3E3", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#FAFAFA" }}>
              {data.matrix_options.map(o => <th key={o.id} style={TH}>{o.name}</th>)}
              <th style={TH}>Price each</th>
              <th style={TH}>One-off fee</th>
              <th style={TH}>SKU</th>
              <th style={TH}>Can be ordered</th>
            </tr>
          </thead>
          <tbody>
            {data.combinations.map(cell => {
              const off = valueOf(cell, "enabled") === false;
              return (
                <tr key={cell.combo_key} style={{ opacity: off ? 0.55 : 1 }}>
                  {cell.values.map((v, i) => (
                    <td key={i} style={{ ...TD, fontWeight: 600, whiteSpace: "nowrap" }}>{v.value}</td>
                  ))}
                  <td style={TD}>
                    <input
                      type="number" step="0.01" min="0"
                      value={(valueOf(cell, "unit_price") as number | null) ?? ""}
                      onChange={e => edit(cell.combo_key, {
                        unit_price: e.target.value === "" ? null : Number(e.target.value),
                      })}
                      // A cell covered by a shorter combination shows that price
                      // greyed, so a blank reads as "inherited", not "forgotten".
                      placeholder={
                        cell.inherited_unit_price != null
                          ? `${cell.inherited_unit_price.toFixed(2)} (inherited)`
                          : "per-choice"
                      }
                      style={{ ...INPUT, width: 120 }}
                    />
                  </td>
                  <td style={TD}>
                    <input
                      type="number" step="0.01" min="0"
                      value={(valueOf(cell, "setup_fee") as number | null) ?? ""}
                      onChange={e => edit(cell.combo_key, {
                        setup_fee: e.target.value === "" ? null : Number(e.target.value),
                      })}
                      placeholder="none"
                      style={{ ...INPUT, width: 100 }}
                    />
                  </td>
                  <td style={TD}>
                    <input
                      type="text"
                      value={(valueOf(cell, "sku") as string | null) ?? ""}
                      onChange={e => edit(cell.combo_key, { sku: e.target.value })}
                      placeholder="—"
                      style={{ ...INPUT, width: 110 }}
                    />
                  </td>
                  <td style={{ ...TD, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={valueOf(cell, "enabled") !== false}
                      onChange={e => edit(cell.combo_key, { enabled: e.target.checked })}
                      title="Untick a combination you cannot actually produce"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} style={BTN_LIGHT}>
            ← Previous
          </button>
          <span style={{ fontSize: 12, color: "#6B6B6B" }}>
            {data.offset + 1}–{Math.min(data.offset + PAGE, data.total)} of {data.total.toLocaleString()}
          </span>
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)} style={BTN_LIGHT}>
            Next →
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {msg && (
            <span style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? "#0F7B3F" : "#B91C1C" }}>
              {msg.text}
            </span>
          )}
          <button type="button" onClick={save} disabled={saving || !dirty} style={{ ...BTN_DARK, opacity: saving || !dirty ? 0.5 : 1 }}>
            {saving ? "Saving…" : "Save these prices"}
          </button>
        </div>
      </div>
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
