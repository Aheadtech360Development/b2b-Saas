"use client";

import { useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";

const inp: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  border: "1px solid #E2E2DE",
  fontSize: "14px",
  outline: "none",
  background: "#fff",
  fontFamily: "'DM Sans', sans-serif",
  boxSizing: "border-box" as const,
  transition: "border-color .15s",
};

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", business: "", email: "", phone: "", subject: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      await apiClient.post("/api/v1/contact", {
        name: form.name,
        company: form.business,
        email: form.email,
        phone: form.phone,
        department: form.subject,
        message: form.message,
      });
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div style={{ background: "#F8F8F6", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto", padding: "64px 24px" }}>
        <div className="contact-main-grid" style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: "56px", alignItems: "start" }}>

          {/* LEFT — FORM */}
          <div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "32px", fontWeight: 600, color: "#1A1A1A", marginBottom: "32px", lineHeight: 1.2 }}>Get in Touch</h2>

            {status === "sent" ? (
              <div style={{ padding: "40px 0", textAlign: "center" }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: "28px", color: "#1A1A1A", marginBottom: "12px" }}>Message Sent</div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "#6B6B6B", marginBottom: "24px" }}>We will respond within 4 business hours Mon–Fri.</p>
                <button
                  onClick={() => { setForm({ name: "", business: "", email: "", phone: "", subject: "", message: "" }); setStatus("idle"); }}
                  style={{ background: "var(--brand-primary, #1C3557)", color: "#fff", border: "none", padding: "11px 24px", fontSize: "14px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer" }}
                >
                  Send Another
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {/* Row 1: Name + Company */}
                <div className="contact-form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                  <div>
                    <label style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "#1A1A1A", marginBottom: "6px" }}>Full Name</label>
                    <input style={inp} value={form.name} onChange={e => set("name", e.target.value)} required placeholder="Your full name"
                      onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "var(--brand-primary, #1C3557)"; }}
                      onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "#E2E2DE"; }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "#1A1A1A", marginBottom: "6px" }}>Company Name</label>
                    <input style={inp} value={form.business} onChange={e => set("business", e.target.value)} required placeholder="Your company"
                      onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "var(--brand-primary, #1C3557)"; }}
                      onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "#E2E2DE"; }}
                    />
                  </div>
                </div>

                {/* Row 2: Email + Phone */}
                <div className="contact-form-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                  <div>
                    <label style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "#1A1A1A", marginBottom: "6px" }}>Email</label>
                    <input type="email" style={inp} value={form.email} onChange={e => set("email", e.target.value)} required placeholder="you@company.com"
                      onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "var(--brand-primary, #1C3557)"; }}
                      onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "#E2E2DE"; }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "#1A1A1A", marginBottom: "6px" }}>Phone</label>
                    <input type="tel" style={inp} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(555) 000-0000"
                      onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "var(--brand-primary, #1C3557)"; }}
                      onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = "#E2E2DE"; }}
                    />
                  </div>
                </div>

                {/* Subject */}
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "#1A1A1A", marginBottom: "6px" }}>Subject</label>
                  <select style={{ ...inp, cursor: "pointer" }} value={form.subject} onChange={e => set("subject", e.target.value)} required
                    onFocus={e => { (e.currentTarget as HTMLSelectElement).style.borderColor = "var(--brand-primary, #1C3557)"; }}
                    onBlur={e => { (e.currentTarget as HTMLSelectElement).style.borderColor = "#E2E2DE"; }}
                  >
                    <option value="">Select a subject</option>
                    <option value="general">General Inquiry</option>
                    <option value="order-support">Order Support</option>
                    <option value="wholesale">Wholesale Application</option>
                    <option value="private-label">Private Label</option>
                    <option value="press">Press</option>
                  </select>
                </div>

                {/* Message */}
                <div style={{ marginBottom: "24px" }}>
                  <label style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontSize: "12px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "#1A1A1A", marginBottom: "6px" }}>Message</label>
                  <textarea
                    rows={5}
                    style={{ ...inp, resize: "vertical", minHeight: "120px" }}
                    value={form.message}
                    onChange={e => set("message", e.target.value)}
                    required
                    placeholder="Tell us about your inquiry..."
                    onFocus={e => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = "var(--brand-primary, #1C3557)"; }}
                    onBlur={e => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = "#E2E2DE"; }}
                  />
                </div>

                {status === "error" && (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "#cc0000", marginBottom: "12px" }}>
                    Failed to send. Please try again or email us at info@afblanks.com.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === "sending"}
                  style={{ background: "var(--brand-primary, #1C3557)", color: "#fff", border: "none", padding: "12px 24px", fontSize: "14px", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", opacity: status === "sending" ? 0.7 : 1, width: "100%" }}
                >
                  {status === "sending" ? "Sending…" : "Send Message →"}
                </button>
              </form>
            )}
          </div>

          {/* RIGHT — CONTACT INFO */}
          <div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "28px", fontWeight: 600, color: "#1A1A1A", marginBottom: "28px", lineHeight: 1.2 }}>Contact Info</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginBottom: "28px" }}>
              {[
                { label: "Phone", value: "(214) 272-7213" },
                { label: "Email", value: "info@afblanks.com" },
                { label: "Hours", value: "Mon–Fri, 8AM–5PM CT" },
                { label: "Location", value: "Dallas, TX" },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B6B6B", marginBottom: "4px" }}>{item.label}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "15px", color: "#1A1A1A" }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Map */}
            <div style={{ height: "220px", border: "1px solid #E2E2DE", overflow: "hidden", marginBottom: "24px" }}>
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3349.8234567890!2d-96.65432109876543!3d32.94567890123456!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x864c1f1234567890%3A0xabcdef1234567890!2s10719+Turbeville+Rd%2C+Dallas%2C+TX+75243!5e0!3m2!1sen!2sus!4v1680000000000!5m2!1sen!2sus"
                width="100%"
                height="220"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="AF Apparels Location"
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Link href="/wholesale/register" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "var(--brand-primary, #1C3557)", textDecoration: "none", fontWeight: 500 }}>
                Apply for Wholesale Account →
              </Link>
              <Link href="/track-order" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", color: "var(--brand-primary, #1C3557)", textDecoration: "none", fontWeight: 500 }}>
                Track Your Order →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
