"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type ReCAPTCHAType from "react-google-recaptcha";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import { productsService } from "@/services/products.service";

const ReCAPTCHA = nextDynamic(() => import("react-google-recaptcha"), {
  ssr: false,
}) as typeof ReCAPTCHAType;
// Render the widget only when a site key exists — an empty key throws and takes
// the page down; without it, submission is not gated on a captcha token.
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";
const CAPTCHA_ENABLED = RECAPTCHA_SITE_KEY.length > 0;

const labelStyle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: ".08em", color: "#7A7880", marginBottom: "6px", display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", border: "1.5px solid #E2E0DA", borderRadius: "8px",
  fontSize: "14px", fontFamily: "var(--font-jakarta)", outline: "none", boxSizing: "border-box",
};
const requiredStar = <span style={{ color: "#E8242A" }}>*</span>;

export default function EmailFlyerPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const recaptchaRef = useRef<any>(null);
  const user = useAuthStore(s => s.user);

  const [product, setProduct] = useState<{ id: string; name: string; hasFlyer: boolean; flyerUrl: string | null } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fromEmail, setFromEmail] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    productsService.getProductBySlug(slug as string)
      .then((p: any) => {
        const flyer = p?.assets?.find((a: any) => a.asset_type === "flyer") ?? null;
        setProduct({
          id: p.id,
          name: p.name,
          hasFlyer: !!flyer,
          flyerUrl: flyer?.url ?? null,
        });
        setSubject(`Product Flyer — ${p.name}`);
      })
      .catch(() => setLoadError("Product not found."));
  }, [slug]);

  useEffect(() => {
    if (user?.email) setFromEmail(user.email);
  }, [user]);

  const canSend = to.trim() && subject.trim() && (!CAPTCHA_ENABLED || !!recaptchaToken);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend || !product) return;
    setSending(true);
    setSendMsg(null);
    try {
      const res = await apiClient.post<{ message: string }>(
        `/api/v1/products/${product.id}/email-flyer`,
        { from_email: fromEmail, to, cc, subject, message, recaptcha_token: recaptchaToken }
      );
      setSendMsg({ type: "success", text: res.message ?? "Email sent successfully." });
      setTo("");
      setCc("");
      setMessage("");
      setRecaptchaToken(null);
      recaptchaRef.current?.reset();
    } catch (err: unknown) {
      setSendMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to send. Please try again." });
      recaptchaRef.current?.reset();
      setRecaptchaToken(null);
    } finally {
      setSending(false);
    }
  }

  if (loadError) {
    return (
      <div style={{ fontFamily: "var(--font-jakarta)", maxWidth: "640px", margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
        <p style={{ color: "#E8242A" }}>{loadError}</p>
        <button onClick={() => router.back()} style={{ marginTop: "16px", padding: "10px 20px", border: "1px solid #E2E0DA", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}>Go Back</button>
      </div>
    );
  }

  if (!product) {
    return <div style={{ fontFamily: "var(--font-jakarta)", maxWidth: "640px", margin: "80px auto", padding: "0 24px", textAlign: "center", color: "#7A7880" }}>Loading…</div>;
  }

  const previewHtml = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;border:1px solid #E2E0DA;border-radius:8px;overflow:hidden">
      <div style="background:#080808;padding:20px;text-align:center">
        <span style="font-size:28px;font-weight:900;color:#1A5CFF">A</span>
        <span style="font-size:28px;font-weight:900;color:#E8242A">F</span>
        <span style="color:#fff;font-size:12px;margin-left:6px;letter-spacing:.1em">APPARELS</span>
      </div>
      <div style="padding:24px;background:#fff">
        <h2 style="margin:0 0 8px;color:#2A2830;font-size:18px">${subject || "(no subject)"}</h2>
        ${fromEmail ? `<p style="font-size:12px;color:#7A7880;margin:0 0 12px">Reply to: ${fromEmail}</p>` : ""}
        <hr style="border:none;border-top:1px solid #E2E0DA;margin:12px 0">
        ${message ? `<p style="color:#374151;font-size:14px;white-space:pre-line;margin:0 0 16px">${message}</p>` : ""}
        <p style="color:#374151;font-size:14px;margin:0 0 16px">Please find the product flyer for <strong>${product.name}</strong> below:</p>
        <p><a href="${product.flyerUrl ?? "#"}" style="background:#1A5CFF;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">View / Download Flyer (PDF)</a></p>
        <p style="color:#7A7880;font-size:11px;margin:20px 0 0">AF Apparels Wholesale · af-apparel.com</p>
      </div>
    </div>
  `;

  return (
    <div style={{ fontFamily: "var(--font-jakarta)", maxWidth: "680px", margin: "0 auto", padding: "40px 24px" }}>
      {/* Back link */}
      <button
        onClick={() => router.back()}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#7A7880", fontSize: "13px", marginBottom: "24px", display: "flex", alignItems: "center", gap: "6px", padding: 0 }}
      >
        ← Back to product
      </button>

      {/* Heading */}
      <h1 style={{ fontFamily: "var(--font-bebas)", fontSize: "36px", color: "#2A2830", letterSpacing: ".02em", marginBottom: "4px" }}>EMAIL PRODUCT</h1>
      <p style={{ fontSize: "13px", color: "#7A7880", marginBottom: "28px" }}>
        {product.name}{!product.hasFlyer ? " — No flyer uploaded for this product yet." : ""}
      </p>

      {sendMsg && (
        <div style={{ padding: "12px 16px", borderRadius: "8px", marginBottom: "20px", fontSize: "14px", fontWeight: 600, background: sendMsg.type === "success" ? "rgba(5,150,105,.08)" : "rgba(232,36,42,.08)", color: sendMsg.type === "success" ? "#059669" : "#E8242A", border: `1px solid ${sendMsg.type === "success" ? "#A7F3D0" : "#FECACA"}` }}>
          {sendMsg.text}
        </div>
      )}

      <form onSubmit={handleSend} style={{ background: "#fff", border: "1px solid #E2E0DA", borderRadius: "12px", padding: "28px" }}>

        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>From {requiredStar}</label>
          <input
            type="email"
            value={fromEmail}
            onChange={e => setFromEmail(e.target.value)}
            placeholder="your@email.com"
            required
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>To {requiredStar}</label>
          <input
            type="text"
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="recipient@email.com, another@email.com"
            required
            style={inputStyle}
          />
          <div style={{ fontSize: "11px", color: "#7A7880", marginTop: "4px" }}>Separate multiple addresses with commas</div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>CC</label>
          <input
            type="text"
            value={cc}
            onChange={e => setCc(e.target.value)}
            placeholder="cc@email.com"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>Subject {requiredStar}</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Subject line"
            required
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={labelStyle}>Message</label>
          <textarea
            value={message}
            onChange={e => { if (e.target.value.length <= 1000) setMessage(e.target.value); }}
            rows={5}
            placeholder="Optional message to include in the email…"
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
          />
          <div style={{ fontSize: "11px", color: message.length > 900 ? "#E8242A" : "#aaa", marginTop: "4px", textAlign: "right" }}>
            {message.length}/1000
          </div>
        </div>

        {/* reCAPTCHA — only when a site key is configured */}
        {CAPTCHA_ENABLED && (
          <div style={{ marginBottom: "24px" }}>
            <ReCAPTCHA
              ref={recaptchaRef}
              sitekey={RECAPTCHA_SITE_KEY}
              onChange={(token) => setRecaptchaToken(token)}
              onExpired={() => setRecaptchaToken(null)}
            />
            {!recaptchaToken && (
              <p style={{ fontSize: "11px", color: "#7A7880", marginTop: "6px" }}>Please complete the verification above to send.</p>
            )}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            style={{ flex: 1, minWidth: "120px", padding: "11px 20px", border: "1.5px solid #E2E0DA", borderRadius: "8px", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "14px", fontFamily: "var(--font-jakarta)" }}
          >
            Preview Email
          </button>
          <button
            type="submit"
            disabled={sending || !canSend || !product.hasFlyer}
            style={{ flex: 2, minWidth: "140px", padding: "11px 20px", background: (sending || !canSend || !product.hasFlyer) ? "#aaa" : "#1A5CFF", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, cursor: (sending || !canSend || !product.hasFlyer) ? "not-allowed" : "pointer", fontSize: "14px", fontFamily: "var(--font-jakarta)" }}
          >
            {sending ? "Sending…" : "Send Email"}
          </button>
          {product.hasFlyer && product.flyerUrl && (
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/api/v1/products/${product.id}/download-flyer`}
              target="_blank"
              rel="noreferrer"
              style={{ flex: 1, minWidth: "120px", padding: "11px 20px", border: "1.5px solid #E2E0DA", borderRadius: "8px", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: "14px", fontFamily: "var(--font-jakarta)", textDecoration: "none", color: "#2A2830", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a1 1 0 001 1h16a1 1 0 001-1v-3" /></svg>
              Download PDF
            </a>
          )}
        </div>

        {!product.hasFlyer && (
          <p style={{ marginTop: "12px", fontSize: "12px", color: "#E8242A" }}>
            No flyer has been uploaded for this product. An admin must upload the PDF flyer before it can be emailed.
          </p>
        )}
      </form>

      {/* Preview modal */}
      {showPreview && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
          onClick={() => setShowPreview(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "640px", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 80px rgba(0,0,0,.3)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E0DA", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: "14px", color: "#2A2830" }}>Email Preview</span>
              <button onClick={() => setShowPreview(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#7A7880", fontSize: "20px", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: "20px" }}>
              <div style={{ marginBottom: "12px", fontSize: "12px", color: "#7A7880" }}>
                <strong>To:</strong> {to || "(no recipients)"}&nbsp;&nbsp;
                {cc && <><strong>CC:</strong> {cc}</>}
              </div>
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
