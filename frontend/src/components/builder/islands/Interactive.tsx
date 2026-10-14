"use client";

/**
 * The small interactive pieces of a builder page: tabs, an email signup, a
 * product's pictures, and a collection's sort. Each is server-rendered in its
 * first state, so the page reads correctly before any script has run.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { trackLead } from "@/lib/tracking";
import { safeSrc } from "@/lib/builder/sanitize";
import { COLOUR_CHOSEN, picturesOfColour, type ColourChosen } from "@/lib/colourPictures";

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
      trackLead("Newsletter");
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

const Chevron = ({ back }: { back?: boolean }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d={back ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ProductGallery({ id, productId, images, layout }: {
  id: string; productId?: string; images: { url: string; alt: string }[]; layout: string;
}) {
  const pics = images.filter((i) => safeSrc(i.url));
  const [index, setIndex] = useState(0);
  // The colour last picked in the buy box, when it has pictures of its own
  // (lib/colourPictures): those are shown, the first one large.
  const [colour, setColour] = useState("");
  const picsRef = useRef(pics);
  picsRef.current = pics;
  const colourRef = useRef("");
  const strip = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ start: true, end: true });

  useEffect(() => {
    if (!productId) return;
    const onChosen = (e: Event) => {
      const chosen = (e as CustomEvent<ColourChosen>).detail;
      if (!chosen || chosen.productId !== productId) return;
      const next = picturesOfColour(picsRef.current, chosen.colour).length ? chosen.colour : "";
      // A colour with no pictures of its own leaves the gallery as it is.
      if (next || colourRef.current) {
        setIndex(0);
        if (strip.current) strip.current.scrollLeft = 0;
      }
      colourRef.current = next;
      setColour(next);
    };
    window.addEventListener(COLOUR_CHOSEN, onChosen);
    return () => window.removeEventListener(COLOUR_CHOSEN, onChosen);
  }, [productId]);

  const ofColour = colour ? picturesOfColour(pics, colour) : [];
  const shown = ofColour.length ? ofColour : pics;

  // The thumbnails are one row. More than fit slide along it, with an arrow
  // at each end while there is more that way.
  const measure = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    setEnds({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  }, []);
  useEffect(() => {
    measure();
    const el = strip.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, [measure, shown.length]);
  const slide = (dir: number) => {
    const el = strip.current;
    if (!el) return;
    if (typeof el.scrollBy === "function") el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
    else el.scrollLeft += dir * el.clientWidth;
  };

  if (!pics.length) return <div data-b={id} className="b-pgallery"><div className="b-pgallery-main" /></div>;
  if (layout === "grid") {
    return (
      <div data-b={id} className="b-pgallery">
        <div className="b-pgallery-grid">
          {shown.map((p, i) => <img key={p.url + i} src={p.url} alt={p.alt} loading={i > 1 ? "lazy" : "eager"} />)}
        </div>
      </div>
    );
  }
  const main = shown[Math.min(index, shown.length - 1)]!;
  const sliding = !(ends.start && ends.end);
  return (
    <div data-b={id} className="b-pgallery">
      <div className="b-pgallery-main"><img src={main.url} alt={main.alt} /></div>
      {layout !== "single" && shown.length > 1 && (
        <div className="b-pgallery-strip">
          {sliding && (
            <button type="button" className="b-pgallery-nav" data-dir="prev" aria-label="Previous pictures"
                    disabled={ends.start} onClick={() => slide(-1)}><Chevron back /></button>
          )}
          <div className="b-pgallery-thumbs" ref={strip} onScroll={measure}>
            {shown.map((p, i) => (
              <button key={p.url + i} type="button" className="b-pgallery-thumb" aria-current={i === index}
                      aria-label={`Show picture ${i + 1}`} onClick={() => setIndex(i)}>
                <img src={p.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          {sliding && (
            <button type="button" className="b-pgallery-nav" data-dir="next" aria-label="More pictures"
                    disabled={ends.end} onClick={() => slide(1)}><Chevron /></button>
          )}
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
