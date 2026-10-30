"use client";

/**
 * Importing a products file: the one Export writes, or a Shopify product CSV
 * (backend services/product_import). The server plans first and saves
 * nothing, so the admin sees what each product would become; "Import" then
 * saves it. A product the shop already has (same URL handle) is updated only
 * when "Update products that already exist" is ticked, as on Shopify. On one
 * product's page (onlyHandle) only that product's rows are read, and it is
 * updated.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "@/lib/api-client";
import { adminService, type ProductFileImportResult, type ProductFilePlan } from "@/services/admin.service";

export type ImportPhase = "preview" | "importing" | "done";

const ACTION: Record<ProductFilePlan["action"], { planned: string; done: string; tone?: string }> = {
  create: { planned: "New", done: "Created", tone: "green" },
  update: { planned: "Update", done: "Updated", tone: "blue" },
  skip: { planned: "Skipped", done: "Skipped" },
  error: { planned: "Not imported", done: "Not imported", tone: "red" },
};

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function changes(p: ProductFilePlan) {
  const parts = [];
  if (p.variants_new) parts.push(`${plural(p.variants_new, "new variant")}`);
  if (p.variants_changed) parts.push(`${plural(p.variants_changed, "variant")} changed`);
  if (p.images_new) parts.push(`${plural(p.images_new, "new image")}`);
  return parts.join(", ");
}

export function ProductFileImport({ file, onlyHandle, onBack, onPhase, onImported, onFinish }: {
  file: File;
  onlyHandle?: string;
  onBack: () => void;
  onPhase?: (phase: ImportPhase) => void;
  /** Something was saved: the list behind should be loaded again. */
  onImported: () => void;
  onFinish: () => void;
}) {
  const [update, setUpdate] = useState(!!onlyHandle);
  const [plan, setPlan] = useState<ProductFileImportResult | null>(null);
  const [done, setDone] = useState<ProductFileImportResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const preview = useCallback(async (updateExisting: boolean) => {
    setBusy(true);
    setError("");
    try {
      setPlan(await adminService.importProductsFile(file, { dryRun: true, updateExisting, onlyHandle }));
    } catch (e) {
      setPlan(null);
      setError(e instanceof ApiClientError ? e.message : "The file could not be read.");
    } finally {
      setBusy(false);
    }
  }, [file, onlyHandle]);

  useEffect(() => { void preview(update); }, [preview, update]);

  async function run() {
    setBusy(true);
    setSaving(true);
    setError("");
    onPhase?.("importing");
    try {
      const result = await adminService.importProductsFile(file, { dryRun: false, updateExisting: update, onlyHandle });
      setDone(result);
      onPhase?.("done");
      if (result.counts.create + result.counts.update > 0) onImported();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "The import did not finish. Nothing more was saved; try again.");
      onPhase?.("preview");
    } finally {
      setBusy(false);
      setSaving(false);
    }
  }

  const shown = done ?? plan;
  const toSave = plan ? plan.counts.create + plan.counts.update : 0;

  return (
    <div data-product-file-import style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <strong style={{ fontSize: "14px" }}>{done ? "Import finished" : onlyHandle ? "This product's rows" : "What the file will do"}</strong>
          <span style={{ marginLeft: "8px", fontSize: "12px", color: "#7A7880" }}>from {file.name}</span>
        </div>
        {!done && <button type="button" className="pc-btn" disabled={busy} onClick={onBack}>← Choose another file</button>}
      </div>

      {error && <div className="pc-flash" data-bad="" role="alert">{error}</div>}

      {!onlyHandle && !done && (
        <label className="pc-check-row" style={{ display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "13px" }}>
          <input type="checkbox" checked={update} disabled={busy} onChange={(e) => setUpdate(e.target.checked)} />
          <span>
            <strong>Update products that already exist</strong>
            <span style={{ display: "block", color: "#7A7880" }}>
              A product in the file with the same URL handle as one in your shop is changed to match the file.
              Left unticked, it is skipped. Nothing is deleted: variants and images the file does not list stay.
            </span>
          </span>
        </label>
      )}

      {busy && !shown && <p style={{ fontSize: "13px", color: "#7A7880" }}>Reading the file…</p>}

      {shown && (
        <>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }} data-counts>
            {(["create", "update", "skip", "error"] as const).map((a) => shown.counts[a] > 0 && (
              <span key={a} className="pc-pill" data-tone={ACTION[a].tone}>
                {shown.counts[a]} {done ? ACTION[a].done.toLowerCase() : ACTION[a].planned.toLowerCase()}
              </span>
            ))}
            {onlyHandle && shown.ignored > 0 && (
              <span className="pc-pill">{plural(shown.ignored, "other product")} in the file left alone</span>
            )}
          </div>

          {shown.problems.length > 0 && (
            <div className="pc-flash" data-bad="" role="status">
              {shown.problems.map((p) => <div key={p}>{p}</div>)}
            </div>
          )}

          {shown.products.length > 0 && (
            <div style={{ border: "1px solid #E3E3E3", borderRadius: "10px", overflow: "auto", maxHeight: "46vh" }}>
              <table className="pc-table" style={{ fontSize: "13px" }}>
                <thead>
                  <tr><th>Product</th><th>{done ? "Result" : "Will be"}</th><th>Changes</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {shown.products.map((p) => (
                    <tr key={p.handle} data-handle={p.handle} data-action={p.action}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: "12px", color: "#7A7880" }}>/{p.handle} · {p.kind}</div>
                      </td>
                      <td><span className="pc-pill" data-tone={ACTION[p.action].tone}>{done ? ACTION[p.action].done : ACTION[p.action].planned}</span></td>
                      <td style={{ color: "#3F3D45" }}>{changes(p) || "—"}</td>
                      <td>
                        {p.errors.map((e) => <div key={e} style={{ color: "var(--pc-red, #B42318)" }}>{e}</div>)}
                        {p.notes.map((n) => <div key={n} style={{ color: "#7A7880" }}>{n}</div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        {done ? (
          <button type="button" className="pc-btn" data-kind="primary" onClick={onFinish}>Done</button>
        ) : (
          <button type="button" className="pc-btn" data-kind="primary" disabled={busy || toSave === 0} onClick={() => void run()}>
            {saving ? "Importing…" : toSave ? `Import ${plural(toSave, "product")}` : "Nothing to import"}
          </button>
        )}
      </div>
    </div>
  );
}
