"use client";

/**
 * The words on the shop's written pages.
 *
 * Contact, Get a quote, and the four policies the footer links to. The design
 * has no page for any of them, so the brand writes them here and the
 * storefront draws them in the theme's own stylesheet.
 *
 * What exists is fixed — six pages, and which of them carry a form — because
 * the footer and the link picker point at them by name. The brand owns every
 * word, the heading of each part, and the order they are in.
 */
import { useEffect, useState } from "react";
import { themesService, type WrittenPage } from "@/services/themes.service";

const ORDER = ["contact", "quote", "shipping", "returns", "privacy", "terms"] as const;

const card: React.CSSProperties = {
  border: "1px solid #E3E3E3", borderRadius: "10px", padding: "10px 12px",
  marginBottom: "12px", background: "#FCFCFB",
};
const heading: React.CSSProperties = {
  fontSize: "12px", fontWeight: 700, color: "#7A7880", textTransform: "uppercase",
  letterSpacing: ".06em", marginBottom: "8px",
};
const label: React.CSSProperties = { display: "block", fontSize: "12px", fontWeight: 600, color: "#55535B", marginBottom: "4px" };
const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: "13px",
  border: "1px solid #DDD", borderRadius: "7px", fontFamily: "inherit",
};
const rowBtn: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", padding: "8px 10px", fontSize: "13px",
  background: "#fff", border: "1px solid #E3E3E3", borderRadius: "7px", cursor: "pointer",
  marginBottom: "6px", fontFamily: "inherit",
};

export default function ThemePagesEditor({ writable }: { writable: boolean }) {
  const [pages, setPages] = useState<Record<string, WrittenPage> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    themesService.pages().then((r) => setPages(r.pages)).catch(() => setPages({}));
  }, []);

  function patch(slug: string, change: Partial<WrittenPage>) {
    setPages((cur) => (cur ? { ...cur, [slug]: { ...cur[slug]!, ...change } } : cur));
    setDirty(true);
    setNote(null);
  }

  function patchSection(slug: string, index: number, change: Partial<{ heading: string; body: string }>) {
    setPages((cur) => {
      if (!cur) return cur;
      const page = cur[slug]!;
      const sections = page.sections.map((s, i) => (i === index ? { ...s, ...change } : s));
      return { ...cur, [slug]: { ...page, sections } };
    });
    setDirty(true);
    setNote(null);
  }

  function addSection(slug: string) {
    setPages((cur) => {
      if (!cur) return cur;
      const page = cur[slug]!;
      return { ...cur, [slug]: { ...page, sections: [...page.sections, { heading: "", body: "" }] } };
    });
    setDirty(true);
  }

  function removeSection(slug: string, index: number) {
    setPages((cur) => {
      if (!cur) return cur;
      const page = cur[slug]!;
      return { ...cur, [slug]: { ...page, sections: page.sections.filter((_, i) => i !== index) } };
    });
    setDirty(true);
  }

  async function save() {
    if (!pages) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await themesService.savePages(pages);
      setPages(r.pages);
      setDirty(false);
      setNote("Saved. These pages are live straight away.");
    } catch {
      setNote("Could not save those. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!pages) return null;

  return (
    <div style={card}>
      <div style={heading}>Pages</div>
      {ORDER.map((slug) => {
        const page = pages[slug];
        if (!page) return null;
        const isOpen = open === slug;
        return (
          <div key={slug}>
            <button style={{ ...rowBtn, fontWeight: isOpen ? 700 : 500 }} onClick={() => setOpen(isOpen ? null : slug)}>
              {page.title}
              {page.form && <span style={{ color: "#9A98A0", fontWeight: 400 }}> · form</span>}
            </button>
            {isOpen && (
              <div style={{ padding: "2px 2px 12px" }}>
                <label style={label}>Heading</label>
                <input disabled={!writable} style={input} value={page.title}
                  onChange={(e) => patch(slug, { title: e.target.value })} />

                <label style={{ ...label, marginTop: "8px" }}>Intro</label>
                <textarea disabled={!writable} style={{ ...input, minHeight: "64px", resize: "vertical" }}
                  value={page.intro} onChange={(e) => patch(slug, { intro: e.target.value })} />

                {page.sections.map((section, i) => (
                  <div key={i} style={{ marginTop: "10px", borderTop: "1px solid #EEE", paddingTop: "10px" }}>
                    <input disabled={!writable} style={{ ...input, fontWeight: 600 }} placeholder="Section heading"
                      value={section.heading} onChange={(e) => patchSection(slug, i, { heading: e.target.value })} />
                    <textarea disabled={!writable} style={{ ...input, minHeight: "92px", marginTop: "6px", resize: "vertical" }}
                      placeholder="What it says" value={section.body}
                      onChange={(e) => patchSection(slug, i, { body: e.target.value })} />
                    {writable && (
                      <button onClick={() => removeSection(slug, i)}
                        style={{ background: "none", border: "none", color: "#B91C1C", fontSize: "12px", cursor: "pointer", padding: "4px 0" }}>
                        Remove this part
                      </button>
                    )}
                  </div>
                ))}

                {writable && (
                  <button onClick={() => addSection(slug)}
                    style={{ ...rowBtn, marginTop: "8px", textAlign: "center", fontSize: "12.5px" }}>
                    + Add a part
                  </button>
                )}
                <p style={{ fontSize: "11.5px", color: "#9A98A0", marginTop: "6px" }}>
                  A blank line starts a new paragraph.
                </p>
              </div>
            )}
          </div>
        );
      })}

      {writable && (
        <button onClick={save} disabled={busy || !dirty}
          style={{ ...rowBtn, textAlign: "center", marginTop: "6px", fontWeight: 700,
                   background: dirty ? "#1A1A1A" : "#fff", color: dirty ? "#fff" : "#9A98A0",
                   cursor: busy || !dirty ? "default" : "pointer" }}>
          {busy ? "Saving…" : "Save pages"}
        </button>
      )}
      {note && <p style={{ fontSize: "11.5px", color: "#7A7880", marginTop: "4px" }}>{note}</p>}
    </div>
  );
}
