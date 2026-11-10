"use client";

import { Check, Droplet, Info, Move, Plus, Repeat2, Scissors, Clipboard, X } from "lucide-react";
import { useMemo, useState } from "react";
import { luminance } from "@/lib/designer/mockups";
import type { Garment } from "@/lib/designer/types";
import { useAuthStore } from "@/stores/auth.store";
import { useDesigner } from "@/stores/designer.store";
import { useGarmentUrl } from "../context";
import s from "../designer.module.css";
import { Section, StartWith, Swatches } from "../ui";

function Thumb({ g, hex, className }: { g: Garment; hex?: string; className?: string }) {
  const url = useGarmentUrl(g.silhouette, "front", hex ?? g.colors[0]?.hex ?? "#FFFFFF");
  return url ? <img className={className} src={url} alt="" /> : <span className={`${className ?? ""} ${s.shimmer}`} style={{ display: "block", width: 52, height: 52 }} />;
}

function CatalogList({ garments, onPick }: { garments: Garment[]; onPick: (id: string) => void }) {
  return (
    <div>
      {garments.map((g) => (
        <button key={g.id} type="button" className={s.catalogItem} onClick={() => onPick(g.id)}>
          <Thumb g={g} />
          <span className={s.grow}>
            <strong style={{ display: "block" }}>{g.name}</strong>
            <span className={s.productCode}>
              {g.styleCode} · {g.colors.length} colours · from ${g.basePrice.toFixed(2)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function ProductPanel() {
  const catalog = useDesigner((st) => st.catalog);
  const rates = useDesigner((st) => st.rates);
  const doc = useDesigner((st) => st.doc);
  const active = useDesigner((st) => st.active);
  const { setActive, toggleColor, changeProduct, addProduct, removeProduct, setMethod } = useDesigner.getState();
  const [details, setDetails] = useState<number | null>(null);
  const [changing, setChanging] = useState<number | null>(null);
  const [colours, setColours] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [copy, setCopy] = useState(true);
  // The shop's own people are told how to offer more products; a customer
  // is not shown a Change product with nothing to change to.
  const isAdmin = useAuthStore((st) => !!st.user?.is_admin);

  const garments = useMemo(() => Object.fromEntries(catalog.map((g) => [g.id, g])), [catalog]);
  if (!doc) return null;
  const embroideryOk = doc.products.every((p) => garments[p.garmentId]?.embroidery);

  return (
    <>
      <Section label={`Products (${doc.products.length})`}>
        {doc.products.map((p, i) => {
          const g = garments[p.garmentId];
          if (!g) return null;
          const on = active.product === i;
          const activeHex = g.colors.find((c) => c.id === (on ? active.colorId : p.colorIds[0]))?.hex;
          const others = catalog.filter((x) => x.id !== g.id);
          return (
            <div key={`${p.garmentId}-${i}`} className={`${s.productCard} ${on ? s.productCardOn : ""}`}>
              <div className={s.productTop}>
                <button type="button" className={s.btnGhost} style={{ padding: 0, border: 0, background: "none", cursor: "pointer" }}
                  onClick={() => setActive(i, p.colorIds[0] ?? "")} aria-label={`Show ${g.name} on the stage`}>
                  <Thumb g={g} hex={activeHex} className={s.productThumb} />
                </button>
                <div className={s.grow}>
                  <div className={s.row} style={{ alignItems: "flex-start" }}>
                    <p className={`${s.productName} ${s.grow}`}>
                      {g.name} <span className={s.productCode}>{g.styleCode}</span>
                    </p>
                    {doc.products.length > 1 && (
                      <button type="button" className={s.iconBtn} style={{ width: 28, height: 28 }}
                        aria-label={`Remove ${g.name}`} data-tip="Remove product" onClick={() => removeProduct(i)}>
                        <X size={15} />
                      </button>
                    )}
                  </div>
                  <div className={s.row} style={{ gap: 14, marginTop: 4 }}>
                    <button type="button" className={s.linkBtn} aria-expanded={details === i}
                      onClick={() => setDetails(details === i ? null : i)}>
                      <Info size={14} /> Details
                    </button>
                    {(others.length > 0 || isAdmin) && (
                      <button type="button" className={s.linkBtn} aria-expanded={changing === i}
                        onClick={() => setChanging(changing === i ? null : i)}>
                        <Repeat2 size={14} /> Change product
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {details === i && (
                <div className={s.details}>
                  <p>{g.description}</p>
                  <p>{g.fabric}</p>
                  <p>Sizes {g.sizes[0]} to {g.sizes[g.sizes.length - 1]}. Blank from ${g.basePrice.toFixed(2)}.</p>
                </div>
              )}

              {changing === i && (
                <div style={{ marginTop: 10 }}>
                  {others.length > 0 ? (
                    <CatalogList
                      garments={others}
                      onPick={(id) => { changeProduct(i, id); setChanging(null); }}
                    />
                  ) : (
                    <p className={s.hint} role="status" data-only-product>
                      {g.name} is the only product in the designer. To offer more, add them in Products → T-shirt designer → Add products, and they show here.
                    </p>
                  )}
                </div>
              )}

              <div className={s.row} style={{ marginTop: 12, flexWrap: "wrap" }}>
                <div className={s.swatches}>
                  {p.colorIds.map((cid) => {
                    const c = g.colors.find((x) => x.id === cid);
                    if (!c) return null;
                    const sel = on && active.colorId === cid;
                    return (
                      <button key={cid} type="button" title={`${c.name}. Show on the stage`} aria-label={`Show ${c.name}`}
                        aria-pressed={sel}
                        className={`${s.swatch} ${sel ? s.swatchOn : ""}`} style={{ background: c.hex }}
                        onClick={() => setActive(i, cid)} />
                    );
                  })}
                </div>
                <button type="button" className={`${s.btn}`} style={{ minHeight: 32, padding: "0 10px", marginLeft: "auto", fontSize: 13 }}
                  aria-expanded={colours === i} onClick={() => setColours(colours === i ? null : i)}>
                  {colours === i ? <Check size={14} /> : <Plus size={14} />} {colours === i ? "Close colours" : "Add colours"}
                </button>
              </div>

              {colours === i && (
                <div style={{ marginTop: 12 }}>
                  <StartWith copy={copy} onChange={setCopy} />
                  <p className={s.label}>
                    <span>Each colour is its own shirt, with its own design and sizes.</span>
                  </p>
                  <div className={s.swatches}>
                    {g.colors.map((c) => {
                      const picked = p.colorIds.includes(c.id);
                      return (
                        <button key={c.id} type="button" role="checkbox" aria-checked={picked} aria-label={c.name} title={c.name}
                          className={`${s.swatch} ${picked ? s.swatchOn : ""}`} style={{ background: c.hex }}
                          onClick={() => toggleColor(i, c.id, copy)}>
                          {picked && <span className={s.swatchTick}><Check size={14} strokeWidth={3} color={luminance(c.hex) > 0.4 ? "#15171C" : "#fff"} /></span>}
                        </button>
                      );
                    })}
                  </div>
                  <p className={s.hint}>{p.colorIds.length} selected: {p.colorIds.map((id) => g.colors.find((c) => c.id === id)?.name).join(", ")}</p>
                </div>
              )}
            </div>
          );
        })}

        <div style={{ marginTop: 10 }}>
          {adding ? (
            <>
              <StartWith copy={copy} onChange={setCopy} />
              <p className={s.label}><span>Another garment</span>
                <button type="button" className={s.linkBtn} onClick={() => setAdding(false)}>Cancel</button></p>
              <CatalogList
                garments={catalog.filter((g) => !doc.products.some((p) => p.garmentId === g.id))}
                onPick={(id) => { addProduct(id, copy); setAdding(false); }}
              />
            </>
          ) : (
            catalog.some((g) => !doc.products.some((p) => p.garmentId === g.id)) && (
              <button type="button" className={`${s.btn} ${s.btnBlock}`} onClick={() => setAdding(true)}>
                <Plus size={16} /> Add products
              </button>
            )
          )}
        </div>
      </Section>

      <Section label="Decoration">
        <div className={s.methods}>
          <button type="button" className={`${s.method} ${doc.method === "print" ? s.methodOn : ""}`}
            aria-pressed={doc.method === "print"} onClick={() => setMethod("print")}>
            <strong><Droplet size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Printing</strong>
            <span>No minimum</span>
          </button>
          <button type="button" className={`${s.method} ${doc.method === "embroidery" ? s.methodOn : ""}`}
            aria-pressed={doc.method === "embroidery"} disabled={!embroideryOk} onClick={() => setMethod("embroidery")}>
            <strong><Scissors size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Embroidery</strong>
            <span>{embroideryOk ? `From ${rates.embroideryMinimum} pieces` : "Not on this product"}</span>
          </button>
        </div>
      </Section>

      <Section label="Quick ways to add art">
        <ul className={s.tips}>
          <li><Move size={15} /> Drag and drop an image anywhere</li>
          <li><Clipboard size={15} /> Paste a copied image with <span className={s.kbd}>Ctrl</span>+<span className={s.kbd}>V</span></li>
        </ul>
      </Section>
    </>
  );
}
