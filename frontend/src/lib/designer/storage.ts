/**
 * Saved designs and the work in progress, kept in this browser.
 *
 * IndexedDB rather than localStorage: an uploaded picture is stored inside
 * the design, and a few of those would overflow localStorage's 5 MB. Behind
 * these four functions so moving to the API later changes nothing else.
 */
import type { DesignDoc } from "./types";

export interface SavedDesign {
  id: string;
  name: string;
  thumb: string;
  updatedAt: string;
  doc: DesignDoc;
}

const DB = "designer";
const STORE = "designs";
const DRAFT_ID = "__draft__";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result as T); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function saveDesign(design: SavedDesign): Promise<void> {
  await run("readwrite", (s) => s.put(design));
}

export async function listDesigns(): Promise<SavedDesign[]> {
  const all = await run<SavedDesign[]>("readonly", (s) => s.getAll());
  return all.filter((d) => d.id !== DRAFT_ID).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteDesign(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
}

/** The design being worked on, so a reload or a closed tab loses nothing. */
export async function saveDraft(doc: DesignDoc): Promise<void> {
  await run("readwrite", (s) => s.put({ id: DRAFT_ID, name: "", thumb: "", updatedAt: doc.updatedAt, doc }));
}

export async function loadDraft(): Promise<DesignDoc | null> {
  try {
    const row = await run<SavedDesign | undefined>("readonly", (s) => s.get(DRAFT_ID));
    return row?.doc ?? null;
  } catch {
    return null;
  }
}
