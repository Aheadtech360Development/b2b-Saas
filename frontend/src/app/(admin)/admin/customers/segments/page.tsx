"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  segmentsService,
  isGroup,
  FIELD_LABELS,
  OPERATOR_LABELS,
  type Segment,
  type SegmentGroup,
  type SegmentNode,
  type SegmentCondition,
  type FieldSpec,
  type SegmentMember,
} from "@/services/segments.service";

const CARD: React.CSSProperties = { background: "#fff", border: "1px solid #E8E6E1", borderRadius: "10px", padding: "20px" };
const INPUT: React.CSSProperties = { padding: "8px 10px", border: "1px solid #DDD9D2", borderRadius: "6px", fontSize: "13px", background: "#fff" };
const BTN: React.CSSProperties = { border: "none", color: "#fff", padding: "9px 16px", borderRadius: "7px", fontSize: "13px", fontWeight: 700, cursor: "pointer" };

const ARRAY_OPS = new Set(["in", "not_in", "contains_any", "contains_all"]);
const NO_VALUE_OPS = new Set(["is_set", "is_not_set"]);

function emptyGroup(): SegmentGroup { return { op: "and", conditions: [] }; }
function newCondition(field = "total_spend"): SegmentCondition { return { field, operator: "gt", value: 0 }; }

export default function SegmentsPage() {
  const [fields, setFields] = useState<FieldSpec[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [mode, setMode] = useState<"list" | "editor">("list");
  const [editing, setEditing] = useState<Segment | null>(null); // null = new when in editor
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    segmentsService.list().then(setSegments).catch(() => setSegments([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { segmentsService.fields().then((r) => setFields(r.fields)).catch(() => {}); load(); }, [load]);

  const typeOf = useCallback((field: string) => fields.find((f) => f.field === field)?.type ?? "string", [fields]);
  const opsFor = useCallback((field: string) => fields.find((f) => f.field === field)?.operators ?? [], [fields]);

  function openNew() { setEditing(null); setMode("editor"); }
  function openEdit(s: Segment) { setEditing(s); setMode("editor"); }

  if (mode === "editor") {
    return (
      <SegmentEditor
        key={editing?.id ?? "new"}
        initial={editing}
        typeOf={typeOf}
        opsFor={opsFor}
        fields={fields}
        onClose={() => { setMode("list"); load(); }}
      />
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: "1000px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, marginBottom: "4px" }}>Customer Segments</h1>
          <p style={{ fontSize: "13px", color: "#6B6B6B" }}>Group customers by spend, orders, tags, location and what they buy — reused across notifications, marketing and exports.</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => segmentsService.recomputeAll().then(() => load()).catch(() => {})} style={{ ...BTN, background: "#fff", color: "#555", border: "1px solid #DDD9D2" }} title="Rebuild every customer's metrics (first rollout / manual refresh)">Refresh metrics</button>
          <button onClick={openNew} style={{ ...BTN, background: "var(--brand-primary, #1C3557)" }}>＋ Create segment</button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "#888", fontSize: "13px" }}>Loading…</div>
      ) : segments.length === 0 ? (
        <div style={{ ...CARD, color: "#888", fontSize: "13px" }}>No segments yet. Create your first one — e.g. “VIP: spent over $1,000 with 3+ orders”.</div>
      ) : (
        <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#FAFAF8", borderBottom: "1px solid #E8E6E1" }}>
                {["Segment", "Customers", "Updated", ""].map((h) => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid #F1EFEB" }}>
                  <td style={{ padding: "12px 14px" }}>
                    <button onClick={() => openEdit(s)} style={{ background: "none", border: "none", color: "var(--brand-primary, #1C3557)", fontWeight: 700, cursor: "pointer", fontSize: "13px", padding: 0 }}>{s.name}</button>
                    {s.description && <div style={{ color: "#999", fontSize: "12px" }}>{s.description}</div>}
                  </td>
                  <td style={{ padding: "12px 14px" }}><SegmentCount id={s.id} /></td>
                  <td style={{ padding: "12px 14px", color: "#888" }}>{s.updated_at ? new Date(s.updated_at).toLocaleDateString() : "—"}</td>
                  <td style={{ padding: "12px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <button onClick={() => segmentsService.duplicate(s.id).then(() => load()).catch(() => {})} style={linkBtn}>Duplicate</button>
                    <button onClick={() => { if (confirm(`Delete “${s.name}”?`)) segmentsService.remove(s.id).then(() => load()).catch(() => {}); }} style={{ ...linkBtn, color: "#B91C1C" }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "#555", fontSize: "12px", fontWeight: 600, cursor: "pointer", marginLeft: "12px" };

// Fetch a saved segment's live count lazily for the list.
function SegmentCount({ id }: { id: string }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => { segmentsService.get(id).then((s) => setN(s.count ?? 0)).catch(() => setN(null)); }, [id]);
  return <span style={{ fontWeight: 700 }}>{n == null ? "…" : n.toLocaleString()}</span>;
}

// ── Editor ───────────────────────────────────────────────────────────────────
function SegmentEditor({ initial, typeOf, opsFor, fields, onClose }: {
  initial: Segment | null;
  typeOf: (f: string) => string;
  opsFor: (f: string) => string[];
  fields: FieldSpec[];
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [def, setDef] = useState<SegmentGroup>(initial?.definition && (initial.definition.conditions ? initial.definition : emptyGroup()) || emptyGroup());
  const [preview, setPreview] = useState<{ count: number; sample: SegmentMember[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced live preview — same engine the saved segment uses.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    setPreviewing(true);
    timer.current = setTimeout(() => {
      segmentsService.preview(def, 25)
        .then(setPreview)
        .catch((e) => { setPreview(null); setError((e as { message?: string })?.message || "Invalid filter"); })
        .finally(() => setPreviewing(false));
    }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [def]);

  async function save() {
    setError(null);
    if (!name.trim()) { setError("Give the segment a name."); return; }
    setSaving(true);
    try {
      if (initial) await segmentsService.update(initial.id, { name, description, definition: def });
      else await segmentsService.create({ name, description, definition: def });
      onClose();
    } catch (e) {
      setError((e as { message?: string })?.message || "Could not save the segment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "24px", maxWidth: "1100px" }}>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", fontSize: "13px", fontWeight: 600, cursor: "pointer", marginBottom: "14px", padding: 0 }}>← Back to segments</button>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: "20px", alignItems: "start" }}>
        {/* Builder */}
        <div style={{ display: "grid", gap: "16px" }}>
          <div style={CARD}>
            <label style={LABEL}>Segment name</label>
            <input style={{ ...INPUT, width: "100%", boxSizing: "border-box", marginBottom: "12px" }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VIP wholesale buyers" />
            <label style={LABEL}>Description (optional)</label>
            <input style={{ ...INPUT, width: "100%", boxSizing: "border-box" }} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} placeholder="What defines this group?" />
          </div>

          <div style={CARD}>
            <div style={{ fontSize: "13px", fontWeight: 800, marginBottom: "12px" }}>Conditions</div>
            <GroupEditor group={def} onChange={setDef} typeOf={typeOf} opsFor={opsFor} fields={fields} depth={0} />
          </div>

          {error && <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C", padding: "10px 12px", borderRadius: "8px", fontSize: "13px" }}>{error}</div>}

          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={save} disabled={saving} style={{ ...BTN, background: saving ? "#9ca3af" : "var(--brand-primary, #1C3557)" }}>{saving ? "Saving…" : initial ? "Save changes" : "Save segment"}</button>
            <button onClick={onClose} style={{ ...BTN, background: "#fff", color: "#555", border: "1px solid #DDD9D2" }}>Cancel</button>
          </div>
        </div>

        {/* Live preview */}
        <div style={{ ...CARD, position: "sticky", top: "20px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: ".05em" }}>Matching customers</div>
          <div style={{ fontSize: "34px", fontWeight: 800, margin: "4px 0 2px" }}>{previewing ? "…" : (preview?.count ?? 0).toLocaleString()}</div>
          <div style={{ fontSize: "12px", color: "#999", marginBottom: "14px" }}>Updates live as you edit — same engine the saved segment uses.</div>
          <div style={{ display: "grid", gap: "8px", maxHeight: "440px", overflowY: "auto" }}>
            {(preview?.sample ?? []).map((m) => (
              <div key={m.id} style={{ border: "1px solid #F1EFEB", borderRadius: "8px", padding: "9px 11px" }}>
                <div style={{ fontSize: "13px", fontWeight: 700 }}>{m.name}</div>
                <div style={{ fontSize: "11px", color: "#888" }}>
                  {[m.city, m.state, m.country].filter(Boolean).join(", ") || "—"} · {m.order_count} orders · ${m.total_spend.toLocaleString()}
                </div>
              </div>
            ))}
            {preview && preview.sample.length === 0 && <div style={{ fontSize: "12px", color: "#aaa" }}>No customers match yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

const LABEL: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "5px" };

// ── Recursive group ──────────────────────────────────────────────────────────
function GroupEditor({ group, onChange, typeOf, opsFor, fields, depth }: {
  group: SegmentGroup;
  onChange: (g: SegmentGroup) => void;
  typeOf: (f: string) => string;
  opsFor: (f: string) => string[];
  fields: FieldSpec[];
  depth: number;
}) {
  function setChild(i: number, node: SegmentNode) {
    onChange({ ...group, conditions: group.conditions.map((c, idx) => (idx === i ? node : c)) });
  }
  function removeChild(i: number) {
    onChange({ ...group, conditions: group.conditions.filter((_, idx) => idx !== i) });
  }
  const firstField = fields[0]?.field ?? "total_spend";

  return (
    <div style={{ border: depth > 0 ? "1px dashed #D6D3CC" : "none", borderRadius: "8px", padding: depth > 0 ? "12px" : 0, background: depth > 0 ? "#FBFBF9" : "transparent" }}>
      {/* AND / OR toggle */}
      <div style={{ display: "inline-flex", border: "1px solid #DDD9D2", borderRadius: "7px", overflow: "hidden", marginBottom: "12px" }}>
        {(["and", "or"] as const).map((op) => (
          <button key={op} onClick={() => onChange({ ...group, op })}
            style={{ padding: "6px 16px", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer",
              background: group.op === op ? "var(--brand-primary, #1C3557)" : "#fff", color: group.op === op ? "#fff" : "#666" }}>
            {op.toUpperCase()}
          </button>
        ))}
        <span style={{ padding: "6px 12px", fontSize: "11px", color: "#999", alignSelf: "center" }}>match {group.op === "and" ? "all" : "any"} of</span>
      </div>

      <div style={{ display: "grid", gap: "8px" }}>
        {group.conditions.map((node, i) => (
          <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {isGroup(node) ? (
                <GroupEditor group={node} onChange={(g) => setChild(i, g)} typeOf={typeOf} opsFor={opsFor} fields={fields} depth={depth + 1} />
              ) : (
                <ConditionEditor condition={node} onChange={(c) => setChild(i, c)} typeOf={typeOf} opsFor={opsFor} fields={fields} />
              )}
            </div>
            <button onClick={() => removeChild(i)} title="Remove" style={{ background: "none", border: "1px solid #EAD9D9", color: "#B91C1C", borderRadius: "6px", width: "30px", height: "34px", cursor: "pointer", flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
        <button onClick={() => onChange({ ...group, conditions: [...group.conditions, newCondition(firstField)] })}
          style={{ background: "#fff", border: "1px solid #DDD9D2", color: "#333", padding: "7px 12px", borderRadius: "7px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>＋ Add condition</button>
        {depth < 3 && (
          <button onClick={() => onChange({ ...group, conditions: [...group.conditions, emptyGroup()] })}
            style={{ background: "#fff", border: "1px dashed #C9C5BD", color: "#666", padding: "7px 12px", borderRadius: "7px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>＋ Add group</button>
        )}
      </div>
    </div>
  );
}

// ── Single condition ─────────────────────────────────────────────────────────
function ConditionEditor({ condition, onChange, typeOf, opsFor, fields }: {
  condition: SegmentCondition;
  onChange: (c: SegmentCondition) => void;
  typeOf: (f: string) => string;
  opsFor: (f: string) => string[];
  fields: FieldSpec[];
}) {
  const type = typeOf(condition.field);
  const ops = opsFor(condition.field);

  function changeField(field: string) {
    const nextOps = opsFor(field);
    onChange({ field, operator: nextOps.includes(condition.operator) ? condition.operator : (nextOps[0] ?? "eq"), value: defaultValue(typeOf(field), nextOps[0]) });
  }
  function changeOp(operator: string) {
    onChange({ ...condition, operator, value: NO_VALUE_OPS.has(operator) ? undefined : (condition.value ?? defaultValue(type, operator)) });
  }

  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", background: "#fff", border: "1px solid #EFEDE8", borderRadius: "8px", padding: "8px 10px" }}>
      <select value={condition.field} onChange={(e) => changeField(e.target.value)} style={{ ...INPUT, minWidth: "160px" }}>
        {fields.map((f) => <option key={f.field} value={f.field}>{FIELD_LABELS[f.field] ?? f.field}</option>)}
      </select>
      <select value={condition.operator} onChange={(e) => changeOp(e.target.value)} style={{ ...INPUT, minWidth: "130px" }}>
        {ops.map((op) => <option key={op} value={op}>{OPERATOR_LABELS[op] ?? op}</option>)}
      </select>
      <ValueInput type={type} operator={condition.operator} value={condition.value} onChange={(v) => onChange({ ...condition, value: v })} />
    </div>
  );
}

function defaultValue(type: string, op?: string): unknown {
  if (op && NO_VALUE_OPS.has(op)) return undefined;
  if (op && ARRAY_OPS.has(op)) return [];
  if (type === "number") return 0;
  if (type === "bool") return true;
  if (type === "datetime") return op === "within_last_days" ? 30 : "";
  return "";
}

function ValueInput({ type, operator, value, onChange }: { type: string; operator: string; value: unknown; onChange: (v: unknown) => void }) {
  if (NO_VALUE_OPS.has(operator)) return null;

  if (operator === "between") {
    const arr = Array.isArray(value) ? value : ["", ""];
    const isDate = type === "datetime";
    return (
      <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
        <input type={isDate ? "date" : "number"} value={String(arr[0] ?? "")} onChange={(e) => onChange([isDate ? e.target.value : Number(e.target.value), arr[1] ?? ""])} style={{ ...INPUT, width: isDate ? "150px" : "90px" }} />
        <span style={{ fontSize: "12px", color: "#999" }}>and</span>
        <input type={isDate ? "date" : "number"} value={String(arr[1] ?? "")} onChange={(e) => onChange([arr[0] ?? "", isDate ? e.target.value : Number(e.target.value)])} style={{ ...INPUT, width: isDate ? "150px" : "90px" }} />
      </span>
    );
  }

  if (ARRAY_OPS.has(operator)) {
    const text = Array.isArray(value) ? value.join(", ") : "";
    return <input value={text} onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="comma, separated, values" style={{ ...INPUT, minWidth: "200px" }} />;
  }

  if (type === "number") return <input type="number" value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} style={{ ...INPUT, width: "120px" }} />;
  if (type === "bool") return (
    <select value={value ? "true" : "false"} onChange={(e) => onChange(e.target.value === "true")} style={{ ...INPUT, width: "110px" }}>
      <option value="true">Yes</option><option value="false">No</option>
    </select>
  );
  if (type === "datetime") {
    if (operator === "within_last_days") return <input type="number" value={Number(value ?? 30)} onChange={(e) => onChange(Number(e.target.value))} style={{ ...INPUT, width: "90px" }} />;
    return <input type="date" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} style={{ ...INPUT, width: "160px" }} />;
  }
  // string / id / json_array single value
  return <input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder={type === "id" ? "id…" : "value…"} style={{ ...INPUT, minWidth: "160px" }} />;
}
