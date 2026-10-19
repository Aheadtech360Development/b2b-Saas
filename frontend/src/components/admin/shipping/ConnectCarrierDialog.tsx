"use client";

/**
 * Connect a carrier (design 35): the shop's own UPS, FedEx or USPS account,
 * for live rates and labels billed to it.
 *
 * Each carrier asks for what its own API needs (services/integrations_service:
 * UPS a client ID and secret and the shipper number; FedEx a key, a secret and
 * the account number; USPS a consumer key and secret, and the payment account
 * to buy labels), so the fields come from the server. "Test connection" tries
 * them without saving; "Connect" tests and saves, and says the carrier's own
 * words when it refuses. A saved secret is never sent back: left blank, it is
 * kept.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { ask } from "@/lib/dialog";

export type CarrierKey = "ups" | "fedex" | "usps";

interface Field { name: string; label: string; kind: string; help: string | null; required: boolean; options: string[]; placeholder: string }
export interface CarrierProvider {
  key: CarrierKey; name: string; blurb: string; docs_url: string; fields: Field[];
  connection: { connected: boolean; [k: string]: unknown };
}

const ORDER: CarrierKey[] = ["ups", "fedex", "usps"];
const errorText = (e: unknown, fallback: string) => (e instanceof ApiClientError && e.message ? e.message : fallback);

/** The three carriers with this shop's connection state, in the design's order. */
export async function loadCarriers(): Promise<CarrierProvider[]> {
  const r = await apiClient.get<{ providers: CarrierProvider[] }>("/api/v1/admin/integrations?category=carrier");
  return ORDER.map((k) => r.providers.find((p) => p.key === k)).filter((p): p is CarrierProvider => !!p);
}

export function ConnectCarrierDialog({ initial, onClose, onConnected }: {
  initial?: CarrierKey;
  onClose: () => void;
  /** After a carrier is saved: its key, and the carriers as they now stand. */
  onConnected: (key: CarrierKey, carriers: CarrierProvider[]) => void;
}) {
  const [carriers, setCarriers] = useState<CarrierProvider[] | null>(null);
  const [key, setKey] = useState<CarrierKey>(initial ?? "ups");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "test" | "connect">("");
  const [note, setNote] = useState<{ ok: boolean; text: string; canForce?: boolean } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCarriers().then(setCarriers).catch((e) => setError(errorText(e, "The carriers could not be loaded.")));
  }, []);

  const carrier = carriers?.find((c) => c.key === key) ?? null;
  const connected = !!carrier?.connection.connected;

  // What the shop saved before, secrets left out: a blank secret keeps the saved one.
  useEffect(() => {
    if (!carrier) return;
    const next: Record<string, string> = {};
    for (const f of carrier.fields) {
      const saved = carrier.connection[f.name];
      next[f.name] = f.kind === "secret" ? "" : typeof saved === "string" ? saved : (f.kind === "select" ? f.options[0] ?? "" : "");
    }
    setValues(next);
    setNote(null);
  }, [carrier]);

  const missing = (carrier?.fields ?? []).filter((f) => f.required && !values[f.name]?.trim()
    && !(f.kind === "secret" && carrier?.connection[`${f.name}_set`])).map((f) => f.label);

  async function test() {
    if (!carrier) return;
    setBusy("test");
    setNote(null);
    try {
      const r = await apiClient.post<{ ok: boolean; message: string }>(`/api/v1/admin/integrations/${carrier.key}/test`, { values });
      setNote({ ok: r.ok, text: r.message || (r.ok ? "These work." : "The carrier refused these.") });
    } catch (e) {
      setNote({ ok: false, text: errorText(e, "The test could not be run.") });
    } finally {
      setBusy("");
    }
  }

  async function connect(force = false) {
    if (!carrier) return;
    if (missing.length) { setNote({ ok: false, text: `Fill in ${missing.join(", ")}.` }); return; }
    setBusy("connect");
    setNote(null);
    try {
      await apiClient.post(`/api/v1/admin/integrations/${carrier.key}`, { values, force });
      const now = await loadCarriers().catch(() => carriers ?? []);
      onConnected(carrier.key, now);
    } catch (e) {
      // The carrier's own words; saving without the test is for when it is briefly down.
      setNote({ ok: false, text: errorText(e, "It could not be connected."), canForce: true });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="pc-modal" role="dialog" aria-label="Connect a carrier" data-connect-carrier style={{ maxWidth: "460px" }}>
        <div className="pc-panel-head">
          <h2 className="pc-h2">Connect a carrier</h2>
          <button type="button" className="pc-x" aria-label="Close" disabled={!!busy} onClick={onClose}><X size={18} strokeWidth={2.2} /></button>
        </div>
        <div className="pc-panel-body">
          {error ? <div className="pc-note" data-tone="red">{error}</div> : !carriers ? <div className="pc-empty">Loading…</div> : (
            <>
              <div role="tablist" aria-label="Carrier" style={{ display: "grid", gridTemplateColumns: `repeat(${carriers.length}, minmax(0, 1fr))`, gap: "8px" }}>
                {carriers.map((c) => (
                  <button key={c.key} type="button" role="tab" aria-selected={c.key === key} data-carrier={c.key} disabled={!!busy}
                    onClick={() => setKey(c.key)}
                    style={{
                      height: "40px", borderRadius: "8px", font: "600 14px var(--pc-sans)", cursor: "pointer", background: "#fff",
                      color: "var(--pc-ink)", border: c.key === key ? "1.5px solid var(--pc-blue)" : "1px solid var(--pc-line)",
                    }}>
                    {c.name}{c.connection.connected ? " ✓" : ""}
                  </button>
                ))}
              </div>
              {carrier && (
                <>
                  {connected && (
                    <div className="pc-note" data-tone="green" style={{ fontSize: "13px" }}>
                      {carrier.name} is connected. Saving replaces what is stored; a secret left blank is kept.
                    </div>
                  )}
                  {carrier.fields.map((f) => {
                    const hint = carrier.connection[`${f.name}_hint`];
                    return (
                      <label key={f.name} style={{ display: "grid", gap: "6px" }}>
                        <span className="pc-label">{f.label}{!f.required && <span style={{ color: "var(--pc-muted)", fontWeight: 400 }}> (optional)</span>}</span>
                        {f.kind === "select" ? (
                          <select className="pc-input" value={values[f.name] ?? ""} disabled={!!busy}
                            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}>
                            {f.options.map((o) => <option key={o} value={o}>{o === "production" ? "Live" : o === "test" ? "Test (sandbox)" : o}</option>)}
                          </select>
                        ) : (
                          <input className="pc-input" type={f.kind === "secret" ? "password" : "text"} autoComplete="off" disabled={!!busy}
                            value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                            placeholder={f.kind === "secret" && typeof hint === "string" ? `${hint} (kept if left blank)` : f.placeholder} />
                        )}
                        {f.help && <span className="pc-sub-line" style={{ fontSize: "12.5px", margin: 0 }}>{f.help}</span>}
                      </label>
                    );
                  })}
                  {carrier.docs_url && (
                    <a href={carrier.docs_url} target="_blank" rel="noopener noreferrer" className="pc-link" style={{ fontSize: "13.5px", width: "fit-content" }}>
                      Where do I find these?
                    </a>
                  )}
                  {note && (
                    <div className="pc-note" data-tone={note.ok ? "green" : "red"} role="status" style={{ fontSize: "13px" }}>
                      {note.text}
                      {!note.ok && note.canForce && (
                        <> <button type="button" className="pc-link" style={{ background: "none", border: 0, padding: 0, fontSize: "13px" }}
                          onClick={() => void connect(true)}>Save without the test</button></>
                      )}
                    </div>
                  )}
                  <div className="pc-row-actions" style={{ justifyContent: "flex-end" }}>
                    <button type="button" className="pc-btn" disabled={!!busy} onClick={() => void test()}>{busy === "test" ? "Testing…" : "Test connection"}</button>
                    <button type="button" className="pc-btn" data-kind="primary" disabled={!!busy} onClick={() => void connect()}>
                      {busy === "connect" ? "Connecting…" : connected ? "Save" : "Connect"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The Shipping page's carriers: each one's state, connected or changed in the
 *  dialog above, and disconnected after asking. */
export function CarrierList() {
  const [carriers, setCarriers] = useState<CarrierProvider[] | null>(null);
  const [open, setOpen] = useState<CarrierKey | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { loadCarriers().then(setCarriers).catch(() => setCarriers([])); }, []);

  async function disconnect(c: CarrierProvider) {
    if (!(await ask(`Disconnect ${c.name}? Its rates leave checkout and its labels can no longer be bought here.`, { ok: "Disconnect", danger: true }))) return;
    setBusy(c.key);
    try {
      await apiClient.delete(`/api/v1/admin/integrations/${c.key}`);
      setCarriers(await loadCarriers());
      setNote({ ok: true, text: `${c.name} disconnected.` });
    } catch (e) {
      setNote({ ok: false, text: errorText(e, `${c.name} could not be disconnected.`) });
    } finally {
      setBusy("");
    }
  }

  if (!carriers) return <div className="pc-empty">Loading the carriers…</div>;
  return (
    <div style={{ display: "grid", gap: "10px" }} data-carrier-list>
      {note && <div className="pc-note" data-tone={note.ok ? "green" : "red"} role="status">{note.text}</div>}
      {carriers.map((c) => (
        <div key={c.key} data-carrier-row={c.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", padding: "12px 14px", border: "1px solid var(--pc-line)", borderRadius: "10px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{c.name}{" "}
              <span className="pc-pill" data-tone={c.connection.connected ? "green" : undefined} style={{ textTransform: "none", marginLeft: "6px" }}>
                {c.connection.connected ? "Connected" : "Not connected"}</span>
            </div>
            <div className="pc-sub-line" style={{ fontSize: "13px", margin: "2px 0 0" }}>{c.blurb}</div>
          </div>
          <div className="pc-row-actions">
            {c.connection.connected && (
              <button type="button" className="pc-btn" disabled={!!busy} onClick={() => void disconnect(c)}>{busy === c.key ? "Disconnecting…" : "Disconnect"}</button>
            )}
            <button type="button" className="pc-btn" data-kind={c.connection.connected ? undefined : "primary"} disabled={!!busy} onClick={() => setOpen(c.key)}>
              {c.connection.connected ? "Change" : "Connect"}
            </button>
          </div>
        </div>
      ))}
      {open && (
        <ConnectCarrierDialog initial={open} onClose={() => setOpen(null)}
          onConnected={(key, now) => {
            setOpen(null);
            setCarriers(now);
            setNote({ ok: true, text: `${now.find((c) => c.key === key)?.name ?? "The carrier"} is connected. Rates and labels go through your own account.` });
          }} />
      )}
    </div>
  );
}
