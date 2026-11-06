"use client";

/** The Sizes and Review tabs of the sheet. */
import { Download, Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DEMO_RATES, effectiveQuantities, money } from "@/lib/designer/pricing";
import { lineKey, VIEW_KEYS, VIEW_LABEL, type Garment, type SizeKey, type ViewKey } from "@/lib/designer/types";
import { designOf, shirtSides, useDesigner } from "@/stores/designer.store";
import { PriceBreakdown } from "./Chrome";
import { useQuote } from "./context";
import s from "./designer.module.css";
import { renderView } from "./render";
import { Section, StartWith } from "./ui";

interface Line {
  key: string;
  garment: Garment;
  colorId: string;
  colorName: string;
  hex: string;
}

function useLines(): Line[] {
  const products = useDesigner((st) => st.doc?.products);
  const catalog = useDesigner((st) => st.catalog);
  return useMemo(() => {
    if (!products) return [];
    return products.flatMap((p) => {
      const g = catalog.find((x) => x.id === p.garmentId);
      if (!g) return [];
      return p.colorIds.flatMap((c) => {
        const col = g.colors.find((x) => x.id === c);
        return col ? [{ key: lineKey(g.id, c), garment: g, colorId: c, colorName: col.name, hex: col.hex }] : [];
      });
    });
  }, [products, catalog]);
}

/** A size's quantity: type it, or step it with the buttons. */
function Stepper({ id, value, onChange, label }: { id: string; value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className={s.stepper}>
      <button type="button" className={s.stepBtn} aria-label={`One fewer ${label}`} disabled={value <= 0}
        onClick={() => onChange(value - 1)}>
        <Minus size={16} />
      </button>
      <input id={id} className={`${s.stepInput} ${s.num}`} type="number" inputMode="numeric" min={0} max={9999}
        value={value || ""} placeholder="0" aria-label={`${label} quantity`}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(Number(e.target.value))} />
      <button type="button" className={s.stepBtn} aria-label={`One more ${label}`} onClick={() => onChange(value + 1)}>
        <Plus size={16} />
      </button>
    </div>
  );
}

export function SizesTab() {
  const doc = useDesigner((st) => st.doc);
  const active = useDesigner((st) => st.active);
  const catalog = useDesigner((st) => st.catalog);
  const { setQty, setActive, toggleColor, setTab } = useDesigner.getState();
  const lines = useLines();
  const quote = useQuote();
  const [adding, setAdding] = useState(false);
  const [copy, setCopy] = useState(true);
  if (!doc || !quote) return null;
  const effective = effectiveQuantities(doc.quantities, doc.roster);
  // Only the colour on the stage; the others are one click away.
  const garmentId = doc.products[active.product]?.garmentId ?? "";
  const line = lines.find((l) => l.key === lineKey(garmentId, active.colorId)) ?? lines[0];
  if (!line) return null;
  // What "Add more" offers: this garment's other colours, and other garments.
  const productIndex = Math.max(0, doc.products.findIndex((p) => p.garmentId === line.garment.id));
  const picked = doc.products[productIndex]?.colorIds ?? [];
  const more = line.garment.colors.filter((c) => !picked.includes(c.id));
  const canAddGarment = catalog.some((g) => !doc.products.some((p) => p.garmentId === g.id));
  const count = (key: string) => Object.values(effective[key] ?? {}).reduce((n, q) => n + (q ?? 0), 0);
  const sides = shirtSides(doc, line.key).length;
  // What one piece of each size costs at the order's current quantity break.
  const each = (size: SizeKey) => line.garment.basePrice + (DEMO_RATES.sizeUpcharge[size] ?? 0) + sides * quote.perSide;
  const row = doc.quantities[line.key] ?? {};
  const eff = effective[line.key] ?? {};
  const pieces = count(line.key);
  const lineTotal = line.garment.sizes.reduce((sum, z) => sum + (eff[z] ?? 0) * each(z), 0);

  return (
    <>
      <Section>
        <h2 className={s.sheetTitle}>How many of each size?</h2>
        <p className={s.hint} style={{ marginTop: 4 }}>Every piece counts towards your quantity price, across all colours.</p>
      </Section>
      <Section label="Colour">
          <div className={s.chips} role="radiogroup" aria-label="Colour to size">
            {lines.map((l) => {
              const on = l.key === line.key;
              const n = count(l.key);
              return (
                <button key={l.key} type="button" role="radio" aria-checked={on}
                  className={`${s.chip} ${s.colorChip} ${on ? s.chipOn : ""}`}
                  onClick={() => setActive(doc.products.findIndex((p) => p.garmentId === l.garment.id), l.colorId)}>
                  <span className={s.chipDot} style={{ background: l.hex }} aria-hidden />
                  {doc.products.length > 1 ? `${l.garment.name}, ` : ""}{l.colorName}
                  {n > 0 && <span className={`${s.chipCount} ${s.num}`}>{n}</span>}
                </button>
              );
            })}
            {(more.length > 0 || canAddGarment) && (
              <button type="button" className={`${s.chip} ${s.colorChip} ${s.chipAdd}`} aria-expanded={adding}
                onClick={() => setAdding(!adding)}>
                {adding ? <X size={14} /> : <Plus size={14} />} {adding ? "Close" : "Add more"}
              </button>
            )}
          </div>
          {adding && (
            <div className={s.addMore}>
              <StartWith copy={copy} onChange={setCopy} />
              {more.length > 0 && (
                <>
                  <p className={s.label}><span>More colours of the {line.garment.name}</span></p>
                  <div className={s.swatches}>
                    {more.map((c) => (
                      <button key={c.id} type="button" className={s.swatch} style={{ background: c.hex }}
                        aria-label={`Add ${c.name}`} data-tip={c.name}
                        onClick={() => { toggleColor(productIndex, c.id, copy); setAdding(false); }} />
                    ))}
                  </div>
                </>
              )}
              {canAddGarment && (
                <button type="button" className={s.linkBtn} style={{ marginTop: more.length ? 12 : 0 }}
                  onClick={() => setTab("garment")}>
                  <Plus size={14} /> Add another garment
                </button>
              )}
            </div>
          )}
        </Section>
      <Section>
        <ul className={s.sizeList} aria-label={`Sizes for ${line.garment.name} in ${line.colorName}`}>
          {line.garment.sizes.map((z) => {
            const qty = eff[z] ?? 0;
            const fromRoster = qty > (row[z] ?? 0);
            const up = DEMO_RATES.sizeUpcharge[z];
            return (
              <li key={z} className={`${s.sizeRow} ${qty ? s.sizeRowOn : ""}`}>
                <label htmlFor={`q-${line.key}-${z}`} className={s.sizeName}>{z}</label>
                <span className={s.sizeMeta}>
                  <span className={s.num}>{money(each(z))}</span> each
                  {up ? <span className={s.sizeUp}>{` +${money(up)}`}</span> : null}
                  {fromRoster && <span className={s.sizeUp}> From roster</span>}
                </span>
                <Stepper id={`q-${line.key}-${z}`} label={z} value={qty} onChange={(n) => setQty(line.key, z, n)} />
              </li>
            );
          })}
        </ul>
        <div className={s.sizeTotal}>
          <span>{pieces} {pieces === 1 ? "piece" : "pieces"} in {line.colorName}</span>
          <span className={s.num}>{money(lineTotal)}</span>
        </div>
        {sides === 0 && <p className={s.hint}>Prices shown are for the blank garment. Add artwork to see the printed price.</p>}
      </Section>
      {quote.nextBreak && quote.totalQty > 0 && (
        <p className={s.callout}>
          Add {quote.nextBreak.qty - quote.totalQty} more to reach {quote.nextBreak.qty} and save{" "}
          <span className={s.num}>{money(quote.nextBreak.savingPerPiece)}</span> on every piece.
        </p>
      )}
    </>
  );
}

export function ReviewTab() {
  const doc = useDesigner((st) => st.doc);
  const catalog = useDesigner((st) => st.catalog);
  const setNotes = useDesigner((st) => st.setNotes);
  const lines = useLines();
  const quote = useQuote();
  // Open on the first colour actually being ordered.
  const [pick, setPick] = useState(() => {
    const q = useDesigner.getState().doc?.quantities ?? {};
    return Math.max(0, lines.findIndex((l) => Object.values(q[l.key] ?? {}).some((n) => (n ?? 0) > 0)));
  });
  const [shots, setShots] = useState<{ view: ViewKey; url: string }[]>([]);
  const line = lines[Math.min(pick, lines.length - 1)];
  const views = doc && line ? designOf(doc, line.key) : undefined;
  const row = doc?.roster[0];

  useEffect(() => {
    if (!views || !line) return;
    let live = true;
    const sides = VIEW_KEYS.filter((v) => views[v].length);
    void Promise.all((sides.length ? sides : (["front"] as ViewKey[])).map(async (v) => ({
      view: v,
      url: await renderView({ silhouette: line.garment.silhouette, view: v, hex: line.hex, objects: views[v], size: 480, roster: row }),
    }))).then((r) => { if (live) setShots(r); });
    return () => { live = false; };
  }, [views, line, row]);

  if (!doc || !quote || !line) return null;
  const names = Object.fromEntries(catalog.map((g) => [g.id, g]));

  return (
    <>
      <Section>
        <h2 className={s.sheetTitle}>Check your design</h2>
        <p className={s.hint} style={{ marginTop: 4 }}>This is what goes to print. Check spelling, colours and placement.</p>
        {quote.problems.map((p) => <p key={p} className={`${s.chipStatus} ${s.chipWarning}`} style={{ marginTop: 8 }}>{p}</p>)}
      </Section>
      {lines.length > 1 && (
        <Section label="Preview colour">
          <div className={s.chips} role="radiogroup" aria-label="Preview colour">
            {lines.map((l, i) => (
              <button key={l.key} type="button" role="radio" aria-checked={pick === i}
                className={`${s.chip} ${pick === i ? s.chipOn : ""}`} onClick={() => setPick(i)}>
                {l.garment.name}, {l.colorName}
              </button>
            ))}
          </div>
        </Section>
      )}
      <Section>
        <div className={s.previewGrid}>
          {shots.map((sh) => (
            <figure key={sh.view} className={s.previewTile}>
              <img src={sh.url} alt={`${line.garment.name} in ${line.colorName}, ${VIEW_LABEL[sh.view].toLowerCase()}`} />
              <figcaption>
                <span className={s.grow}>{VIEW_LABEL[sh.view]}</span>
                <a className={s.iconBtn} href={sh.url} download={`${doc.name}-${sh.view}.png`} aria-label={`Download the ${VIEW_LABEL[sh.view].toLowerCase()}`}>
                  <Download size={16} />
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>
      {quote.lines.length > 0 && (
        <Section label="Line items">
          <table className={s.table}>
            <thead>
              <tr><th>Item</th><th>Size</th><th className={s.r}>Qty</th><th className={s.r}>Each</th><th className={s.r}>Subtotal</th></tr>
            </thead>
            <tbody>
              {quote.lines.map((l) => {
                const g = names[l.garmentId];
                return (
                  <tr key={`${l.garmentId}-${l.colorId}-${l.size}`}>
                    <td>{g?.name}, {g?.colors.find((c) => c.id === l.colorId)?.name}</td>
                    <td>{l.size}</td>
                    <td className={`${s.r} ${s.num}`}>{l.qty}</td>
                    <td className={`${s.r} ${s.num}`}>{money(l.unit)}</td>
                    <td className={`${s.r} ${s.num}`}>{money(l.subtotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}
      <Section label="Price">
        <PriceBreakdown quote={quote} />
      </Section>
      <Section>
        <label className={s.label} htmlFor="review-notes"><span>Notes for the print team</span></label>
        <textarea id="review-notes" className={s.textarea} value={doc.notes} maxLength={600}
          placeholder="For example, a Pantone colour or a deadline"
          onChange={(e) => setNotes(e.target.value)} />
      </Section>
    </>
  );
}
