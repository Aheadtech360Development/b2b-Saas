"use client";

/**
 * Import a supplier's price grid into a configurable product's price table.
 *
 * Suppliers send one row per combination — Qty, Size, Sides, …, Price — often
 * thousands of rows for one product, which nobody can type into the table a
 * cell at a time. The server reads the file and says exactly what it would do
 * (questions and choices it would add, prices, combinations that cannot be
 * ordered, choices it would grey out together) before anything is saved; the
 * admin can point it at a different price or quantity column, then import the
 * lot in one go. Nothing is saved while a row still has a problem.
 */
import { useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";

type Role = "question" | "quantity" | "price" | "sku" | "note" | "ignored";

interface Preview {
  columns: { name: string; role: Role; values: number }[];
  price_column: string;
  quantity_column: string | null;
  questions: {
    name: string; column: string; exists: boolean; is_quantity: boolean;
    choices: number; new_choices: string[]; new_choice_count: number;
  }[];
  new_questions: string[];
  new_choices: number;
  rows: number;
  priced: number;
  not_available: number;
  blank: number;
  errors: { row: number; message: string }[];
  error_count: number;
  rules: { when: [string, string]; disable: [string, string] }[];
  switched_off: { question: string; choice: string }[];
  warnings: string[];
}

export interface Imported {
  prices_saved: number;
  not_available: number;
  questions_created: number;
  choices_created: number;
  rules_added: number;
  removed: number;
  message: string;
}

const ROLE_LABEL: Record<Role, string> = {
  question: "Question",
  quantity: "Quantity (how many)",
  price: "Price",
  sku: "SKU",
  note: "Note",
  ignored: "Left out",
};

const MAX_FILE = 3_000_000;

function messageOf(e: unknown, fallback: string): string {
  const err = e as { message?: string };
  return err?.message || fallback;
}

export function PriceGridImport({
  productId,
  onClose,
  onImported,
}: {
  productId: string;
  onClose: () => void;
  onImported: (result: Imported) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [priceColumn, setPriceColumn] = useState<string | null>(null);
  // undefined: the file decides; null: no quantity column; a name: that column.
  const [quantityColumn, setQuantityColumn] = useState<string | null | undefined>(undefined);
  const [replace, setReplace] = useState(false);
  const [rules, setRules] = useState(true);
  const [busy, setBusy] = useState<"reading" | "importing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function check(text: string, price: string | null, quantity: string | null | undefined) {
    setBusy("reading");
    setError(null);
    try {
      const p = await apiClient.post<Preview>(`/api/v1/admin/products/${productId}/price-grid/preview`, {
        csv: text,
        price_column: price ?? undefined,
        quantity_column: quantity === undefined ? undefined : (quantity ?? ""),
      });
      setPreview(p);
      setPriceColumn(p.price_column);
      setQuantityColumn(p.quantity_column);
    } catch (e) {
      setPreview(null);
      setError(messageOf(e, "Could not read that file."));
    }
    setBusy(null);
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE) {
      setError("That file is over 3 MB. Leave out the columns that are not needed, or split it.");
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    await check(text, null, undefined);
  }

  async function runImport() {
    if (!csv || !preview) return;
    setBusy("importing");
    setError(null);
    try {
      const result = await apiClient.post<Imported>(`/api/v1/admin/products/${productId}/price-grid/import`, {
        csv,
        price_column: priceColumn ?? undefined,
        quantity_column: quantityColumn ?? "",
        replace,
        rules,
      });
      onImported(result);
    } catch (e) {
      setError(messageOf(e, "Could not import the prices."));
      setBusy(null);
    }
  }

  const toImport = preview ? preview.priced + preview.not_available : 0;
  const canImport = !!preview && preview.error_count === 0 && toImport > 0 && busy === null;
  const questionColumns = preview?.columns.filter(c => c.role === "question" || c.role === "quantity") ?? [];

  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && busy !== "importing") onClose(); }}>
      <div className="pc-modal" role="dialog" aria-label="Import prices from a spreadsheet" style={{ width: "min(780px, 100%)" }} data-price-grid-import>
        <div className="pc-panel-head">
          <h2 className="pc-h2">Import prices from a spreadsheet</h2>
        </div>

        <div className="pc-pad" style={{ display: "grid", gap: "16px" }}>
          <p className="pc-sub-line" style={{ margin: 0, fontSize: "13px" }}>
            One row per combination: a column for each question (Qty, Size, Material…) and a column with
            the price. Write N/A where a combination cannot be made. Save an Excel sheet as CSV first.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <input ref={picker} type="file" accept=".csv,text/csv" hidden
              onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" className="pc-btn" data-kind={csv ? undefined : "primary"} disabled={busy !== null}
              onClick={() => picker.current?.click()}>
              {csv ? "Choose another file" : "Choose a CSV file"}
            </button>
            {fileName && <span className="pc-sub-line" style={{ fontSize: "13px" }}>{fileName}</span>}
            {busy === "reading" && <span className="pc-sub-line" style={{ fontSize: "13px" }}>Reading…</span>}
          </div>

          {error && <div className="pc-note" data-tone="red" role="alert">{error}</div>}

          {preview && (<>
            <div className="pc-stats4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 0 }}>
              <Stat label="Rows" value={preview.rows} />
              <Stat label="Prices" value={preview.priced} />
              <Stat label="Not available" value={preview.not_available} />
              <Stat label="Need fixing" value={preview.error_count} bad={preview.error_count > 0} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
              <label>
                <span className="pc-label">Price column</span>
                <select className="pc-input" value={priceColumn ?? ""} disabled={busy !== null}
                  onChange={(e) => { setPriceColumn(e.target.value); if (csv) void check(csv, e.target.value, quantityColumn); }}>
                  {preview.columns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </label>
              <label>
                <span className="pc-label">Quantity column (how many)</span>
                <select className="pc-input" value={quantityColumn ?? ""} disabled={busy !== null}
                  onChange={(e) => { const q = e.target.value || null; setQuantityColumn(q); if (csv) void check(csv, priceColumn, q); }}>
                  <option value="">None: every price is for one item</option>
                  {questionColumns.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </label>
            </div>

            <div className="pc-scroll-x" style={{ border: "1px solid var(--pc-line)", borderRadius: "10px" }}>
              <table className="pc-table">
                <thead><tr><th>Column</th><th>Read as</th><th>What happens</th></tr></thead>
                <tbody>
                  {preview.columns.map(c => {
                    const q = preview.questions.find(x => x.column === c.name);
                    return (
                      <tr key={c.name}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td>{ROLE_LABEL[c.role]}</td>
                        <td className="pc-sub-line" style={{ fontSize: "12.5px" }}>
                          {q ? (
                            q.exists
                              ? (q.new_choice_count
                                  ? `Adds ${q.new_choice_count} choice${q.new_choice_count === 1 ? "" : "s"}: ${q.new_choices.join(", ")}${q.new_choice_count > q.new_choices.length ? "…" : ""}`
                                  : `Matches the product's "${q.name}"`)
                              : `New question, ${q.choices} choice${q.choices === 1 ? "" : "s"}`
                          ) : c.role === "price" ? `${preview.priced.toLocaleString()} prices`
                            : c.role === "ignored" ? "Not imported"
                            : `${c.values} value${c.values === 1 ? "" : "s"}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {preview.quantity_column && (
              <p className="pc-sub-line" style={{ margin: 0, fontSize: "13px" }}>
                <strong>{preview.quantity_column}</strong> becomes the question that asks how many. Each price is the
                price of the whole line for that many, exactly as in the file.
              </p>
            )}

            {(preview.rules.length > 0 || preview.switched_off.length > 0) && (
              <div className="pc-note" data-tone="blue">
                {preview.rules.map((r, i) => (
                  <div key={i}>
                    Never sold together: <strong>{r.when[0]} {r.when[1]}</strong> with <strong>{r.disable[0]} {r.disable[1]}</strong>.
                    {rules ? " Picking one greys out the other." : ""}
                  </div>
                ))}
                {preview.switched_off.map((s, i) => (
                  <div key={`off-${i}`}>N/A in every row, so switched off: <strong>{s.question} {s.choice}</strong>.</div>
                ))}
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="pc-note">
                {preview.warnings.map((w, i) => <div key={i}>{w}</div>)}
              </div>
            )}

            {preview.error_count > 0 && (
              <div className="pc-note" data-tone="red" role="alert">
                <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                  {preview.error_count} row{preview.error_count === 1 ? "" : "s"} need fixing in the file before it can be imported:
                </div>
                {preview.errors.map((e, i) => <div key={i}>Row {e.row}: {e.message}</div>)}
                {preview.error_count > preview.errors.length && <div>…and {preview.error_count - preview.errors.length} more.</div>}
              </div>
            )}

            <div style={{ display: "grid", gap: "8px" }}>
              {preview.rules.length > 0 && (
                <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px" }}>
                  <input type="checkbox" checked={rules} onChange={(e) => setRules(e.target.checked)} />
                  Grey out choices that are never sold together
                </label>
              )}
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "13px" }}>
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                Remove the prices this file does not list
              </label>
            </div>
          </>)}
        </div>

        <div className="pc-pad" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--pc-line)" }}>
          <button type="button" className="pc-btn" onClick={onClose} disabled={busy === "importing"}>Cancel</button>
          <button type="button" className="pc-btn" data-kind="primary" disabled={!canImport} onClick={() => void runImport()}>
            {busy === "importing" ? "Importing…" : `Import ${toImport.toLocaleString()} price${toImport === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, bad = false }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className="pc-card pc-stat4">
      <div className="pc-stat4-v" style={bad ? { color: "var(--pc-red)" } : undefined}>{value.toLocaleString()}</div>
      <div className="pc-stat4-l">{label}</div>
    </div>
  );
}
