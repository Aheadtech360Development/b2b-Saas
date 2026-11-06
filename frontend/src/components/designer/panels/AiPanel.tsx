"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { AI_STYLES, presetDesigner, type AiStyle, type AiVariation } from "@/lib/designer/ai";
import { focusOf, PRINT_AREAS } from "@/lib/designer/mockups";
import { VIEW_LABEL } from "@/lib/designer/types";
import { activeKey, designOf, useDesigner } from "@/stores/designer.store";
import { buildSpecs } from "../controller";
import { CUSTOM_PROPS } from "../fabricSetup";
import { renderView } from "../render";
import { useActiveGarment, useCtrl, useNotice } from "../context";
import s from "../designer.module.css";
import { Section } from "../ui";

const IDEAS = ["Wildcats Basketball 2026", "Smith Family Reunion", "Summit Trail Run", "Fire Station 12"];

export function AiPanel() {
  const ctrl = useCtrl();
  const view = useDesigner((st) => st.view);
  const hasArt = useDesigner((st) => (st.doc ? designOf(st.doc, activeKey(st.doc, st.active))[st.view].length : 0) > 0);
  const { garment, hex } = useActiveGarment();
  const show = useNotice((st) => st.show);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<AiStyle>("Varsity");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<(AiVariation & { thumb: string })[]>([]);

  async function generate() {
    if (!garment || !prompt.trim()) return;
    setBusy(true);
    setResults([]);
    try {
      const area = PRINT_AREAS[garment.silhouette][view];
      const spot = focusOf(area);
      const variations = await presetDesigner.generate({ prompt, style, garmentHex: hex, areaWidthIn: spot.widthIn });
      const rendered = await Promise.all(variations.map(async (v) => {
        const objects = (await buildSpecs(v.objects, { xIn: spot.xIn, yIn: spot.topIn })).map((o) => o.toObject(CUSTOM_PROPS) as Record<string, unknown>);
        const thumb = await renderView({ silhouette: garment.silhouette, view, hex, objects, size: 360, closeUp: true });
        return { ...v, thumb };
      }));
      setResults(rendered);
    } catch {
      show("Those designs couldn't be made. Try again in a moment.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Section label="Describe your design">
        <form onSubmit={(e) => { e.preventDefault(); void generate(); }}>
          <textarea className={s.textarea} value={prompt} maxLength={160} aria-label="Describe your design"
            placeholder="e.g. Wildcats basketball 2026 with a ball"
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void generate(); } }} />
          <div className={s.chips} style={{ marginTop: 8 }}>
            {IDEAS.map((i) => (
              <button key={i} type="button" className={s.chip} onClick={() => setPrompt(i)}>{i}</button>
            ))}
          </div>
          <p className={s.label} style={{ marginTop: 16 }}><span>Style</span></p>
          <div className={s.chips} role="radiogroup" aria-label="Style">
            {AI_STYLES.map((st) => (
              <button key={st} type="button" role="radio" aria-checked={style === st}
                className={`${s.chip} ${style === st ? s.chipOn : ""}`} onClick={() => setStyle(st)}>{st}</button>
            ))}
          </div>
          <button type="submit" className={`${s.btn} ${s.btnPrimary} ${s.btnBlock}`} style={{ marginTop: 16 }}
            disabled={busy || !prompt.trim()}>
            <Sparkles size={16} /> {busy ? "Creating designs…" : "Create designs"}
          </button>
        </form>
      </Section>

      {(busy || results.length > 0) && (
        <Section label={`For the ${VIEW_LABEL[view].toLowerCase()}`}>
          <div className={s.variants}>
            {busy
              ? [0, 1, 2, 3].map((i) => <div key={i} className={s.shimmer} />)
              : results.map((r) => (
                <button key={r.id} type="button" className={s.variant} aria-label={`Use the ${r.label} design`}
                  onClick={async () => {
                    await ctrl?.addSpecs(r.objects, true);
                    show(hasArt ? "Design applied. Undo brings back what was there." : "Design applied. Click anything to edit it.");
                  }}>
                  <img src={r.thumb} alt="" />
                  <span>{r.label}</span>
                </button>
              ))}
          </div>
          {!busy && <p className={s.hint}>Pick one to put it on the shirt. Every word, colour and graphic stays editable.</p>}
        </Section>
      )}
    </>
  );
}
