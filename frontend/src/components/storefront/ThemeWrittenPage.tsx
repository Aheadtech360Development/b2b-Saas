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

export default function ThemeWrittenPage({ page, builder }: {
  page: WrittenPage;
  /** A shop on the visual builder: no imported theme's classes are loaded
   *  there, so the page is drawn in the builder's own — its type, colours,
   *  spacing and form — inside the builder's header and footer. */
  builder?: boolean;
}) {
  if (builder) return <BuilderWrittenPage page={page} />;
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

/** The same page in the builder's classes (baseCss.ts), so it reads as one of
 *  the shop's own pages rather than a page from somewhere else. */
function BuilderWrittenPage({ page }: { page: WrittenPage }) {
  return (
    <div className="bsite" data-route="page">
      <section className="b-section" style={{ paddingBlock: "56px 72px" }}>
        <div className="b-in b-in-contained">
          <div style={{ maxWidth: "780px" }}>
            <h1 className="b-heading">{page.title}</h1>
            {page.intro && (
              <p className="b-text" style={{ marginTop: "14px", fontSize: "17px", lineHeight: 1.7, color: "var(--b-muted,#5B6170)" }}>
                {page.intro}
              </p>
            )}
            {page.form && (
              <div className="b-form" style={{ marginTop: "32px" }}>
                <EnquiryForm page={page} builder />
              </div>
            )}
            {page.sections.length > 0 && (
              <div style={{ marginTop: "36px", display: "flex", flexDirection: "column", gap: "30px" }}>
                {page.sections.map((s, i) => (
                  <div key={i}>
                    {s.heading && <h2 className="b-heading" style={{ fontSize: "22px", lineHeight: 1.3, marginBottom: "10px" }}>{s.heading}</h2>}
                    {s.body.split(/\n{2,}/).map((para, j) => (
                      <p key={j} className="b-text" style={{ marginBottom: "12px", lineHeight: 1.75 }}>{para}</p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
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
  // `half`: sits beside another on a wide screen, in the builder's form.
  const common = [
    { name: "name", label: "Your name", type: "text", required: true, half: true },
    { name: "email", label: "Email", type: "email", required: true, half: true },
    { name: "phone", label: "Phone", type: "tel", required: false, half: true },
    { name: "company", label: "Business name", type: "text", required: false, half: true },
  ];
  if (form !== "quote") return common;
  return [
    ...common,
    { name: "product", label: "What do you need printed?", type: "text", required: true, half: false },
    { name: "quantity", label: "How many?", type: "text", required: false, half: true },
    { name: "deadline", label: "When do you need it?", type: "text", required: false, half: true },
  ];
}

function EnquiryForm({ page, builder }: { page: WrittenPage; builder?: boolean }) {
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

  if (sent && builder) {
    return (
      <div className="b-form-done" role="status">
        <p>Thanks — that is with us.</p>
        We will come back to you at the email you gave.
      </div>
    );
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

  const label = page.form === "quote" ? "Request a quote" : "Send message";
  if (builder) {
    return (
      <form onSubmit={submit}>
        <div className="b-form-grid">
          {fields.map((f) => (
            <div key={f.name} className="b-form-field" data-w={f.half ? "half" : undefined}>
              <label className="b-form-label" htmlFor={`f-${f.name}`}>
                {f.label}{f.required ? <span className="b-form-req" aria-hidden="true">*</span> : <span className="b-form-opt"> (optional)</span>}
              </label>
              <input id={`f-${f.name}`} name={f.name} type={f.type} required={f.required} className="b-form-in" />
            </div>
          ))}
          <div className="b-form-field">
            <label className="b-form-label" htmlFor="f-message">
              {page.form === "quote" ? "Anything else we should know" : "Message"}
              {page.form === "quote" ? <span className="b-form-opt"> (optional)</span> : <span className="b-form-req" aria-hidden="true">*</span>}
            </label>
            <textarea id="f-message" name="message" rows={6} required={page.form !== "quote"} className="b-form-in" />
          </div>
        </div>
        {error && <p className="b-form-err" role="alert">{error}</p>}
        <div className="b-form-actions">
          <button type="submit" className="b-form-btn" disabled={busy}>{busy ? "Sending…" : label}</button>
        </div>
      </form>
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
        {busy ? "Sending…" : label}
      </button>
    </form>
  );
}
