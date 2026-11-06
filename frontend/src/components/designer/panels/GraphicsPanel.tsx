"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { INK_SWATCHES, inkFor } from "@/lib/designer/colors";
import { GRAPHICS } from "@/lib/designer/graphics";
import { svgDataUrl } from "@/lib/designer/mockups";
import { useDesigner } from "@/stores/designer.store";
import { useActiveGarment, useCtrl } from "../context";
import s from "../designer.module.css";
import { Section, Segment, Swatches, ArrangeSection } from "../ui";

type Group = "All" | "Shapes" | "Sports" | "Icons";

export function GraphicsPanel() {
  const ctrl = useCtrl();
  const sel = useDesigner((st) => st.selection);
  const { hex } = useActiveGarment();
  const [group, setGroup] = useState<Group>("All");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GRAPHICS.filter((g) => (group === "All" || g.group === group) && (!q || g.name.toLowerCase().includes(q)));
  }, [group, query]);

  const graphic = sel?.kind === "graphic" ? sel : null;

  return (
    <>
      {graphic && (
        <>
          <Section label="Graphic colour">
            <Swatches colors={INK_SWATCHES} value={graphic.fill} onPick={(c) => ctrl?.recolorGraphic(c)} />
          </Section>
          <ArrangeSection sel={graphic} ctrl={ctrl} />
        </>
      )}
      <Section label={graphic ? "Add another" : undefined}>
        <label className={s.label} htmlFor="graphic-search"><span>Search graphics</span></label>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <Search size={16} aria-hidden style={{ position: "absolute", left: 12, top: 12, color: "var(--faint)" }} />
          <input id="graphic-search" className={s.input} type="search" placeholder="e.g. star" style={{ paddingLeft: 36 }}
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Segment<Group> label="Graphic group" value={group} onChange={setGroup}
          options={[{ value: "All", label: "All" }, { value: "Shapes", label: "Shapes" }, { value: "Sports", label: "Sports" }, { value: "Icons", label: "Icons" }]} />
      </Section>
      <Section>
        {shown.length ? (
          <div className={s.tiles}>
            {shown.map((g) => (
              <button key={g.id} type="button" className={s.tile} title={`Add ${g.name}`} aria-label={`Add ${g.name}`}
                onClick={() => void ctrl?.addGraphic(g.id, inkFor(hex))}>
                <img src={svgDataUrl(g.svg)} alt="" />
              </button>
            ))}
          </div>
        ) : (
          <div className={s.empty}>
            <strong>No graphics match “{query}”</strong>
            Try a shorter word, or upload your own image.
            <div style={{ marginTop: 12 }}>
              <button type="button" className={s.btn} onClick={() => { setQuery(""); setGroup("All"); }}>Clear search</button>
            </div>
          </div>
        )}
      </Section>
    </>
  );
}
