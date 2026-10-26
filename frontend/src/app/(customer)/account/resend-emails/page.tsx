"use client";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import type ReCAPTCHAType from "react-google-recaptcha";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { Banner, Loading, PageHead } from "@/components/portal/ui";

const ReCAPTCHA = dynamic(() => import("react-google-recaptcha"), {
  ssr: false,
}) as typeof ReCAPTCHAType;
// Without a site key the widget throws and crashes the page; render it only when
// configured, and don't gate submission on a token that can never be produced.
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";
const CAPTCHA_ENABLED = RECAPTCHA_SITE_KEY.length > 0;
const USER_GROUPS = [
  "Admin",
  "Accounting",
  "Purchasing",
  "Promo Standards",
  "Users",
];

export default function ResendRegistrationEmailsPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const recaptchaRef = useRef<any>(null);

  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  function toggleGroup(group: string) {
    setSelectedGroups(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (CAPTCHA_ENABLED && !recaptchaToken) {
      setMessage({ type: "error", text: "Please complete the reCAPTCHA verification." });
      return;
    }

    if (selectedGroups.length === 0 && !to.trim()) {
      setMessage({ type: "error", text: "Please select at least one user group or enter a TO email." });
      return;
    }

    setSending(true);
    setMessage(null);

    try {
      const result = await apiClient.post<{ message: string; sent_count: number }>(
        "/api/v1/account/resend-registration-emails",
        {
          groups: selectedGroups,
          to,
          cc,
          bcc,
          recaptcha_token: recaptchaToken,
        }
      );
      setMessage({ type: "success", text: result.message });
      setSelectedGroups([]);
      setTo("");
      setCc("");
      setBcc("");
      setRecaptchaToken(null);
      recaptchaRef.current?.reset();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send emails.";
      setMessage({ type: "error", text: msg });
      recaptchaRef.current?.reset();
      setRecaptchaToken(null);
    } finally {
      setSending(false);
    }
  }

  if (isLoading) return <Loading />;

  return (
    <>
      <PageHead back={{ href: "/account/users", label: "Team" }} eyebrow="Team" title="Resend invites"
        sub="Send the sign-in reminder again to a group, or to the addresses you list." />
      <form onSubmit={handleSubmit} className="cp-card cp-pad cp-stack-sm" style={{ gap: 16, maxWidth: 640 }}>
        {message && <Banner tone={message.type === "success" ? "ok" : "bad"}>{message.text}</Banner>}
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
          <legend className="cp-label" style={{ marginBottom: 6 }}>Everyone in these groups</legend>
          {USER_GROUPS.map((group) => (
            <label key={group} className="cp-check">
              <input type="checkbox" checked={selectedGroups.includes(group)} onChange={() => toggleGroup(group)} />
              {group}
            </label>
          ))}
        </fieldset>
        <hr className="cp-hr" style={{ margin: 0 }} />
        <div className="cp-field">
          <label className="cp-label" htmlFor="re-to">To</label>
          <input id="re-to" className="cp-input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@example.com, email2@example.com" />
          <span className="cp-hint">Separate several addresses with commas.</span>
        </div>
        <div className="cp-grid2">
          <div className="cp-field">
            <label className="cp-label" htmlFor="re-cc">Cc</label>
            <input id="re-cc" className="cp-input" value={cc} onChange={(e) => setCc(e.target.value)} />
          </div>
          <div className="cp-field">
            <label className="cp-label" htmlFor="re-bcc">Bcc</label>
            <input id="re-bcc" className="cp-input" value={bcc} onChange={(e) => setBcc(e.target.value)} />
          </div>
        </div>
        {/* reCAPTCHA: only when a site key is configured */}
        {CAPTCHA_ENABLED && (
          <div>
            <ReCAPTCHA
              ref={recaptchaRef}
              sitekey={RECAPTCHA_SITE_KEY}
              onChange={(token) => setRecaptchaToken(token)}
              onExpired={() => setRecaptchaToken(null)}
            />
            {!recaptchaToken && <span className="cp-hint">Complete the check above to send.</span>}
          </div>
        )}
        <div className="cp-actions" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="cp-btn cp-btn-p" disabled={sending || (CAPTCHA_ENABLED && !recaptchaToken)}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </>
  );
}
