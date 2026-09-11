"use client";

/**
 * OrderGangSheets — the printable side of a paid gang-sheet order.
 *
 * A gang sheet arrives on an order as a line with no variant behind it, so the
 * order page alone can only say "something was ordered". Production needs the
 * actual sheet: what it looks like laid out, the source files at full
 * resolution, and a print-ready PDF. All of that hangs off the sheet's link back
 * to this order, so it belongs here rather than on a separate screen the team
 * has to go hunting through.
 */
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { GangSheetCanvas } from "@/components/storefront/GangSheetCanvas";
import { openSheetPdf } from "@/lib/gangSheetPdf";

interface Artwork {
  id: string;
  file_url: string;
  file_name: string;
  width_in: number;
  height_in: number;
  quantity: number;
}

interface Placement {
  artwork_id: string;
  x_in: number;
  y_in: number;
  w_in: number;
  h_in: number;
  rotation: number;
}

interface Sheet {
  id: string;
  reference: string;
  status: string;
  sheet_name: string;
  sheet_width_in: number;
  sheet_height_in: number;
  sheet_quantity: number;
  subtotal: number;
  contact_name?: string | null;
  customer_notes?: string | null;
  artworks?: Artwork[];
  layout?: Placement[];
  bleed_in?: number;
  spacing_in?: number;
}

const FALLBACK_TONE = { bg: "#F1F1F0", fg: "#4A4A4A" };

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  submitted: { bg: "#EFF6FF", fg: "#1E40AF" },
  in_review: { bg: "#FEF3C7", fg: "#92400E" },
  approved: { bg: "#DCFCE7", fg: "#166534" },
  in_production: { bg: "#EDE9FE", fg: "#5B21B6" },
  completed: { bg: "#F1F1F0", fg: "#4A4A4A" },
  revision_requested: { bg: "#FEE2E2", fg: "#991B1B" },
};

export function OrderGangSheets({ orderId }: { orderId: string }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get<{ sheets: Sheet[] }>(`/api/v1/admin/gang-sheets/by-order/${orderId}`);
      setSheets(r.sheets ?? []);
      // A single sheet is the common case — open it rather than making the
      // admin click once more to see the only thing on the order.
      if (r.sheets?.length === 1) setOpenId(r.sheets[0]!.id);
    } catch {
      setSheets([]);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  if (sheets === null) {
    return (
      <div style={CARD}>
        <div className="at-skel" style={{ height: "14px", width: "30%", marginBottom: "12px" }} />
        <div className="at-skel" style={{ height: "160px", width: "100%" }} />
      </div>
    );
  }
  if (!sheets.length) return null;      // not a gang-sheet order

  return (
    <div style={CARD}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#1A1A1A", margin: 0 }}>
          Gang sheet{sheets.length > 1 ? `s (${sheets.length})` : ""}
        </h2>
        <a href="/admin/gang-sheets" style={{ fontSize: "12px", fontWeight: 600, color: "#6B6B6B", textDecoration: "none" }}>
          Open review queue →
        </a>
      </div>

      {sheets.map((s) => {
        const isOpen = openId === s.id;
        const tone = STATUS_TONE[s.status] ?? FALLBACK_TONE;
        const arts = s.artworks ?? [];
        const layout = s.layout ?? [];
        return (
          <div key={s.id} style={{ border: "1px solid #E3E3E3", borderRadius: "10px", marginBottom: "12px", overflow: "hidden" }}>
            <div
              onClick={() => setOpenId(isOpen ? null : s.id)}
              style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 15px", background: "#F9F9F8", cursor: "pointer", flexWrap: "wrap" }}
            >
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px", fontWeight: 700, color: "#1A1A1A" }}>{s.reference}</span>
              <span style={{ fontSize: "13px", color: "#4A4A4A" }}>
                {s.sheet_name} · {s.sheet_width_in}″ × {s.sheet_height_in}″ · ×{s.sheet_quantity}
              </span>
              <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", background: tone.bg, color: tone.fg, padding: "3px 9px", borderRadius: "20px" }}>
                {s.status.replace(/_/g, " ")}
              </span>
              <span style={{ marginLeft: "auto", fontSize: "12px", color: "#8A8A8A" }}>
                {arts.length} file{arts.length === 1 ? "" : "s"} · {isOpen ? "▾" : "▸"}
              </span>
            </div>

            {isOpen && (
              <div style={{ padding: "16px 15px" }}>
                {layout.length > 0 ? (
                  <GangSheetCanvas
                    sheet={{
                      width_in: s.sheet_width_in,
                      height_in: s.sheet_height_in,
                      bleed_in: s.bleed_in ?? 0.125,
                      spacing_in: s.spacing_in ?? 0.125,
                    }}
                    artworks={arts}
                    value={layout}
                    onChange={() => {}}
                    readOnly
                  />
                ) : (
                  <div style={NOTE}>
                    This sheet has no saved layout yet — arrange it in the review queue before printing.
                  </div>
                )}

                <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => openSheetPdf({
                      reference: s.reference,
                      customerName: s.contact_name ?? undefined,
                      sheet: { width_in: s.sheet_width_in, height_in: s.sheet_height_in, bleed_in: s.bleed_in ?? 0.125 },
                      artworks: arts,
                      layout,
                    })}
                    disabled={!layout.length}
                    style={{ ...BTN_DARK, opacity: layout.length ? 1 : 0.45, cursor: layout.length ? "pointer" : "not-allowed" }}
                  >
                    Download print PDF
                  </button>
                  <a href="/admin/gang-sheets" style={{ ...BTN_LIGHT, textDecoration: "none", display: "inline-block" }}>
                    Edit layout
                  </a>
                </div>

                {s.customer_notes && (
                  <div style={{ marginTop: "14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "8px", padding: "10px 12px", fontSize: "12px", color: "#78350F", lineHeight: 1.6 }}>
                    <strong>Customer notes:</strong> {s.customer_notes}
                  </div>
                )}

                {/* Source files — production prints from these, so full resolution
                    and an obvious download matter more than a tidy list. */}
                <div style={{ marginTop: "16px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#6B6B6B", marginBottom: "8px" }}>
                    Artwork files ({arts.length})
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: "10px" }}>
                    {arts.map((a) => (
                      <a key={a.id} href={a.file_url} target="_blank" rel="noopener noreferrer" download
                        style={{ border: "1px solid #E3E3E3", borderRadius: "8px", padding: "8px", textDecoration: "none", color: "inherit", background: "#fff" }}>
                        <div style={{ background: "#F6F6F7", borderRadius: "6px", aspectRatio: "1", display: "grid", placeItems: "center", overflow: "hidden", marginBottom: "7px" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.file_url} alt={a.file_name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        </div>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "#1A1A1A", wordBreak: "break-all", lineHeight: 1.35 }}>{a.file_name}</div>
                        <div style={{ fontSize: "11px", color: "#8A8A8A", marginTop: "2px" }}>
                          {a.width_in}″×{a.height_in}″ · qty {a.quantity}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const CARD: React.CSSProperties = { background: "#fff", border: "1px solid #E3E3E3", borderRadius: "12px", padding: "22px", marginBottom: "20px" };
const NOTE: React.CSSProperties = { background: "#F6F6F7", border: "1px solid #E3E3E3", borderRadius: "8px", padding: "14px", fontSize: "13px", color: "#6B6B6B" };
const BTN_DARK: React.CSSProperties = { padding: "9px 16px", background: "#1A1A1A", color: "#fff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 700 };
const BTN_LIGHT: React.CSSProperties = { padding: "9px 16px", background: "#fff", color: "#1A1A1A", border: "1px solid #E3E3E3", borderRadius: "8px", fontSize: "13px", fontWeight: 600 };
