"use client";

import { useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";

export interface Block {
  id: string;
  type: "paragraph" | "heading" | "bullet_list" | "numbered_list" | "cta_box" | "info_box" | "insight_box" | "image" | "table";
  content: Record<string, unknown>;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const BLOCK_TYPES: { type: Block["type"]; label: string; icon: string }[] = [
  { type: "paragraph", label: "Paragraph", icon: "¶" },
  { type: "heading", label: "Heading", icon: "H" },
  { type: "bullet_list", label: "Bullet List", icon: "•" },
  { type: "numbered_list", label: "Numbered List", icon: "1." },
  { type: "cta_box", label: "CTA Box", icon: "⚡" },
  { type: "info_box", label: "Info Box", icon: "ℹ" },
  { type: "insight_box", label: "Insight Box", icon: "💡" },
  { type: "image", label: "Image", icon: "🖼" },
  { type: "table", label: "Table", icon: "▦" },
];

const BLOCK_DEFAULTS: Record<Block["type"], Record<string, unknown>> = {
  paragraph: { html: "" },
  heading: { level: 2, text: "" },
  bullet_list: { items: [""] },
  numbered_list: { items: [""] },
  cta_box: { title: "", button_text: "", button_url: "" },
  info_box: { text: "" },
  insight_box: { icon: "💡", text: "" },
  image: { url: "", alt: "", caption: "", description: "" },
  table: { rows: [["", ""], ["", ""]] },
};

const inputSt: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1.5px solid #E2E0DA",
  borderRadius: "6px", fontSize: "14px", boxSizing: "border-box",
};
const labelSt: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".06em", color: "#7A7880", marginBottom: "4px", display: "block",
};

function BlockEditor({
  block,
  onChange,
  onMove,
  onDelete,
  isFirst,
  isLast,
}: {
  block: Block;
  onChange: (id: string, content: Record<string, unknown>) => void;
  onMove: (id: string, dir: "up" | "down") => void;
  onDelete: (id: string) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const c = block.content;

  function set(key: string, value: unknown) {
    onChange(block.id, { ...c, [key]: value });
  }

  function listSetItem(items: string[], idx: number, val: string) {
    const next = [...items]; next[idx] = val; set("items", next);
  }
  function listAdd(items: string[]) { set("items", [...items, ""]); }
  function listRemove(items: string[], idx: number) {
    if (items.length === 1) return;
    set("items", items.filter((_, i) => i !== idx));
  }

  function tableSetCell(rows: string[][], r: number, col: number, val: string) {
    const next = rows.map(row => [...row]);
    const targetRow = next[r];
    if (targetRow) { targetRow[col] = val; }
    set("rows", next);
  }
  function tableAddRow(rows: string[][]) {
    set("rows", [...rows, new Array(rows[0]?.length ?? 2).fill("")]);
  }
  function tableAddCol(rows: string[][]) {
    set("rows", rows.map(r => [...r, ""]));
  }
  function tableRemoveRow(rows: string[][], idx: number) {
    if (rows.length <= 1) return;
    set("rows", rows.filter((_, i) => i !== idx));
  }
  function tableRemoveCol(rows: string[][], idx: number) {
    if ((rows[0]?.length ?? 0) <= 1) return;
    set("rows", rows.map(r => r.filter((_, i) => i !== idx)));
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await apiClient.postForm<{ url: string }>("/api/v1/upload", fd);
      set("url", res.url);
    } catch {
      // ignore
    } finally { setUploading(false); }
  }

  const btnSt: React.CSSProperties = {
    background: "transparent", border: "1px solid #E2E0DA", borderRadius: "4px",
    padding: "3px 7px", fontSize: "11px", cursor: "pointer", color: "#7A7880",
  };

  let editor: React.ReactNode = null;

  if (block.type === "paragraph") {
    editor = (
      <textarea
        value={(c.html as string) || ""}
        onChange={e => set("html", e.target.value)}
        placeholder="Paragraph content (HTML or plain text)..."
        rows={4}
        style={{ ...inputSt, resize: "vertical", fontFamily: "monospace", fontSize: "13px" }}
      />
    );
  } else if (block.type === "heading") {
    editor = (
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <select value={(c.level as number) || 2} onChange={e => set("level", Number(e.target.value))}
          style={{ ...inputSt, width: "80px" }}>
          <option value={2}>H2</option>
          <option value={3}>H3</option>
          <option value={4}>H4</option>
        </select>
        <input value={(c.text as string) || ""} onChange={e => set("text", e.target.value)}
          placeholder="Heading text..." style={{ ...inputSt, flex: 1 }} />
      </div>
    );
  } else if (block.type === "bullet_list" || block.type === "numbered_list") {
    const items = (c.items as string[]) || [""];
    editor = (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ color: "#7A7880", fontSize: "13px", minWidth: "20px", textAlign: "right" }}>
              {block.type === "numbered_list" ? `${i + 1}.` : "•"}
            </span>
            <input value={item} onChange={e => listSetItem(items, i, e.target.value)}
              placeholder={`Item ${i + 1}`} style={{ ...inputSt, flex: 1 }} />
            <button type="button" onClick={() => listRemove(items, i)} style={{ ...btnSt, color: "#E8242A" }}>✕</button>
          </div>
        ))}
        <button type="button" onClick={() => listAdd(items)} style={{ ...btnSt, alignSelf: "flex-start" }}>+ Add Item</button>
      </div>
    );
  } else if (block.type === "cta_box") {
    editor = (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "rgba(26,92,255,.04)", border: "1.5px solid rgba(26,92,255,.2)", borderRadius: "8px", padding: "14px" }}>
        <div><label style={labelSt}>CTA Title</label>
          <input value={(c.title as string) || ""} onChange={e => set("title", e.target.value)} style={inputSt} placeholder="Call to action headline" /></div>
        <div style={{ display: "flex", gap: "10px" }}>
          <div style={{ flex: 1 }}><label style={labelSt}>Button Text</label>
            <input value={(c.button_text as string) || ""} onChange={e => set("button_text", e.target.value)} style={inputSt} placeholder="Shop Now" /></div>
          <div style={{ flex: 2 }}><label style={labelSt}>Button URL</label>
            <input value={(c.button_url as string) || ""} onChange={e => set("button_url", e.target.value)} style={inputSt} placeholder="https://..." /></div>
        </div>
      </div>
    );
  } else if (block.type === "info_box") {
    editor = (
      <div style={{ background: "rgba(59,130,246,.06)", border: "1.5px solid rgba(59,130,246,.25)", borderRadius: "8px", padding: "12px" }}>
        <label style={{ ...labelSt, color: "#3B82F6" }}>ℹ Info Box</label>
        <textarea value={(c.text as string) || ""} onChange={e => set("text", e.target.value)}
          placeholder="Info box content..." rows={3} style={{ ...inputSt, resize: "vertical" }} />
      </div>
    );
  } else if (block.type === "insight_box") {
    editor = (
      <div style={{ background: "rgba(245,158,11,.06)", border: "1.5px solid rgba(245,158,11,.25)", borderRadius: "8px", padding: "12px" }}>
        <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
          <div style={{ width: "100px" }}><label style={labelSt}>Icon</label>
            <input value={(c.icon as string) || "💡"} onChange={e => set("icon", e.target.value)} style={{ ...inputSt, textAlign: "center" }} placeholder="💡" /></div>
          <div style={{ flex: 1 }}><label style={labelSt}>Content</label>
            <textarea value={(c.text as string) || ""} onChange={e => set("text", e.target.value)}
              placeholder="Insight box content..." rows={3} style={{ ...inputSt, resize: "vertical" }} /></div>
        </div>
      </div>
    );
  } else if (block.type === "image") {
    editor = (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div>
          <label style={labelSt}>Image</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input value={(c.url as string) || ""} onChange={e => set("url", e.target.value)}
              placeholder="Image URL" style={{ ...inputSt, flex: 1 }} />
            <button type="button" onClick={() => fileRef.current?.click()}
              style={{ ...btnSt, padding: "7px 12px", whiteSpace: "nowrap" }}>
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
          </div>
          {typeof c.url === "string" && c.url ? <img src={c.url} alt="" style={{ marginTop: "8px", maxHeight: "120px", borderRadius: "6px", border: "1px solid #E2E0DA" }} /> : null}
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <div style={{ flex: 1 }}><label style={labelSt}>Alt Text</label>
            <input value={(c.alt as string) || ""} onChange={e => set("alt", e.target.value)} style={inputSt} placeholder="Alt text for accessibility" /></div>
          <div style={{ flex: 1 }}><label style={labelSt}>Caption</label>
            <input value={(c.caption as string) || ""} onChange={e => set("caption", e.target.value)} style={inputSt} placeholder="Image caption" /></div>
        </div>
        <div><label style={labelSt}>Description</label>
          <textarea value={(c.description as string) || ""} onChange={e => set("description", e.target.value)}
            rows={2} style={{ ...inputSt, resize: "vertical" }} placeholder="Image description" /></div>
      </div>
    );
  } else if (block.type === "table") {
    const rows = (c.rows as string[][]) || [["", ""]];
    editor = (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {rows[0]?.map((_, ci) => (
                <th key={ci} style={{ padding: "4px", border: "1px solid #E2E0DA", background: "#F9F8F4" }}>
                  <button type="button" onClick={() => tableRemoveCol(rows, ci)}
                    style={{ ...btnSt, color: "#E8242A", fontSize: "10px", width: "100%" }}>✕ Col</button>
                </th>
              ))}
              <th style={{ padding: "4px", border: "1px solid #E2E0DA", background: "#F9F8F4" }}>
                <button type="button" onClick={() => tableAddCol(rows)} style={{ ...btnSt, fontSize: "10px" }}>+ Col</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: "4px", border: "1px solid #E2E0DA" }}>
                    <input value={cell} onChange={e => tableSetCell(rows, ri, ci, e.target.value)}
                      style={{ ...inputSt, padding: "5px 7px", fontSize: "13px" }} />
                  </td>
                ))}
                <td style={{ padding: "4px", border: "1px solid #E2E0DA", verticalAlign: "middle" }}>
                  <button type="button" onClick={() => tableRemoveRow(rows, ri)}
                    style={{ ...btnSt, color: "#E8242A", fontSize: "10px" }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={() => tableAddRow(rows)} style={{ ...btnSt, marginTop: "6px" }}>+ Add Row</button>
      </div>
    );
  }

  const typeInfo = BLOCK_TYPES.find(b => b.type === block.type);

  return (
    <div style={{ border: "1.5px solid #E2E0DA", borderRadius: "8px", background: "#fff", marginBottom: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#F9F8F4", borderBottom: "1px solid #E2E0DA", borderRadius: "8px 8px 0 0" }}>
        <span style={{ fontSize: "12px", fontWeight: 700, color: "#555", display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "14px" }}>{typeInfo?.icon}</span>
          {typeInfo?.label}
        </span>
        <div style={{ display: "flex", gap: "4px" }}>
          <button type="button" onClick={() => onMove(block.id, "up")} disabled={isFirst}
            style={{ ...btnSt, opacity: isFirst ? .3 : 1 }}>▲</button>
          <button type="button" onClick={() => onMove(block.id, "down")} disabled={isLast}
            style={{ ...btnSt, opacity: isLast ? .3 : 1 }}>▼</button>
          <button type="button" onClick={() => onDelete(block.id)}
            style={{ ...btnSt, color: "#E8242A", borderColor: "rgba(232,36,42,.3)" }}>Delete</button>
        </div>
      </div>
      <div style={{ padding: "12px" }}>{editor}</div>
    </div>
  );
}

export function BlogBlockEditor({
  value,
  onChange,
}: {
  value: Block[];
  onChange: (blocks: Block[]) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  function addBlock(type: Block["type"]) {
    const block: Block = { id: uid(), type, content: { ...BLOCK_DEFAULTS[type] } };
    onChange([...value, block]);
    setShowPicker(false);
  }

  function updateBlock(id: string, content: Record<string, unknown>) {
    onChange(value.map(b => b.id === id ? { ...b, content } : b));
  }

  function moveBlock(id: string, dir: "up" | "down") {
    const idx = value.findIndex(b => b.id === id); if (idx === -1) return;
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= value.length) return;
    const next = [...value];
    const tmp = next[idx] as Block;
    next[idx] = next[swapIdx] as Block;
    next[swapIdx] = tmp;
    onChange(next);
  }

  function deleteBlock(id: string) {
    onChange(value.filter(b => b.id !== id));
  }

  return (
    <div>
      {value.map((block, i) => (
        <BlockEditor
          key={block.id}
          block={block}
          onChange={updateBlock}
          onMove={moveBlock}
          onDelete={deleteBlock}
          isFirst={i === 0}
          isLast={i === value.length - 1}
        />
      ))}

      <div style={{ position: "relative", display: "inline-block" }}>
        <button
          type="button"
          onClick={() => setShowPicker(o => !o)}
          style={{ background: "#1A5CFF", color: "#fff", border: "none", borderRadius: "7px", padding: "9px 18px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}
        >
          + Add Block
        </button>
        {showPicker && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: "#fff", border: "1px solid #E2E0DA", borderRadius: "8px", padding: "6px", boxShadow: "0 6px 20px rgba(0,0,0,.12)", zIndex: 50, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px", minWidth: "240px" }}>
            {BLOCK_TYPES.map(bt => (
              <button
                key={bt.type}
                type="button"
                onClick={() => addBlock(bt.type)}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", background: "transparent", border: "none", borderRadius: "5px", cursor: "pointer", fontSize: "13px", fontWeight: 500, color: "#2A2830", textAlign: "left" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F4F3EF")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: "15px" }}>{bt.icon}</span>
                {bt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
