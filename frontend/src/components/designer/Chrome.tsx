"use client";

/**
 * The studio's frame: the header, and the order bar along the bottom that
 * always shows what the order costs and the one thing to do next.
 *
 * PrintCoPilot's own brand (brand book 1.0). Note for whoever connects this to
 * the storefront: the brand book puts the buyer side in each shop's brand, and
 * this builder wears PrintCoPilot's by the owner's decision for now.
 */
import { ArrowRight, Bookmark, HelpCircle, Save, Send, ShoppingCart, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useBranding } from "@/components/providers/BrandingProvider";
import { money, type Quote } from "@/lib/designer/pricing";
import { VIEW_LABEL } from "@/lib/designer/types";
import { decoratedSides, shirtSides, useDesigner } from "@/stores/designer.store";
import { useActiveGarment, useQuote, useShirt } from "./context";
import s from "./designer.module.css";

export function Header() {
  const b = useBranding();
  const name = useDesigner((st) => st.doc?.name ?? "");
  const tab = useDesigner((st) => st.tab);
  const { rename, setTab } = useDesigner.getState();
  const help = b.support_phone ? `tel:${b.support_phone.replace(/[^+\d]/g, "")}` : b.support_email ? `mailto:${b.support_email}` : null;

  return (
    <header className={s.header}>
      <Link href="/" className={s.brand} aria-label="PrintCoPilot, back to the shop">
        <img src="/wordmark-horizontal_color_600w.png" alt="PrintCoPilot" width={150} height={26} />
      </Link>
      <span className={s.headerRule} aria-hidden />
      <label className={s.nameField}>
        <span className={s.srOnly}>Design name</span>
        <input className={s.nameInput} value={name} maxLength={60}
          onChange={(e) => rename(e.target.value)} onBlur={(e) => { if (!e.target.value.trim()) rename("Untitled design"); }} />
      </label>
      <span className={`${s.chipStatus} ${s.chipNeutral}`}>Saved in this browser</span>
      <nav className={s.headerEnd} aria-label="Account">
        <button type="button" className={`${s.btn} ${s.btnSecondary} ${tab === "saved" ? s.btnOn : ""}`} aria-pressed={tab === "saved"}
          onClick={() => setTab(tab === "saved" ? "garment" : "saved")}>
          <Bookmark size={16} /> <span className={s.hideNarrow}>My designs</span>
        </button>
        {help && (
          <a className={s.iconBtn} href={help} aria-label="Contact the shop for help" data-tip="Need help?">
            <HelpCircle size={19} />
          </a>
        )}
        <Link className={s.iconBtn} href="/cart" aria-label="Cart" data-tip="Cart"><ShoppingCart size={19} /></Link>
      </nav>
    </header>
  );
}

/** Every line of the price, for the order bar and the Review tab. */
export function PriceBreakdown({ quote }: { quote: Quote }) {
  const doc = useDesigner((st) => st.doc)!;
  const sides = decoratedSides(doc);
  return (
    <dl className={s.breakdown}>
      <div><dt>Pieces</dt><dd className={s.num}>{quote.totalQty}</dd></div>
      <div>
        <dt>{doc.method === "embroidery" ? "Embroidered" : "Printed"}</dt>
        <dd>{sides.length ? sides.map((v) => VIEW_LABEL[v]).join(", ") : "Nothing yet"}</dd>
      </div>
      <div><dt>Decoration per side</dt><dd className={s.num}>{money(quote.perSide)}</dd></div>
      {quote.personalization > 0 && <div><dt>Names and numbers</dt><dd className={s.num}>{money(quote.personalization)}</dd></div>}
      {quote.totalQty > 0 && <div><dt>Average per piece</dt><dd className={s.num}>{money(quote.average)}</dd></div>}
      <div className={s.breakdownTotal}><dt>Total</dt><dd className={s.num}>{money(quote.total)}</dd></div>
      <p className={s.hint}>Shipping and tax are added at checkout.</p>
    </dl>
  );
}

function BreakdownButton({ quote }: { quote: Quote }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className={s.breakdownWrap} ref={box}>
      <button type="button" className={s.barLink} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide breakdown" : "See breakdown"}
      </button>
      {open && <div className={s.breakdownPop} role="dialog" aria-label="Price breakdown"><PriceBreakdown quote={quote} /></div>}
    </div>
  );
}

export function OrderBar({ onSave, onFinish, saving }: { onSave: () => void; onFinish: () => void; saving: boolean }) {
  const doc = useDesigner((st) => st.doc);
  const tab = useDesigner((st) => st.tab);
  const { setTab } = useDesigner.getState();
  const { garment, colorName } = useActiveGarment();
  const { key } = useShirt();
  const quote = useQuote();
  if (!doc || !quote) return <footer className={s.orderBar} />;

  const sides = shirtSides(doc, key).length;
  // Nothing to price until some shirt has artwork.
  const noArt = decoratedSides(doc).length === 0;
  const noSizes = quote.totalQty === 0;
  // Anything else that stops the design (a size not on sale, embroidery below
  // its minimum, a shirt left bare): the server refuses the same.
  const blocked = noArt || noSizes ? undefined : quote.problems[0];

  // One next step, in the order an order is made.
  const next = noArt
    ? { label: "Add artwork", icon: <Upload size={17} />, run: () => setTab("artwork") }
    : noSizes
      ? { label: "Choose sizes", icon: <ArrowRight size={17} />, run: () => setTab("sizes") }
      : tab !== "review"
        ? { label: "Review order", icon: <ArrowRight size={17} />, run: () => setTab("review") }
        // The design goes to the shop, which answers with the order: not a cart yet.
        : { label: "Send to the shop", icon: <Send size={17} />, run: onFinish };

  return (
    <footer className={s.orderBar}>
      <div className={s.barItem}>
        <span className={s.barLabel}>{garment?.name}{colorName ? `, ${colorName}` : ""}</span>
        <span className={s.barValue}>
          {sides === 0 ? "No artwork yet" : `${sides} printed ${sides === 1 ? "side" : "sides"}`}
        </span>
      </div>
      <div className={s.barItem}>
        <span className={s.barLabel}>Pieces</span>
        <span className={`${s.barValue} ${s.num}`}>{quote.totalQty}</span>
      </div>
      <div className={s.barItem}>
        <span className={s.barLabel}>Each</span>
        <span className={`${s.barValue} ${s.num}`}>{noSizes || noArt ? "-" : money(quote.average)}</span>
      </div>
      <div className={`${s.barItem} ${s.barTotal}`}>
        <span className={s.barLabel}>Total</span>
        <span className={`${s.barBig} ${s.num}`}>{money(quote.total)}</span>
      </div>
      {quote.nextBreak && !noSizes && !noArt && (
        <span className={s.barHint}>
          {quote.nextBreak.qty - quote.totalQty} more pieces saves <span className={s.num}>{money(quote.nextBreak.savingPerPiece)}</span> each
        </span>
      )}
      {blocked && <span className={`${s.chipStatus} ${s.chipWarning}`}>{blocked}</span>}
      <div className={s.barEnd}>
        {!noArt && !noSizes && <BreakdownButton quote={quote} />}
        <button type="button" className={`${s.btn} ${s.btnOnDark}`} onClick={onSave} disabled={saving} aria-label="Save design">
          <Save size={17} /> <span className={s.hideNarrow}>{saving ? "Saving" : "Save"}</span>
        </button>
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={() => next.run()}
          disabled={next.run === onFinish && !!blocked}>
          {next.icon} {next.label}
        </button>
      </div>
    </footer>
  );
}
