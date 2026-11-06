"use client";

import { FilePlus2, FolderOpen, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { deleteDesign, listDesigns, type SavedDesign } from "@/lib/designer/storage";
import { emptyDoc, useDesigner } from "@/stores/designer.store";
import { useNotice } from "../context";
import s from "../designer.module.css";
import { Section } from "../ui";

/** Saved designs, newest first. `saveCurrent` is the shell's save action. */
export function SavedPanel({ saveCurrent, version }: { saveCurrent: () => Promise<void>; version: number }) {
  const loadDoc = useDesigner((st) => st.loadDoc);
  const show = useNotice((st) => st.show);
  const [items, setItems] = useState<SavedDesign[] | null>(null);

  const refresh = useCallback(() => {
    listDesigns().then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(refresh, [refresh, version]);

  return (
    <>
      <Section>
        <button type="button" className={`${s.btn} ${s.btnBlock}`} onClick={() => void saveCurrent().then(refresh)}>
          <Save size={16} /> Save this design
        </button>
        <button type="button" className={`${s.btn} ${s.btnBlock}`} style={{ marginTop: 8 }}
          onClick={() => {
            const { doc, catalog } = useDesigner.getState();
            const g = catalog.find((x) => x.id === doc?.products[0]?.garmentId) ?? catalog[0];
            if (!g || !window.confirm(`Start a new design? Unsaved changes to “${doc?.name ?? "this design"}” will be discarded.`)) return;
            loadDoc(emptyDoc(g));
            show("Started a new design");
          }}>
          <FilePlus2 size={16} /> Start a new design
        </button>
        <p className={s.hint}>Designs are kept in this browser.</p>
      </Section>
      <Section label="Your designs">
        {items === null ? (
          <div className={s.shimmer} style={{ aspectRatio: "auto", height: 72 }} />
        ) : items.length === 0 ? (
          <div className={s.empty}>
            <strong>No saved designs yet</strong>
            Save one to come back to it, or to start another from it.
          </div>
        ) : (
          items.map((d) => (
            <div key={d.id} className={s.savedItem}>
              <img src={d.thumb} alt="" />
              <div className={s.savedMeta}>
                <strong>{d.name}</strong>
                <span>{new Date(d.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <button type="button" className={s.iconBtn} aria-label={`Open ${d.name}`} data-tip="Open design"
                onClick={() => { loadDoc(d.doc); show(`Opened “${d.name}”`); }}>
                <FolderOpen size={17} />
              </button>
              <button type="button" className={s.iconBtn} aria-label={`Delete ${d.name}`} data-tip="Delete design"
                onClick={async () => {
                  if (!window.confirm(`Delete “${d.name}”? This can't be undone.`)) return;
                  await deleteDesign(d.id);
                  refresh();
                }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </Section>
    </>
  );
}
