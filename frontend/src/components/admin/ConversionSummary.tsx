"use client";

/**
 * The order's Conversion summary, the way Shopify shows it: which of the
 * buyer's orders this is, where their first visit came from, how many visits
 * it took, and each visit's details (where from, the first page, when, UTMs).
 *
 * The storefront lists the visits (lib/attribution.ts) and the server names
 * each one (services/attribution.journey), so this only lays them out.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Activity, ArrowLeft, Calendar, CalendarCheck, ChevronDown, Eye, FileText, Link2, MousePointerClick, Repeat, ShoppingBag, X } from "lucide-react";

export interface ConversionSession {
  at: string;
  source: string;
  kind: string;
  short: string;
  text: string;
  landing_page?: string | null;
  referrer?: string | null;
  utm: Record<string, string>;
  ad_click?: string | null;
}

export interface Conversion {
  order_count?: number | null;
  sessions: ConversionSession[];
  total_sessions: number;
  days_to_conversion?: number | null;
  converted_at?: string | null;
  device?: string | null;
}

const UTM_WORDS: [string, string][] = [
  ["utm_source", "Source"], ["utm_medium", "Medium"], ["utm_campaign", "Campaign"],
  ["utm_term", "Term"], ["utm_content", "Content"],
];

function ordinal(n: number): string {
  const v = n % 100;
  const end = v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${end}`;
}
const longDay = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "");
const atTime = (iso: string) => `${longDay(iso)} at ${new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
/** A web address as people read it: no https://, no trailing slash. */
const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

const firstLine = (s: ConversionSession) => (s.kind === "direct" ? "1st session was a direct visit" : `1st session from ${s.short}`);
const lastLine = (s: ConversionSession) => (s.kind === "direct" ? "Converted after a direct visit" : `Converted after a visit from ${s.short}`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function sessionsLine(total: number, days: number | null | undefined): string {
  const count = plural(total, "session", "sessions");
  if (days == null) return count;
  if (days === 0) return total === 1 ? "1 session, on the day they ordered" : `${count}, all on the day they ordered`;
  return `${count} over ${plural(days, "day", "days")}`;
}

export function ConversionSummary({ conversion, extra }: { conversion: Conversion; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const c = conversion;
  const first = c.sessions[0];
  const n = c.order_count ?? 0;

  return (
    <section className="pc-card pc-pad" aria-labelledby="conversion-title" data-conversion>
      <h2 className="pc-h2" id="conversion-title">Conversion summary</h2>
      <ul className="pc-conv-lines">
        {n > 0 && <li><ShoppingBag size={17} aria-hidden /> {n === 1 ? "This is their first order" : `This is their ${ordinal(n)} order`}</li>}
        {first && <li><Eye size={17} aria-hidden /> {firstLine(first)}</li>}
        {first && <li><Activity size={17} aria-hidden /> {sessionsLine(c.total_sessions, c.days_to_conversion)}</li>}
      </ul>
      {!first && (
        <p className="pc-sub-line" style={{ margin: "8px 0 0" }}>
          No visit details for this order: it was placed by your team, before visits were recorded, or in a browser that keeps nothing.
        </p>
      )}
      {first && (
        <button type="button" className="pc-link no-print" style={{ marginTop: "12px" }} onClick={() => setOpen(true)} data-conversion-open>
          View conversion details
        </button>
      )}
      {extra}
      {open && <ConversionDetails conversion={c} onClose={() => setOpen(false)} />}
    </section>
  );
}

function ConversionDetails({ conversion: c, onClose }: { conversion: Conversion; onClose: () => void }) {
  const [detail, setDetail] = useState<ConversionSession | null>(null);
  const [showReturns, setShowReturns] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const sessions = c.sessions;
  const first = sessions[0];
  const last = sessions.length > 1 ? sessions[sessions.length - 1] ?? null : null;
  const middle = sessions.slice(1, -1);
  const [fromDay, toDay] = [middle[0]?.at, middle[middle.length - 1]?.at];
  if (!first) return null;
  // Visits between the first and the last; more than the list holds when the
  // browser kept only the latest ones.
  const returned = last ? Math.max(c.total_sessions - 2, middle.length) : Math.max(c.total_sessions - 1, 0);

  return (
    <div className="pc-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pc-modal" role="dialog" aria-label={detail ? "Session details" : "Conversion details"} style={{ width: "min(600px, 100%)" }} data-conversion-details>
        <div className="pc-panel-head" style={{ alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {detail && <button type="button" className="pc-x" aria-label="Back to conversion details" onClick={() => setDetail(null)}><ArrowLeft size={18} /></button>}
            <h2 className="pc-h2">{detail ? "Session details" : "Conversion details"}</h2>
          </div>
          <button type="button" className="pc-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>

        {detail ? <SessionDetails s={detail} /> : (
          <div className="pc-pad" style={{ display: "grid", gap: "4px" }}>
            <div className="pc-conv-box">
              <div><span>Total sessions</span><b>{c.total_sessions}</b></div>
              <div><span>Days to conversion</span><b>{c.days_to_conversion ?? "-"}</b></div>
            </div>

            <div className="pc-conv-row">
              <Eye size={17} aria-hidden />
              <div><b>{firstLine(first)}</b><span>{longDay(first.at)}</span></div>
              <button type="button" className="pc-btn" onClick={() => setDetail(first)}>View details</button>
            </div>

            {returned > 0 && (
              <>
                <div className="pc-conv-row">
                  <Repeat size={17} aria-hidden />
                  <div>
                    <b>Returned {plural(returned, "time", "times")}</b>
                    <span>{middle.length > 1 ? `${longDay(fromDay)} to ${longDay(toDay)}` : longDay(fromDay)}</span>
                  </div>
                  {middle.length > 0 && (
                    <button type="button" className="pc-btn" aria-expanded={showReturns} onClick={() => setShowReturns((v) => !v)}>
                      {showReturns ? "Hide" : "Show"} <ChevronDown size={14} style={{ transform: showReturns ? "rotate(180deg)" : undefined }} aria-hidden />
                    </button>
                  )}
                </div>
                {showReturns && middle.map((s, i) => (
                  <div key={`${s.at}-${i}`} className="pc-conv-row" data-sub>
                    <span aria-hidden />
                    <div><b>{s.kind === "direct" ? "A direct visit" : `From ${s.short}`}</b><span>{longDay(s.at)}</span></div>
                    <button type="button" className="pc-btn" onClick={() => setDetail(s)}>View details</button>
                  </div>
                ))}
              </>
            )}

            {last ? (
              <div className="pc-conv-row">
                <CalendarCheck size={17} aria-hidden />
                <div><b>{lastLine(last)}</b><span>{longDay(last.at)}</span></div>
                <button type="button" className="pc-btn" onClick={() => setDetail(last)}>View details</button>
              </div>
            ) : (
              <div className="pc-conv-row">
                <CalendarCheck size={17} aria-hidden />
                <div><b>{returned > 0 ? "Ordered" : "Ordered on that same visit"}</b><span>{longDay(c.converted_at)}</span></div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 20px 18px" }}>
          <button type="button" className="pc-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function SessionDetails({ s }: { s: ConversionSession }) {
  const utm = UTM_WORDS.filter(([key]) => s.utm?.[key]);
  return (
    <div className="pc-pad" style={{ display: "grid", gap: "12px" }} data-session-details>
      <ul className="pc-conv-lines" style={{ marginTop: 0 }}>
        <li><Link2 size={17} aria-hidden /> {s.text}</li>
        {s.landing_page && (
          <li><FileText size={17} aria-hidden /> <span>The first page they visited was{" "}
            <a href={s.landing_page} target="_blank" rel="noopener noreferrer" className="pc-link" style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{bare(s.landing_page)}</a></span></li>
        )}
        <li><Calendar size={17} aria-hidden /> Visited on {atTime(s.at)}</li>
        {s.referrer && <li><MousePointerClick size={17} aria-hidden /> <span style={{ overflowWrap: "anywhere" }}>Came from {bare(s.referrer)}</span></li>}
        {s.ad_click && <li><MousePointerClick size={17} aria-hidden /> {s.ad_click === "Meta" ? "The link carried a Meta click id (an ad or a post)" : `The link carried a ${s.ad_click} click id`}</li>}
      </ul>
      <div>
        <div style={{ fontWeight: 600, fontSize: "14.5px", marginBottom: "6px" }}>UTM parameters</div>
        {utm.length === 0 ? (
          <p className="pc-sub-line" style={{ margin: 0 }}>No UTM parameters were available for this session.</p>
        ) : (
          <div style={{ display: "grid", gap: "6px" }}>
            {utm.map(([key, label]) => (
              <div key={key} className="pc-kv"><span>{label} <span style={{ color: "var(--pc-muted)", fontSize: "12.5px" }}>({key})</span></span><b style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{s.utm[key]}</b></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
