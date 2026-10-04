"use client";

/**
 * The small interactive pieces of a builder page: tabs, an email signup, a
 * product's pictures, and a collection's sort. Each is server-rendered in its
 * first state, so the page reads correctly before any script has run.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { safeSrc } from "@/lib/builder/sanitize";

export function Tabs({ id, items }: { id: string; items: { title: string; body: string }[] }) {
  const [active, setActive] = useState(0);
  const list = items.filter((t) => t && (t.title || t.body));
  if (!list.length) return <div data-b={id} className="b-tabs" />;
  const current = Math.min(active, list.length - 1);
  return (
    <div data-b={id} className="b-tabs">
      <div className="b-tabs-list" role="tablist">
        {list.map((t, i) => (
          <button key={i} type="button" role="tab" className="b-tab" id={`${id}-t${i}`}
                  aria-selected={i === current} aria-controls={`${id}-p${i}`} tabIndex={i === current ? 0 : -1}
                  onClick={() => setActive(i)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight") setActive((current + 1) % list.length);
                    if (e.key === "ArrowLeft") setActive((current - 1 + list.length) % list.length);
                  }}>
            {t.title || `Tab ${i + 1}`}
          </button>
        ))}
      </div>
      <div className="b-tab-panel" role="tabpanel" id={`${id}-p${current}`} aria-labelledby={`${id}-t${current}`}>
        {list[current]?.body}
      </div>
    </div>
  );
}

export function Newsletter({ id, placeholder, button, success, edit }: {
  id: string; placeholder: string; button: string; success: string; edit?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (edit || !email.trim()) return;
    setState("sending");
    try {
      // The same signup the storefront's other newsletter boxes send: it lands
      // in the brand's form submissions, where the rest already are.
      await apiClient.post("/api/v1/storefront/contact", {
        page_slug: window.location.pathname.replace(/^\//, ""),
        form_name: "Newsletter",
        data: { Email: email.trim() },
      }, { skipAuth: true });
      setState("done");
      setEmail("");
    } catch {
      setState("error");
    }
  }

  return (
    <div data-b={id} className="b-news">
      {state === "done" ? (
        <p className="b-news-done" role="status">{success || "Thanks — you're on the list."}</p>
      ) : (
        <form onSubmit={submit}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                 placeholder={placeholder || "Your email"} aria-label={placeholder || "Your email"} autoComplete="email" />
          <button type="submit" className="b-btn b-btn-solid" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : (button || "Subscribe")}
          </button>
        </form>
      )}
      {state === "error" && <p className="b-news-err" role="alert">That did not go through. Please try again.</p>}
    </div>
  );
}

export function ProductGallery({ id, images, layout }: {
  id: string; images: { url: string; alt: string }[]; layout: string;
}) {
  const pics = images.filter((i) => safeSrc(i.url));
  const [index, setIndex] = useState(0);
  if (!pics.length) return <div data-b={id} className="b-pgallery"><div className="b-pgallery-main" /></div>;
  if (layout === "grid") {
    return (
      <div data-b={id} className="b-pgallery">
        <div className="b-pgallery-grid">
          {pics.map((p, i) => <img key={i} src={p.url} alt={p.alt} loading={i > 1 ? "lazy" : "eager"} />)}
        </div>
      </div>
    );
  }
  const main = pics[Math.min(index, pics.length - 1)]!;
  return (
    <div data-b={id} className="b-pgallery">
      <div className="b-pgallery-main"><img src={main.url} alt={main.alt} /></div>
      {layout !== "single" && pics.length > 1 && (
        <div className="b-pgallery-thumbs">
          {pics.map((p, i) => (
            <button key={i} type="button" className="b-pgallery-thumb" aria-current={i === index}
                    aria-label={`Show picture ${i + 1}`} onClick={() => setIndex(i)}>
              <img src={p.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SortSelect({ value, edit }: { value: string; edit?: boolean }) {
  const router = useRouter();
  return (
    <select value={value || ""} aria-label="Sort by" disabled={edit}
            onChange={(e) => {
              const next = new URLSearchParams(window.location.search);
              if (e.target.value) next.set("sort", e.target.value); else next.delete("sort");
              next.delete("page");
              const q = next.toString();
              router.push(q ? `?${q}` : window.location.pathname);
            }}>
      <option value="">Featured</option>
      <option value="name">Name, A to Z</option>
    </select>
  );
}
