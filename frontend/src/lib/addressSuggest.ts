/**
 * Address suggestions under a street field, from the store's own server.
 *
 * As the buyer types, the server is asked (GET /api/v1/address/suggest) and up
 * to five whole addresses are listed under the field; choosing one fills the
 * street, city, state and ZIP. The list is plain DOM attached to the field —
 * the way Google's widget works — so the address forms keep their own markup.
 *
 * It only ever helps: no answer, an error, or the server saying suggestions
 * are off, and the field is just a field.
 */
import { apiClient } from "@/lib/api-client";

export interface AddressSuggestion {
  label: string;
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface SuggestAnswer {
  enabled: boolean;
  suggestions: AddressSuggestion[];
  attribution?: string;
}

const MIN_CHARS = 3;
const WAIT_MS = 250;
let lists = 0;

export function askServer(q: string): Promise<SuggestAnswer> {
  return apiClient.get<SuggestAnswer>(`/api/v1/address/suggest?q=${encodeURIComponent(q)}`);
}

/**
 * Suggestions for this field until the returned function is called. `ask` is
 * the server by default; tests hand in their own.
 */
export function attachAddressSuggestions(
  input: HTMLInputElement,
  onSelect: (s: AddressSuggestion) => void,
  ask: (q: string) => Promise<SuggestAnswer> = askServer,
): () => void {
  const id = `addr-suggest-${++lists}`;
  const box = document.createElement("div");
  box.dataset.addressSuggestions = "";
  Object.assign(box.style, {
    position: "absolute", zIndex: "10000", display: "none", background: "#fff",
    border: "1px solid #E3E3E3", borderRadius: "10px", boxShadow: "0 12px 32px rgba(0,0,0,.12)",
    overflow: "hidden", fontSize: "13.5px", color: "#18181B", textAlign: "left",
  });
  const list = document.createElement("div");
  list.id = id;
  list.setAttribute("role", "listbox");
  const credit = document.createElement("div");
  Object.assign(credit.style, { fontSize: "11px", color: "#A1A1AA", padding: "6px 12px", borderTop: "1px solid #F4F4F5" });
  box.append(list, credit);
  document.body.appendChild(box);

  // What the field said before: given back when suggestions are taken off it.
  const before = {
    autocomplete: input.getAttribute("autocomplete"),
    role: input.getAttribute("role"),
  };
  // The browser's own address list would open over this one.
  input.setAttribute("autocomplete", "off");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", id);
  input.setAttribute("aria-expanded", "false");

  const answers = new Map<string, SuggestAnswer>();
  let shown: AddressSuggestion[] = [];
  let active = -1;
  let asked = 0;
  let off = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let blurTimer: ReturnType<typeof setTimeout> | null = null;

  function place() {
    const r = input.getBoundingClientRect();
    box.style.top = `${r.bottom + window.scrollY + 4}px`;
    box.style.left = `${r.left + window.scrollX}px`;
    box.style.width = `${Math.max(r.width, 260)}px`;
  }

  function close() {
    box.style.display = "none";
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    shown = [];
    active = -1;
  }

  function mark(i: number) {
    active = i;
    Array.from(list.children).forEach((el, n) => {
      (el as HTMLElement).style.background = n === i ? "#F4F4F5" : "#fff";
      el.setAttribute("aria-selected", n === i ? "true" : "false");
    });
    if (i >= 0) input.setAttribute("aria-activedescendant", `${id}-${i}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function choose(i: number) {
    const s = shown[i];
    close();
    if (s) onSelect(s);
  }

  function show(answer: SuggestAnswer) {
    shown = answer.suggestions.slice(0, 5);
    list.replaceChildren();
    if (!shown.length || document.activeElement !== input) {
      close();
      return;
    }
    shown.forEach((s, i) => {
      const item = document.createElement("div");
      item.id = `${id}-${i}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");
      Object.assign(item.style, { padding: "9px 12px", cursor: "pointer", lineHeight: "1.35" });
      const main = document.createElement("div");
      main.textContent = s.line1;
      main.style.fontWeight = "600";
      const rest = document.createElement("div");
      rest.textContent = [s.city, `${s.state} ${s.postal_code}`.trim()].filter(Boolean).join(", ");
      Object.assign(rest.style, { fontSize: "12px", color: "#71717A" });
      item.append(main, rest);
      // Chosen on mousedown, before the field loses focus and the list closes.
      item.addEventListener("mousedown", (e) => { e.preventDefault(); choose(i); });
      item.addEventListener("mouseenter", () => mark(i));
      list.appendChild(item);
    });
    credit.textContent = answer.attribution ?? "";
    credit.style.display = answer.attribution ? "block" : "none";
    place();
    box.style.display = "block";
    input.setAttribute("aria-expanded", "true");
    mark(-1);
  }

  async function lookUp(q: string) {
    const mine = ++asked;
    let answer = answers.get(q.toLowerCase());
    if (!answer) {
      try {
        answer = await ask(q);
      } catch {
        if (mine === asked) close();
        return;
      }
      answers.set(q.toLowerCase(), answer);
    }
    if (mine !== asked) return; // a later keystroke asked since
    if (!answer.enabled) {
      // Not set up on this store: stop asking.
      off = true;
      close();
      return;
    }
    show(answer);
  }

  function onInput() {
    if (off) return;
    if (timer) clearTimeout(timer);
    const q = input.value.trim().replace(/\s+/g, " ");
    if (q.length < MIN_CHARS) {
      asked++;
      close();
      return;
    }
    timer = setTimeout(() => { void lookUp(q); }, WAIT_MS);
  }

  function onKey(e: KeyboardEvent) {
    if (box.style.display === "none" || !shown.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      // Round from none to the first, down to the last, and back to none.
      let next = active + (e.key === "ArrowDown" ? 1 : -1);
      if (next >= shown.length) next = -1;
      if (next < -1) next = shown.length - 1;
      mark(next);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close();
    }
  }

  function onBlur() {
    blurTimer = setTimeout(close, 150);
  }

  function onFocus() {
    if (blurTimer) clearTimeout(blurTimer);
  }

  function onMove() {
    if (box.style.display !== "none") place();
  }

  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKey);
  input.addEventListener("blur", onBlur);
  input.addEventListener("focus", onFocus);
  window.addEventListener("scroll", onMove, true);
  window.addEventListener("resize", onMove);

  return () => {
    if (timer) clearTimeout(timer);
    if (blurTimer) clearTimeout(blurTimer);
    asked++;
    input.removeEventListener("input", onInput);
    input.removeEventListener("keydown", onKey);
    input.removeEventListener("blur", onBlur);
    input.removeEventListener("focus", onFocus);
    window.removeEventListener("scroll", onMove, true);
    window.removeEventListener("resize", onMove);
    box.remove();
    for (const [name, value] of Object.entries(before)) {
      if (value === null) input.removeAttribute(name);
      else input.setAttribute(name, value);
    }
    for (const name of ["aria-autocomplete", "aria-controls", "aria-expanded", "aria-activedescendant"]) {
      input.removeAttribute(name);
    }
  };
}
