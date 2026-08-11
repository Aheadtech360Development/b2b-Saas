"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GANG_SHEET_STATUS_COLOR,
  GANG_SHEET_STATUS_LABEL,
  gangSheetsService,
  type GangSheetOrder,
  type GangSheetSize,
} from "@/services/gangSheets.service";
import { GangSheetStudio } from "@/components/storefront/GangSheetStudio";
import { GangSheetTimeline } from "@/components/storefront/GangSheetTimeline";
import { useAuthStore } from "@/stores/auth.store";

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E8E6E1",
  borderRadius: "var(--brand-corner-radius, 10px)",
  padding: "22px",
};

// Staged messages shown while the editor spins up — the "starting your builder"
// beat the reference tools use so the jump into a full-screen canvas feels smooth.
const LOADING_STEPS = [
  "Starting your builder…",
  "Preparing your canvas…",
  "Loading design tools…",
  "Almost there…",
];

type Phase = "idle" | "loading" | "welcome" | "studio";

export default function GangSheetBuilderPage() {
  const { isAuthenticated, user } = useAuthStore();
  const [sizes, setSizes] = useState<GangSheetSize[]>([]);
  const [orders, setOrders] = useState<GangSheetOrder[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [loadStep, setLoadStep] = useState(0);
  const [autoStart, setAutoStart] = useState(false);
  const [justSaved, setJustSaved] = useState<GangSheetOrder | null>(null);
  const [productId, setProductId] = useState<string | null>(null);

  useEffect(() => {
    setProductId(new URLSearchParams(window.location.search).get("product"));
  }, []);

  useEffect(() => {
    gangSheetsService.listSizes().then(setSizes).catch(() => setSizes([]));
  }, []);

  const loadOrders = useCallback(() => {
    if (!isAuthenticated()) return;
    gangSheetsService.myOrders().then(setOrders).catch(() => setOrders([]));
  }, [isAuthenticated]);
  useEffect(loadOrders, [loadOrders]);

  // ── Launch flow: idle → loading (staged) → welcome modal ─────────────────────
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  function clearTimers() { timers.current.forEach(clearTimeout); timers.current = []; }
  useEffect(() => clearTimers, []);

  function launch() {
    if (!isAuthenticated()) { window.location.href = "/login?next=/gang-sheets"; return; }
    if (sizes.length === 0) return;
    setJustSaved(null);
    setLoadStep(0);
    setPhase("loading");
    // Advance the loading copy, then reveal the welcome choices.
    LOADING_STEPS.forEach((_, i) => {
      if (i === 0) return;
      timers.current.push(setTimeout(() => setLoadStep(i), i * 480));
    });
    timers.current.push(setTimeout(() => setPhase("welcome"), LOADING_STEPS.length * 480 + 250));
  }

  function enterStudio(auto: boolean) {
    setAutoStart(auto);
    setPhase("studio");
  }

  function closeStudio() {
    setPhase("idle");
    loadOrders();
  }
  function onSaved(order: GangSheetOrder) {
    setJustSaved(order);
    setPhase("idle");
    loadOrders();
  }

  // ── Full-screen studio ───────────────────────────────────────────────────────
  if (phase === "studio") {
    return (
      <GangSheetStudio
        sizes={sizes}
        productId={productId}
        contactName={[user?.first_name, user?.last_name].filter(Boolean).join(" ") || undefined}
        contactEmail={user?.email}
        autoStart={autoStart}
        onClose={closeStudio}
        onSaved={onSaved}
      />
    );
  }

  return (
    <div style={{ maxWidth: "980px", margin: "0 auto", padding: "36px 20px 60px" }}>
      {/* ── Loading overlay ──────────────────────────────────────────────────── */}
      {phase === "loading" && (
        <div style={overlay}>
          <style>{"@keyframes gsspin{to{transform:rotate(360deg)}}"}</style>
          <div style={{ textAlign: "center" }}>
            <div style={spinner} />
            <div style={{ fontSize: "18px", fontWeight: 800, marginTop: "26px" }}>{LOADING_STEPS[loadStep]}</div>
            <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginTop: "16px" }}>
              {LOADING_STEPS.map((_, i) => (
                <span key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: i <= loadStep ? "var(--brand-primary,#1C3557)" : "#D6D3CC", transition: "background .2s" }} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Welcome modal ────────────────────────────────────────────────────── */}
      {phase === "welcome" && (
        <div style={overlay}>
          <div style={{ ...CARD, width: "min(460px, 92vw)", padding: "28px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "6px" }}>Welcome to the Gang Sheet Builder</h2>
            <p style={{ fontSize: "13px", color: "#777", marginBottom: "20px" }}>
              Build a print-ready sheet in minutes. Choose how you&apos;d like to start.
            </p>
            <div style={{ display: "grid", gap: "10px" }}>
              <button onClick={() => enterStudio(false)} style={welcomeBtn}>
                <span>Start a brand-new gang sheet</span><span>→</span>
              </button>
              <button onClick={() => enterStudio(true)} style={{ ...welcomeBtn, background: "#F4F6FB", color: "var(--brand-primary,#1C3557)", borderColor: "#D9DEE9" }}>
                <span>Auto build (upload &amp; we arrange)</span><span>→</span>
              </button>
              <button onClick={() => setPhase("idle")} style={{ ...welcomeBtn, background: "#fff", color: "#888", justifyContent: "center", borderStyle: "dashed" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Landing ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "20px", flexWrap: "wrap", marginBottom: "22px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "6px", fontFamily: "var(--brand-font-heading, inherit)" }}>Gang Sheet Builder</h1>
          <p style={{ color: "#666", fontSize: "14px", maxWidth: "540px" }}>
            Drop your designs onto a sheet, arrange them with drag &amp; drop, and see live print quality — then save it straight to your cart.
          </p>
        </div>
      </div>

      {justSaved && (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#166534", padding: "14px 16px", borderRadius: "10px", fontSize: "14px", marginBottom: "20px" }}>
          ✓ <strong>{justSaved.reference}</strong> saved — {justSaved.sheet_name} · {justSaved.sheet_quantity} sheet(s) · ${justSaved.subtotal.toFixed(2)}. It&apos;s in <a href="/account/gang-sheets" style={{ color: "#166534", fontWeight: 700 }}>My Gang Sheets</a>.
        </div>
      )}

      {/* Hero / launch */}
      <div style={{ ...CARD, textAlign: "center", padding: "40px 24px", marginBottom: "26px", background: "linear-gradient(135deg,#FBFBF9,#F4F6FB)" }}>
        <div style={{ fontSize: "40px" }}>🧩</div>
        <h2 style={{ fontSize: "20px", fontWeight: 800, margin: "10px 0 6px" }}>Build a Gang Sheet</h2>
        <p style={{ fontSize: "13px", color: "#777", maxWidth: "420px", margin: "0 auto 18px" }}>
          A full-screen editor with uploads, text, auto-nesting and live DPI checks.
        </p>
        {sizes.length === 0 ? (
          <div style={{ color: "#999", fontSize: "13px" }}>Gang sheets aren&apos;t available from this store yet.</div>
        ) : (
          <button onClick={launch} style={{ background: "var(--brand-primary,#1C3557)", color: "#fff", border: "none", padding: "14px 34px", borderRadius: "8px", fontSize: "15px", fontWeight: 800, cursor: "pointer" }}>
            {isAuthenticated() ? "Open the builder →" : "Sign in to build →"}
          </button>
        )}
        {sizes.length > 0 && (
          <div style={{ marginTop: "18px", fontSize: "12px", color: "#999" }}>
            {sizes.slice(0, 6).map((s) => s.name).join(" · ")}
          </div>
        )}
      </div>

      {/* History */}
      {orders.length > 0 && (
        <div>
          <h2 style={{ fontSize: "17px", fontWeight: 800, marginBottom: "12px" }}>Your gang sheets</h2>
          <div style={{ display: "grid", gap: "14px" }}>
            {orders.map((o) => {
              const c = GANG_SHEET_STATUS_COLOR[o.status] ?? { bg: "#eee", fg: "#555" };
              return (
                <div key={o.id} style={{ ...CARD, padding: "16px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "12px" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "14px" }}>
                        {o.reference}{(o.version ?? 1) > 1 ? <span style={{ color: "#888", fontWeight: 500 }}> · v{o.version}</span> : null}
                      </div>
                      <div style={{ fontSize: "12px", color: "#888" }}>{o.sheet_name} · {o.sheet_quantity} sheet(s) · ${o.subtotal.toFixed(2)}</div>
                      {o.supplier_notes && <div style={{ fontSize: "12px", color: "#9A3412", marginTop: "4px" }}>“{o.supplier_notes}”</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ background: c.bg, color: c.fg, padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700 }}>
                        {GANG_SHEET_STATUS_LABEL[o.status] ?? o.status}
                      </span>
                      {o.paid && <span style={{ background: "#DCFCE7", color: "#166534", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700 }}>Paid ✓</span>}
                      {o.status === "revision_requested" && (
                        <button onClick={() => gangSheetsService.resubmit(o.id).then(loadOrders).catch(() => {})} style={{ background: "var(--brand-primary,#1C3557)", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Resubmit</button>
                      )}
                      <button onClick={() => gangSheetsService.reorder(o.id).then(loadOrders).catch(() => {})} style={{ background: "none", border: "1px solid #DDD9D2", padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Reorder</button>
                    </div>
                  </div>
                  <GangSheetTimeline status={o.status} timeline={o.status_timeline} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 200, background: "rgba(244,243,241,.96)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const spinner: React.CSSProperties = {
  width: "46px", height: "46px", borderRadius: "50%",
  border: "4px solid #E2E0DA", borderTopColor: "var(--brand-primary,#1C3557)",
  margin: "0 auto", animation: "gsspin 0.8s linear infinite",
};
const welcomeBtn: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  background: "var(--brand-primary,#1C3557)", color: "#fff", border: "1px solid #E5E3DE",
  padding: "14px 16px", borderRadius: "9px", fontSize: "14px", fontWeight: 700, cursor: "pointer",
};
