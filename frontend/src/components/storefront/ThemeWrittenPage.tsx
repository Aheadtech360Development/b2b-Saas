"use client";

/**
 * A page of the shop that is words, not products: contact, get a quote, and
 * the policies the footer links to.
 *
 * The design has no page for these. Rather than bolt on a second look, they
 * are drawn with the theme's own classes — `section`, `.wrap`, `.section-head`,
 * `.btn-primary` — which the layout has already loaded for the header and
 * footer. So they inherit the shop's type, spacing and colours without
 * anything being restyled here.
 */
import { useState } from "react";
import { apiClient } from "@/lib/api-client";

export interface WrittenPage {
  slug: string;
  title: string;
  intro: string;
  /** "contact" or "quote" when this page carries a form; "" when it is prose. */
  form: string;
  sections: { heading: string; body: string }[];
}

export default function ThemeWrittenPage({ page }: { page: WrittenPage }) {
  return (
    <>
      <section style={{ paddingBottom: page.sections.length || page.form ? undefined : 0 }}>
        <div className="wrap" style={{ maxWidth: "780px" }}>
          <h1 style={{ marginBottom: page.intro ? "14px" : 0 }}>{page.title}</h1>
          {page.intro && <p style={{ fontSize: "17px", lineHeight: 1.7 }}>{page.intro}</p>}
        </div>
      </section>

      {page.form && (
        <section style={{ paddingTop: 0 }}>
          <div className="wrap" style={{ maxWidth: "780px" }}>
            <EnquiryForm page={page} />
          </div>
        </section>
      )}

      {page.sections.length > 0 && (
        <section style={{ paddingTop: page.form ? undefined : 0 }}>
          <div className="wrap" style={{ maxWidth: "780px" }}>
            {page.sections.map((s, i) => (
              <div key={i} style={{ marginBottom: "30px" }}>
                {s.heading && <h2 style={{ fontSize: "21px", marginBottom: "10px" }}>{s.heading}</h2>}
                {s.body.split(/\n{2,}/).map((para, j) => (
                  <p key={j} style={{ marginBottom: "12px", lineHeight: 1.75 }}>{para}</p>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ── The form ───────────────────────────────────────────────────────────────

const FIELD: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: "15px",
  border: "1px solid var(--line, #E2E2DE)", borderRadius: "8px", background: "#fff",
  fontFamily: "inherit", color: "inherit",
};

const LABEL: React.CSSProperties = { display: "block", fontSize: "13.5px", fontWeight: 700, marginBottom: "6px" };

/** What each form asks. A quote needs to know what is being quoted; a
 *  contact message does not. */
function fieldsFor(form: string) {
  const common = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "tel", required: false },
    { name: "company", label: "Business name", type: "text", required: false },
  ];
  if (form !== "quote") return common;
  return [
    ...common,
    { name: "product", label: "What do you need printed?", type: "text", required: true },
    { name: "quantity", label: "How many?", type: "text", required: false },
    { name: "deadline", label: "When do you need it?", type: "text", required: false },
  ];
}

function EnquiryForm({ page }: { page: WrittenPage }) {
  const fields = fieldsFor(page.form);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setBusy(true);
    setError(null);
    try {
      await apiClient.post("/api/v1/storefront/contact", {
        page_slug: page.slug,
        form_name: page.form === "quote" ? "Quote request" : "Contact form",
        data,
      }, { skipAuth: true });
      setSent(true);
      form.reset();
    } catch {
      setError("That did not send. Please try again, or email us directly.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="callout" role="status">
        <strong>Thanks — that is with us.</strong>
        <br />
        We will come back to you at the email you gave.
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate={false}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        {fields.map((f) => (
          <div key={f.name}>
            <label style={LABEL} htmlFor={`f-${f.name}`}>
              {f.label}{f.required ? "" : <span style={{ fontWeight: 400, opacity: 0.6 }}> (optional)</span>}
            </label>
            <input id={`f-${f.name}`} name={f.name} type={f.type} required={f.required} style={FIELD} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: "16px" }}>
        <label style={LABEL} htmlFor="f-message">
          {page.form === "quote" ? "Anything else we should know" : "Message"}
        </label>
        <textarea id="f-message" name="message" rows={6} required={page.form !== "quote"} style={{ ...FIELD, resize: "vertical" }} />
      </div>
      {error && <p style={{ color: "#B42318", fontSize: "14px", marginTop: "12px" }}>{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy} style={{ marginTop: "18px", border: 0, cursor: busy ? "wait" : "pointer" }}>
        {busy ? "Sending…" : page.form === "quote" ? "Request a quote" : "Send message"}
      </button>
    </form>
  );
}
