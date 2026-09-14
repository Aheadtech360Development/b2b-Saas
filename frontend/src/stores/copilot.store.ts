/**
 * The copilot conversation, kept outside the components that show it.
 *
 * Asking a question and then opening one of the orders it listed is the normal
 * way to use this — and that navigation unmounts the chat. Holding the thread
 * here means the answer is still there when the admin comes back, on the
 * dashboard panel or the dock, instead of an empty box every time.
 *
 * Mirrors the auth store: zustand in memory, sessionStorage so a reload keeps
 * it, and gone when the tab closes. Nothing here is sensitive beyond what the
 * admin already sees on screen.
 */
import { create } from "zustand";

export interface CopilotTurn { role: "user" | "assistant"; content: string }

export interface PreparedAction {
  action: string;
  params: Record<string, string>;
  summary: string;
  target?: string;
  note?: string;
}

const KEY = "at360_copilot_thread";
const MAX_TURNS = 40;

interface Saved { turns: CopilotTurn[]; pending: PreparedAction | null; open: boolean }

function load(): Saved {
  if (typeof window === "undefined") return { turns: [], pending: null, open: false };
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { turns: [], pending: null, open: false };
    const saved = JSON.parse(raw) as Partial<Saved>;
    return {
      turns: Array.isArray(saved.turns) ? saved.turns.slice(-MAX_TURNS) : [],
      pending: saved.pending ?? null,
      open: !!saved.open,
    };
  } catch {
    return { turns: [], pending: null, open: false };
  }
}

function save(state: Saved) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...state, turns: state.turns.slice(-MAX_TURNS) }));
  } catch {
    // Private window or storage full — the thread just won't survive a reload.
  }
}

interface CopilotState extends Saved {
  setTurns: (turns: CopilotTurn[]) => void;
  setPending: (pending: PreparedAction | null) => void;
  setOpen: (open: boolean) => void;
  clear: () => void;
}

export const useCopilotStore = create<CopilotState>((set, get) => ({
  ...load(),
  setTurns: (turns) => { set({ turns }); save({ ...get(), turns }); },
  setPending: (pending) => { set({ pending }); save({ ...get(), pending }); },
  setOpen: (open) => { set({ open }); save({ ...get(), open }); },
  clear: () => {
    set({ turns: [], pending: null });
    save({ turns: [], pending: null, open: get().open });
  },
}));
