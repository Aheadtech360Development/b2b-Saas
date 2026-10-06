"use client";

/**
 * GangSheetLineFiles — what production needs, under a gang sheet's order line.
 *
 * Shops moving over from Shopify know their print app's list on the line
 * itself: the size, a preview, an edit link for the buyer and one for the
 * shop, the print-ready file, and whether any design is low resolution. The
 * line here says the same things in the same order, for each of the three
 * builders — the sheet builder, Upload by size, and a buyer's own finished
 * sheet.
 *
 * The preview and the print file are drawn by the server when opened and
 * reached by signed links (api/v1/gang_sheets.py, file_link), so they are plain
 * links: nothing is drawn until somebody asks for it.
 */
import { useState } from "react";
import { API_BASE_URL } from "@/lib/constants";
import { downloadFile } from "@/lib/download";
import { GANG_SHEET_STATUS_LABEL, type GangSheetStatus } from "@/services/gangSheets.service";

export interface GangSheetProduction {
  id: string;
  reference: string;
  kind: "gang_sheet" | "upload_by_size" | "upload_own";
  status: string;
  sheet_name: string;
  width_in: number;
  height_in: number;
  quantity: number;
  preview_url: string | null;
  print_file: { url: string; name: string; signed: boolean } | null;
  needs_layout: boolean;
  left_out: string[];
  edit_url: string | null;
  admin_edit_url: string;
  originals: { name: string; url: string }[];
  resolution: {
    low: boolean;
    low_files: { name: string; dpi: number }[];
    lowest_dpi: number | null;
    designs: number;
    unchecked: number;
    threshold_dpi: number;
  };
}

const BUILDER: Record<GangSheetProduction["kind"], string> = {
  gang_sheet: "Gang sheet builder",
  upload_by_size: "Upload by size",
  upload_own: "Print-ready sheet (uploaded)",
};

/** A path on the API — a signed file, or a file in the store's own media — as a full address. */
export function apiHref(url: string): string {
  return url.startsWith("/") ? `${API_BASE_URL}${url}` : url;
}

const inches = (n: number) => `${Number(Number(n).toFixed(2))}″`;

export function GangSheetLineFiles({ sheet }: { sheet: GangSheetProduction }) {
  const [copied, setCopied] = useState(false);
  const res = sheet.resolution;
  const status = GANG_SHEET_STATUS_LABEL[sheet.status as GangSheetStatus] ?? sheet.status.replace(/_/g, " ");

  async function copyEditLink() {
    if (!sheet.edit_url) return;
    const link = new URL(sheet.edit_url, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("The buyer's edit link:", link);
    }
  }

  const original = (name: string) => sheet.originals.find((o) => o.name === name);

  const rows: [string, React.ReactNode][] = [
    ["Size", <>{inches(sheet.width_in)} × {inches(sheet.height_in)}<Muted> · ×{sheet.quantity}</Muted></>],
    ["Builder", BUILDER[sheet.kind] ?? sheet.kind],
    ["Preview", sheet.preview_url
      ? <a href={apiHref(sheet.preview_url)} target="_blank" rel="noopener noreferrer" style={LINK}>View preview ↗</a>
      : <Muted>Not laid out yet</Muted>],
    ["Edit", sheet.edit_url
      // A link for the buyer: it opens in their account, so it is copied to
      // send them rather than opened here.
      ? <button type="button" onClick={copyEditLink} style={LINK_BUTTON}>{copied ? "Copied ✓" : "Copy the buyer's edit link"}</button>
      : sheet.kind === "upload_own"
        ? <Muted>— uploaded as a finished file</Muted>
        : <Muted>Locked — {status}</Muted>],
    ["Admin edit", <a href={sheet.admin_edit_url} style={LINK}>Open in the sheet editor →</a>],
    ["Print ready file", sheet.print_file
      ? sheet.print_file.signed
        // Drawn at 300 DPI as it downloads — a plain link, so a sheet of any
        // length streams to disk rather than through the page.
        ? <><a href={apiHref(sheet.print_file.url)} download={sheet.print_file.name} style={LINK}>↓ {sheet.print_file.name}</a><Muted> · 300 DPI PNG</Muted></>
        : <><button type="button" onClick={() => { void downloadFile(apiHref(sheet.print_file!.url), sheet.print_file!.name); }} style={LINK_BUTTON}>↓ {sheet.print_file.name}</button><Muted> · the buyer&apos;s own file</Muted></>
      : sheet.needs_layout
        ? <span style={{ color: "#92400E", fontWeight: 600 }}>Arrange it in the sheet editor first</span>
        : <Muted>—</Muted>],
    ["Has low resolution", res.low
      ? <><strong style={{ color: "#B91C1C" }}>Yes</strong><Muted> — {res.low_files.map((f) => `${f.name} (${f.dpi} DPI)`).join(", ")}</Muted></>
      : res.lowest_dpi != null
        ? <><strong style={{ color: "#047857" }}>No</strong><Muted> — lowest {res.lowest_dpi} DPI</Muted></>
        : res.unchecked > 0
          ? <Muted>Not checked</Muted>
          : <strong style={{ color: "#047857" }}>No</strong>],
  ];
  if (sheet.left_out.length) {
    rows.push(["Not in the PNG", <>
      {sheet.left_out.map((name, i) => {
        const o = original(name);
        return (
          <span key={name}>
            {i > 0 && ", "}
            {o
              ? <button type="button" onClick={() => { void downloadFile(apiHref(o.url), o.name); }} style={LINK_BUTTON}>{name}</button>
              : name}
          </span>
        );
      })}
      <Muted> — print from the original</Muted>
    </>]);
  }

  return (
    <div data-gang-sheet={sheet.reference} style={{ marginTop: "8px", fontSize: "12px", lineHeight: 1.7, borderLeft: "2px solid #E3E3E3", paddingLeft: "10px" }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: "flex", gap: "10px", flexWrap: "wrap", color: "#4B4B4B" }}>
          <span style={{ color: "#8A8A8A", minWidth: "128px" }}>{label}</span>
          <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflowWrap: "anywhere" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#8A8A8A", fontWeight: 400 }}>{children}</span>;
}

const LINK: React.CSSProperties = { color: "#1C3557", fontWeight: 700, textDecoration: "none" };
const LINK_BUTTON: React.CSSProperties = { ...LINK, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", fontWeight: 700, textAlign: "left" };
