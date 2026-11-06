"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { inkFor } from "@/lib/designer/colors";
import { DEMO_RATES, money } from "@/lib/designer/pricing";
import { lineKey, type RosterRow, type SizeKey } from "@/lib/designer/types";
import { newId, useDesigner } from "@/stores/designer.store";
import { useActiveGarment, useCtrl, useShirt } from "../context";
import type { DesignController } from "../controller";
import s from "../designer.module.css";
import { Section, Switch } from "../ui";

/** Wait until the canvas is showing the back, switching to it if needed. */
async function onBack(ctrl: DesignController) {
  const onIt = () => ctrl.currentView === "back";
  if (!onIt()) {
    useDesigner.getState().setView("back");
    const start = performance.now();
    while (!onIt() && performance.now() - start < 1500) {
      await new Promise((r) => requestAnimationFrame(r));
    }
  }
  await ctrl.ready;
}

export function NamesPanel() {
  const ctrl = useCtrl();
  const doc = useDesigner((st) => st.doc);
  const catalog = useDesigner((st) => st.catalog);
  const preview = useDesigner((st) => st.rosterPreview);
  const view = useDesigner((st) => st.view);
  const { setRoster, setRosterPreview } = useDesigner.getState();
  const { hex } = useActiveGarment();

  const back = useShirt().design?.back ?? [];
  const hasName = back.some((o) => o.nn === "name");
  const hasNumber = back.some((o) => o.nn === "number");

  const lines = useMemo(() => {
    if (!doc) return [];
    return doc.products.flatMap((p) => {
      const g = catalog.find((x) => x.id === p.garmentId);
      if (!g) return [];
      return p.colorIds.map((c) => ({
        key: lineKey(g.id, c),
        label: `${g.name}, ${g.colors.find((x) => x.id === c)?.name ?? c}`,
        sizes: g.sizes,
      }));
    });
  }, [doc, catalog]);

  const roster = doc?.roster ?? [];
  const row = roster[preview];

  // Show the chosen roster row on the shirt.
  useEffect(() => {
    if (ctrl && view === "back") ctrl.previewRoster(row?.name ?? "", row?.number ?? "");
  }, [ctrl, view, row?.name, row?.number, hasName, hasNumber]);

  if (!doc) return null;
  const first = lines[0];

  async function toggle(kind: "name" | "number", on: boolean) {
    if (!ctrl) return;
    await onBack(ctrl);
    await ctrl.setNn(kind, on, inkFor(hex));
    if (on && !roster.length && first) {
      setRoster([{ id: newId(), name: "SMITH", number: "7", size: (first.sizes.includes("L") ? "L" : first.sizes[0]) as SizeKey, line: first.key }]);
    }
  }

  const update = (id: string, patch: Partial<RosterRow>) =>
    setRoster(roster.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const named = roster.filter((r) => r.name.trim()).length;
  const numbered = roster.filter((r) => r.number.trim()).length;

  return (
    <>
      <Section>
        <Switch label="Names" hint={`${money(DEMO_RATES.name)} per shirt`} on={hasName} onToggle={() => void toggle("name", !hasName)} />
        <Switch label="Numbers" hint={`${money(DEMO_RATES.number)} per shirt`} on={hasNumber} onToggle={() => void toggle("number", !hasNumber)} />
        <p className={s.hint}>They go on the back. Select one on the shirt to change its font, colour or size.</p>
      </Section>

      {(hasName || hasNumber) && (
        <Section label={`Roster (${roster.length})`}
          aside={named || numbered ? <span className={s.num}>{money(named * DEMO_RATES.name + numbered * DEMO_RATES.number)}</span> : undefined}>
          <div className={s.roster}>
            <div className={`${s.rosterRow} ${s.rosterHead}`}>
              <span aria-hidden />
              <span>Name</span>
              <span>No.</span>
              <span>Size</span>
              <span aria-hidden />
            </div>
            {roster.map((r, i) => {
              const line = lines.find((l) => l.key === r.line) ?? first;
              return (
                <div key={r.id}>
                  <div className={s.rosterRow}>
                    <input type="radio" className={s.radio} name="roster-preview" checked={preview === i}
                      aria-label={`Show ${r.name || "row " + (i + 1)} on the shirt`} onChange={() => setRosterPreview(i)} />
                    <input className={s.input} value={r.name} placeholder="Name" aria-label="Name" maxLength={20}
                      disabled={!hasName} onFocus={() => setRosterPreview(i)}
                      onChange={(e) => update(r.id, { name: e.target.value.toUpperCase() })} />
                    <input className={`${s.input} ${s.num}`} value={r.number} placeholder="00" aria-label="Number" maxLength={3}
                      inputMode="numeric" disabled={!hasNumber} onFocus={() => setRosterPreview(i)}
                      onChange={(e) => update(r.id, { number: e.target.value.replace(/[^0-9]/g, "") })} />
                    <select className={s.select} value={r.size} aria-label="Size"
                      onChange={(e) => update(r.id, { size: e.target.value as SizeKey })}>
                      {(line?.sizes ?? []).map((z) => <option key={z}>{z}</option>)}
                    </select>
                    <button type="button" className={s.iconBtn} style={{ width: 28, height: 28 }} aria-label="Remove row"
                      onClick={() => { setRoster(roster.filter((x) => x.id !== r.id)); setRosterPreview(0); }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {lines.length > 1 && (
                    <select className={s.select} value={r.line} aria-label="Product and colour"
                      style={{ minHeight: 30, fontSize: 12, margin: "4px 0 4px 28px", width: "calc(100% - 28px)" }}
                      onChange={(e) => update(r.id, { line: e.target.value })}>
                      {lines.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" className={`${s.btn} ${s.btnBlock}`} style={{ marginTop: 10 }}
            onClick={() => {
              if (!first) return;
              const last = roster[roster.length - 1];
              setRoster([...roster, { id: newId(), name: "", number: "", size: last?.size ?? (first.sizes[0] as SizeKey), line: last?.line ?? first.key }]);
              setRosterPreview(roster.length);
            }}>
            <Plus size={16} /> Add a shirt
          </button>
          <p className={s.hint}>Each row is one shirt. Sizes here count towards your quantities.</p>
        </Section>
      )}
    </>
  );
}
