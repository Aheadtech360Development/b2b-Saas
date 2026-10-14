/**
 * A design a guest was working on, kept while they make an account.
 *
 * "Sign in to order" leaves the page. The upload builders kept their designs
 * only in the page's memory, and signing in ignored where the buyer came from,
 * so a guest who uploaded a design, then made an account, landed on their
 * account page with the design gone. Now the builder keeps its work here, sends
 * the buyer to make an account (or sign in) with the way back, and opens again
 * with the design as it was.
 */
import { safeNext } from "@/lib/safeNext";

const PREFIX = "pc_draft:";
// Long enough to find a password and come back, not so long that a design from
// another day turns up unasked.
const KEEP_MS = 24 * 3_600_000;

export type Resume = "upload-by-size" | "own-sheet" | "configure";
const RESUMES: readonly Resume[] = ["upload-by-size", "own-sheet", "configure"];

export function keepDraft(key: string, data: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Storage refused: the buyer starts the design again, as before.
  }
}

export function readDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { at?: number; data?: T };
    if (!saved || Date.now() - (saved.at ?? 0) > KEEP_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return saved.data ?? null;
  } catch {
    return null;
  }
}

export function dropDraft(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing kept, nothing to drop.
  }
}

/** Off to make an account (or sign in), then back to this page with the builder open. */
export function signInAndComeBack(resume: Resume): void {
  const here = new URL(window.location.href);
  here.searchParams.set("resume", resume);
  const back = safeNext(here.pathname + here.search) ?? "/";
  window.location.href = `/create-account?next=${encodeURIComponent(back)}`;
}

/** Which builder this page was asked to open again (?resume=…), taken off the address. */
export function takeResume(): Resume | null {
  try {
    const url = new URL(window.location.href);
    const asked = url.searchParams.get("resume");
    if (!asked) return null;
    url.searchParams.delete("resume");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    return (RESUMES as readonly string[]).includes(asked) ? (asked as Resume) : null;
  } catch {
    return null;
  }
}
