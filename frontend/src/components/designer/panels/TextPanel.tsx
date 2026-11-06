"use client";

import { Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { INK_SWATCHES, inkFor } from "@/lib/designer/colors";
import { DESIGN_FONTS, installFontSheet } from "@/lib/designer/fonts";
import { useDesigner } from "@/stores/designer.store";
import { useActiveGarment, useCtrl } from "../context";
import s from "../designer.module.css";
import { Section, Slider, Swatches, ArrangeSection } from "../ui";

export function TextPanel() {
  const ctrl = useCtrl();
  const sel = useDesigner((st) => st.selection);
  const { hex } = useActiveGarment();
  const text = sel?.kind === "text" ? sel : null;

  // Fonts show in their own face in the picker.
  useEffect(() => { installFontSheet(); }, []);

  // Typing updates the canvas at once; history records it once the buyer pauses.
  const [draft, setDraft] = useState(text?.text ?? "");
  const [curve, setCurve] = useState(text?.curve ?? 0);
  const [spacing, setSpacing] = useState(text?.charSpacing ?? 0);
  const [outline, setOutline] = useState(text?.strokeWidth ?? 0);
  const typing = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = text?.id;
  useEffect(() => {
    setDraft(text?.text ?? "");
    setCurve(text?.curve ?? 0);
    setSpacing(text?.charSpacing ?? 0);
    setOutline(text?.strokeWidth ?? 0);
    // Only when a different object is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!text) {
    return (
      <>
        <Section>
          <button type="button" className={`${s.btn} ${s.btnPrimary} ${s.btnBlock} ${s.btnLarge}`}
            onClick={() => void ctrl?.addText("Your text here", inkFor(hex))}>
            <Type size={18} /> Add text
          </button>
          <p className={s.hint}>Then type on the shirt, or edit it here. Double-click text on the shirt to type in place.</p>
        </Section>
        <Section label="Start from a style">
          <div style={{ display: "grid", gap: 8 }}>
            {[
              { label: "Big headline", font: "Anton", text: "HEADLINE" },
              { label: "Team name", font: "Graduate", text: "TEAM NAME" },
              { label: "Signature script", font: "Pacifico", text: "Script" },
            ].map((p) => (
              <button key={p.label} type="button" className={`${s.btn} ${s.btnBlock}`}
                style={{ justifyContent: "space-between", fontFamily: `"${p.font}"`, fontSize: 18, fontWeight: 400 }}
                onClick={async () => {
                  await ctrl?.addText(p.text, inkFor(hex));
                  await ctrl?.updateText({ fontFamily: p.font });
                }}>
                {p.text}
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#8a909b" }}>{p.label}</span>
              </button>
            ))}
          </div>
        </Section>
      </>
    );
  }

  const isNn = !!text.nn;

  return (
    <>
      {!isNn ? (
        <Section label="Text">
          <textarea
            className={s.textarea}
            value={draft}
            rows={2}
            aria-label="Text"
            onChange={(e) => {
              setDraft(e.target.value);
              clearTimeout(typing.current);
              const v = e.target.value;
              typing.current = setTimeout(() => void ctrl?.updateText({ text: v || " " }), 250);
            }}
          />
        </Section>
      ) : (
        <Section>
          <p className={s.hint} style={{ margin: 0 }}>
            This is the {text.nn} placeholder. Each shirt gets its own {text.nn} from the roster in Names &amp; Numbers.
          </p>
        </Section>
      )}

      <Section label="Font">
        <div className={s.fontGrid} role="listbox" aria-label="Font">
          {DESIGN_FONTS.map((f) => (
            <button
              key={f.family}
              type="button"
              role="option"
              aria-selected={text.fontFamily === f.family}
              className={`${s.fontBtn} ${text.fontFamily === f.family ? s.fontOn : ""}`}
              style={{ fontFamily: `"${f.family}"`, fontWeight: f.weight }}
              title={`${f.family} · ${f.kind}`}
              onClick={() => void ctrl?.updateText({ fontFamily: f.family })}
            >
              {f.family}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Colour">
        <Swatches colors={INK_SWATCHES} value={text.fill} onPick={(c) => void ctrl?.updateText({ fill: c })} />
      </Section>

      <Slider label="Outline" value={outline} min={0} max={30} format={(n) => (n ? `${(n / 100).toFixed(2)} in` : "None")}
        onChange={(n) => { setOutline(n); void ctrl?.updateText({ strokeWidth: n, stroke: text.stroke || (text.fill === "#FFFFFF" ? "#16181D" : "#FFFFFF") }); }} />
      {outline > 0 && (
        <Section label="Outline colour">
          <Swatches colors={INK_SWATCHES} value={text.stroke} onPick={(c) => void ctrl?.updateText({ stroke: c })} />
        </Section>
      )}

      {!isNn && (
        <Slider label="Curve" value={curve} min={-100} max={100}
          format={(n) => (n === 0 ? "Straight" : n > 0 ? `Arch ${n}` : `Smile ${-n}`)}
          onChange={(n) => { setCurve(n); ctrl?.setCurve(n); }} />
      )}

      <Slider label="Letter spacing" value={spacing} min={-50} max={800} step={10}
        onChange={(n) => { setSpacing(n); void ctrl?.updateText({ charSpacing: n }); }} />

      <ArrangeSection sel={text} ctrl={ctrl} />
    </>
  );
}
