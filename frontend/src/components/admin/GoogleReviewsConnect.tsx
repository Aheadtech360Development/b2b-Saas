"use client";

/**
 * Connect Google Reviews — shown at the top of Catalogue › Reviews.
 *
 * Three states, each with one thing to do:
 *   not connected       → Connect Google Reviews (signs in with Google)
 *   connected, no place → choose which business to import from
 *   importing           → rating, count, last sync, Sync now / Disconnect
 *
 * Imported reviews land in the table below with the site's own reviews and are
 * approved or hidden the same way.
 */
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

interface Status {
  configured: boolean;
  connected: boolean;
  google_email: string | null;
  location: string | null;
  location_name: string | null;
  maps_url: string | null;
  average_rating: number | null;
  total_reviews: number | null;
  imported: number | null;
  shown: number;
  last_synced_at: string | null;
  last_error: string | null;
}

interface Location {
  account: string;
  account_name: string | null;
  location: string;
  title: string | null;
  address: string;
  maps_url: string | null;
}

const CARD: React.CSSProperties = {
  background: "#fff", border: "1px solid #E3E3E3", borderRadius: "10px",
  padding: "18px 20px", marginBottom: "16px",
};
const BTN_DARK: React.CSSProperties = {
  padding: "9px 16px", background: "#1A1A1A", color: "#fff", border: "none",
  borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
  fontFamily: "var(--font-jakarta)",
};
const BTN_LIGHT: React.CSSProperties = {
  padding: "8px 14px", background: "#fff", color: "#1A1A1A", border: "1px solid #E3E3E3",
  borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
  fontFamily: "var(--font-jakarta)",
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

export function GoogleReviewsConnect({ onChanged }: { onChanged?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await apiClient.get<Status>("/api/v1/admin/google-reviews"));
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    load();
    // Coming back from Google's sign-in page.
    const params = new URLSearchParams(window.location.search);
    const result = params.get("google");
    if (result === "connected") setNote({ ok: true, text: "Google connected. Now choose your business." });
    else if (result === "error") setNote({ ok: false, text: params.get("message") || "Google sign-in did not finish." });
    if (result) window.history.replaceState(null, "", window.location.pathname);
  }, [load]);

  // Once connected, the next step is picking the business — load the choices.
  useEffect(() => {
    if (!status?.connected || status.location || locations) return;
    apiClient.get<{ locations: Location[] }>("/api/v1/admin/google-reviews/locations")
      .then(r => setLocations(r.locations ?? []))
      .catch(e => setNote({ ok: false, text: (e as { detail?: string; message?: string })?.detail
        || (e as { message?: string })?.message || "Could not list your Google businesses." }));
  }, [status, locations]);

  async function connect() {
    setBusy("connect");
    setNote(null);
    try {
      const r = await apiClient.post<{ url: string }>("/api/v1/admin/google-reviews/connect", {
        return_to: window.location.origin,
      });
      window.location.href = r.url;
    } catch (e) {
      const err = e as { detail?: string; message?: string };
      setNote({ ok: false, text: err?.detail || err?.message || "Could not start Google sign-in." });
      setBusy(null);
    }
  }

  async function choose(loc: Location) {
    setBusy(loc.location);
    setNote(null);
    try {
      const r = await apiClient.post<{ synced: boolean; added?: number; message?: string }>(
        "/api/v1/admin/google-reviews/location",
        { account: loc.account, location: loc.location, title: loc.title,
          account_name: loc.account_name, maps_url: loc.maps_url },
      );
      setNote(r.synced
        ? { ok: true, text: `${r.added ?? 0} Google review${r.added === 1 ? "" : "s"} imported.` }
        : { ok: false, text: r.message || "Saved. Reviews will import on the next sync." });
      setLocations(null);
      await load();
      onChanged?.();
    } catch (e) {
      const err = e as { detail?: string; message?: string };
      setNote({ ok: false, text: err?.detail || err?.message || "Could not use that business." });
    }
    setBusy(null);
  }

  async function sync() {
    setBusy("sync");
    setNote(null);
    try {
      const r = await apiClient.post<{ added: number; updated: number; removed: number }>(
        "/api/v1/admin/google-reviews/sync", {});
      setNote({ ok: true, text: `Up to date — ${r.added} new, ${r.updated} updated, ${r.removed} removed.` });
      await load();
      onChanged?.();
    } catch (e) {
      const err = e as { detail?: string; message?: string };
      setNote({ ok: false, text: err?.detail || err?.message || "Sync failed." });
      await load();
    }
    setBusy(null);
  }

  async function disconnect() {
    if (!confirm("Disconnect Google? The imported Google reviews are removed from your store.")) return;
    setBusy("disconnect");
    try {
      await apiClient.delete("/api/v1/admin/google-reviews");
      setNote({ ok: true, text: "Google disconnected." });
      setLocations(null);
      await load();
      onChanged?.();
    } catch {
      setNote({ ok: false, text: "Could not disconnect." });
    }
    setBusy(null);
  }

  if (!status) return null;

  return (
    <div style={CARD}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "#F6F6F7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <GoogleMark />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#2A2830" }}>Google Reviews</div>
            <div style={{ fontSize: "12.5px", color: "#7A7880", marginTop: "2px" }}>
              {!status.connected && "Show the reviews from your Google Business Profile on your store."}
              {status.connected && !status.location && `Connected as ${status.google_email ?? "your Google account"} — choose your business below.`}
              {status.connected && status.location && (
                <>
                  {status.location_name}
                  {status.average_rating != null && <> · <span style={{ color: "#FBBF24" }}>★</span> {Number(status.average_rating).toFixed(1)}</>}
                  {status.total_reviews != null && <> · {status.total_reviews} on Google</>}
                  {" · "}{status.shown} shown in your store
                  {status.last_synced_at && <> · synced {new Date(status.last_synced_at).toLocaleString()}</>}
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          {!status.connected ? (
            <button onClick={connect} disabled={busy !== null} style={{ ...BTN_DARK, opacity: busy ? .6 : 1 }}>
              {busy === "connect" ? "Opening Google…" : "Connect Google Reviews"}
            </button>
          ) : (
            <>
              {status.location && (
                <button onClick={sync} disabled={busy !== null} style={{ ...BTN_LIGHT, opacity: busy ? .6 : 1 }}>
                  {busy === "sync" ? "Syncing…" : "Sync now"}
                </button>
              )}
              <button onClick={disconnect} disabled={busy !== null}
                style={{ ...BTN_LIGHT, color: "#E8242A", borderColor: "#FECACA", opacity: busy ? .6 : 1 }}>
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {/* Choosing the business */}
      {status.connected && !status.location && locations && (
        <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {locations.length === 0 ? (
            <div style={{ fontSize: "12.5px", color: "#7A7880" }}>
              This Google account does not manage any business. Sign in with the account that owns your Business Profile.
            </div>
          ) : locations.map(loc => (
            <div key={loc.location} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", border: "1px solid #F1F1F1", borderRadius: "8px", padding: "10px 12px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#2A2830" }}>{loc.title}</div>
                {loc.address && <div style={{ fontSize: "12px", color: "#7A7880" }}>{loc.address}</div>}
              </div>
              <button onClick={() => choose(loc)} disabled={busy !== null} style={{ ...BTN_DARK, padding: "7px 14px", opacity: busy ? .6 : 1 }}>
                {busy === loc.location ? "Importing…" : "Use this business"}
              </button>
            </div>
          ))}
        </div>
      )}

      {!status.configured && !status.connected && (
        <div style={{ marginTop: "12px", fontSize: "12px", color: "#D97706" }}>
          Google sign-in is not set up on this platform yet — the platform administrator needs to add it.
        </div>
      )}
      {status.last_error && !note && (
        <div style={{ marginTop: "12px", fontSize: "12px", color: "#D97706" }}>{status.last_error}</div>
      )}
      {note && (
        <div style={{ marginTop: "12px", fontSize: "12.5px", fontWeight: 600, color: note.ok ? "#059669" : "#E8242A" }}>
          {note.text}
        </div>
      )}
    </div>
  );
}
