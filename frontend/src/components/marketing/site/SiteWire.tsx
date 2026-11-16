"use client";

/**
 * What printcopilot.co's design pages do in the browser. The design is plain
 * HTML (drawn by SitePage); this finds its forms and its help search after the
 * page is on screen and makes them work, with the same backend calls the old
 * pages made:
 *
 *   demo        a time picked from GET /api/v1/leads/demo-slots, then POST /api/v1/leads
 *               (kind demo, with the slot): the console's Leads; team and visitor are emailed
 *   contact     POST /api/v1/contact: emailed to the platform inbox, kept in Leads
 *   affiliate   POST /api/v1/partners/apply, with the program's current terms shown and accepted
 *   newsletter  POST /api/v1/leads (kind newsletter): the blog's subscribe box
 *
 * The forms' buttons are links in the design (data-pc-submit); pressing one
 * checks the form the browser's own way, then sends it.
 */
import { useEffect } from "react";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { papi } from "@/lib/partnerApi";
import type { SiteKey } from "./registry";

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** The contact form's topics, as the contact endpoint files them. */
export const CONTACT_TOPICS: Record<string, string> = {
  "A question before I sign up": "sales",
  "Support for my store": "support",
  Partnerships: "partnerships",
  "Something else": "other",
};

interface Program {
  accepting_applications?: boolean;
  application_response_days?: number;
  terms?: { version: number; clauses: { title: string; text: string }[] } | null;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function value(form: HTMLFormElement, name: string): string {
  const el = form.elements.namedItem(name) as Field | null;
  return (el && "value" in el ? el.value : "").trim();
}

function errorText(err: unknown): string {
  if (err instanceof ApiClientError && err.message) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "We could not send that. Please try again, or email support@printcopilot.co.";
}

/** A line under the button: the problem, in red. */
function sayProblem(form: HTMLFormElement, text: string | null) {
  let line = form.querySelector<HTMLParagraphElement>("[data-pc-problem]");
  if (!text) { line?.remove(); return; }
  if (!line) {
    line = document.createElement("p");
    line.className = "fn";
    line.setAttribute("data-pc-problem", "1");
    line.setAttribute("role", "alert");
    line.style.color = "#B42318";
    const button = form.querySelector("[data-pc-submit]");
    if (button) button.insertAdjacentElement("afterend", line);
    else form.appendChild(line);
  }
  line.textContent = text;
}

/** The form gives way to what happened next. */
function sayDone(form: HTMLFormElement, title: string, text: string) {
  form.innerHTML =
    `<div role="status" data-pc-done style="padding:8px 0">`
    + `<h3 style="font-size:24px;line-height:30px;color:#0C1E35;-webkit-text-fill-color:#0C1E35;background:none">${esc(title)}</h3>`
    + `<p style="margin-top:12px;color:#475467">${esc(text)}</p></div>`;
}

function busy(form: HTMLFormElement, on: boolean) {
  form.querySelectorAll<HTMLElement>("[data-pc-submit]").forEach((b) => {
    b.style.opacity = on ? "0.6" : "";
    b.style.pointerEvents = on ? "none" : "";
    b.setAttribute("aria-disabled", on ? "true" : "false");
  });
}

/** The demo form's answers, as the leads endpoint takes them. */
function demoLead(form: HTMLFormElement, extra: Record<string, string> = {}) {
  return {
    kind: "demo",
    name: value(form, "name"),
    email: value(form, "email"),
    data: {
      business_name: value(form, "business"),
      website: value(form, "website"),
      sells: value(form, "sell"),
      sells_today: value(form, "today"),
      message: value(form, "notes"),
      ...extra,
    },
    company: "",
  };
}

// ── The demo form's second step: a time to book ──────────────────────────────
// The design's button says "Choose a time" and "You will pick a time on the
// next step". The open half-hour slots (api/v1/leads/demo-slots, the team's
// hours) are shown in the visitor's own time zone; the one picked is booked
// with the lead, and the visitor is emailed a confirmation. If the times do
// not load, the request still goes, and the team writes with times instead.
type Slots = { zone?: string; slot_minutes?: number; slots?: string[] };

const PICKER_CSS = `
.pc-pick{display:grid;gap:16px}
.pc-pick h3{font-size:24px!important;line-height:30px!important;margin:0;color:#0C1E35!important;-webkit-text-fill-color:#0C1E35}
.pc-pick .pc-pick-sub{margin:0;color:#475467;font-size:14px;line-height:21px}
.pc-days{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}
.pc-days button,.pc-times button{font:600 14px/20px Inter,sans-serif;border:1px solid #C7D0DD;background:#fff;color:#0C1E35;border-radius:10px;cursor:pointer}
.pc-days button{flex:none;min-width:72px;padding:8px 10px;display:grid;gap:2px;text-align:center}
.pc-days button small{font-weight:400;color:#667085;font-size:12px}
.pc-times{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.pc-times button{height:44px}
.pc-days button[aria-pressed=true],.pc-times button[aria-pressed=true]{background:#0B5ED7;border-color:#0B5ED7;color:#fff}
.pc-days button[aria-pressed=true] small{color:#DCE8FB}
.pc-pick .pc-book{width:100%;height:52px;border:0;border-radius:10px;background:#0B5ED7;color:#fff;font:600 16px/24px Inter,sans-serif;cursor:pointer}
.pc-pick .pc-book[disabled]{opacity:.5;cursor:default}
.pc-pick .pc-back{background:none;border:0;color:#0B5ED7;font:600 14px/20px Inter,sans-serif;cursor:pointer;justify-self:start;padding:0}
.pc-pick .pc-pick-problem{margin:0;color:#B42318;font-size:14px}
@media (max-width:560px){.pc-times{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;

function visitorZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
}

const dayKey = (d: Date, zone: string) => d.toLocaleDateString("en-CA", zone ? { timeZone: zone } : {});
const fmt = (d: Date, zone: string, o: Intl.DateTimeFormatOptions) =>
  d.toLocaleString("en-US", zone ? { ...o, timeZone: zone } : o);

/** "Tue, Nov 18 at 10:30 AM", in the visitor's zone. */
export function visitorLabel(iso: string, zone: string): string {
  const d = new Date(iso);
  return `${fmt(d, zone, { weekday: "short", month: "short", day: "numeric" })} at ${fmt(d, zone, { hour: "numeric", minute: "2-digit" })}`;
}

function showPicker(form: HTMLFormElement, slots: string[], minutes: number, onBooked: (title: string, text: string) => void) {
  if (!document.getElementById("pc-pick-css")) {
    const style = document.createElement("style");
    style.id = "pc-pick-css";
    style.textContent = PICKER_CSS;
    document.head.appendChild(style);
  }
  const zone = visitorZone();
  const fields = Array.from(form.children) as HTMLElement[];
  fields.forEach((el) => { el.dataset.pcWas = el.style.display; el.style.display = "none"; });

  const box = document.createElement("div");
  box.className = "pc-pick";
  box.setAttribute("data-pc-picker", "1");
  form.appendChild(box);

  let open = slots;
  let day = "";
  let picked = "";
  let sending = false;

  const draw = (problem = "") => {
    const days = Array.from(new Set(open.map((s) => dayKey(new Date(s), zone))));
    if (!days.includes(day)) day = days[0] ?? "";
    if (picked && !open.includes(picked)) picked = "";
    const times = open.filter((s) => dayKey(new Date(s), zone) === day);
    box.innerHTML =
      `<button type="button" class="pc-back" data-pc-back>&larr; Back to your details</button>`
      + `<h3>Pick a time</h3>`
      + `<p class="pc-pick-sub">Each demo takes ${minutes} minutes. Times are in your time zone${zone ? ` (${esc(zone.replace(/_/g, " "))})` : ""}.</p>`
      + (days.length
        ? `<div class="pc-days" role="group" aria-label="Day">${days.map((k) => {
          const d = new Date(open.find((s) => dayKey(new Date(s), zone) === k)!);
          return `<button type="button" data-pc-day="${k}" aria-pressed="${k === day}">${esc(fmt(d, zone, { weekday: "short" }))}<small>${esc(fmt(d, zone, { month: "short", day: "numeric" }))}</small></button>`;
        }).join("")}</div>`
          + `<div class="pc-times" role="group" aria-label="Time">${times.map((s) =>
            `<button type="button" data-pc-time="${s}" aria-pressed="${s === picked}">${esc(fmt(new Date(s), zone, { hour: "numeric", minute: "2-digit" }))}</button>`).join("")}</div>`
        : `<p class="pc-pick-sub">There are no open times in the next two weeks. Send your request and we will email you a time.</p>`)
      + (problem ? `<p class="pc-pick-problem" role="alert">${esc(problem)}</p>` : "")
      + `<button type="button" class="pc-book" data-pc-book ${days.length && !picked ? "disabled" : ""}>${days.length ? (picked ? `Book ${esc(visitorLabel(picked, zone))}` : "Pick a time above") : "Send my request"}</button>`;
  };

  const book = async () => {
    if (sending) return;
    sending = true;
    const button = box.querySelector<HTMLButtonElement>("[data-pc-book]");
    if (button) { button.disabled = true; button.textContent = "Booking…"; }
    try {
      if (!open.length) {
        await apiClient.post("/api/v1/leads", demoLead(form), { skipAuth: true });
        onBooked("Thanks, we got it.", "Check your email. We will send a few times to choose from.");
        return;
      }
      await apiClient.post("/api/v1/leads", demoLead(form, { slot_start: picked, time_zone: zone }), { skipAuth: true });
      onBooked("You are booked.",
        `${visitorLabel(picked, zone)}, your time. We sent the details to ${value(form, "email")} and will email you the meeting link before the call.`);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        // Taken a moment ago by somebody else: show what is still open.
        try {
          const fresh = await apiClient.get<Slots>("/api/v1/leads/demo-slots", { skipAuth: true });
          open = fresh?.slots ?? open.filter((s) => s !== picked);
        } catch { open = open.filter((s) => s !== picked); }
        picked = "";
        draw("That time was just taken. Pick another one.");
      } else {
        draw(errorText(err));
      }
    } finally {
      sending = false;
    }
  };

  box.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("button");
    if (!t || !box.contains(t)) return;
    e.preventDefault();
    if (t.dataset.pcBack !== undefined) {
      box.remove();
      fields.forEach((el) => { el.style.display = el.dataset.pcWas ?? ""; delete el.dataset.pcWas; });
      return;
    }
    if (t.dataset.pcDay) { day = t.dataset.pcDay; picked = ""; draw(); return; }
    if (t.dataset.pcTime) { picked = t.dataset.pcTime; draw(); return; }
    if (t.dataset.pcBook !== undefined && (picked || !open.length)) void book();
  });
  draw();
  box.querySelector<HTMLElement>("h3")?.scrollIntoView?.({ block: "nearest" });
}

/** "Choose a time": the open times, or (if they cannot be had) the request on its own. */
async function startDemo(form: HTMLFormElement, onBooked: (title: string, text: string) => void) {
  let got: Slots | null = null;
  try {
    got = await apiClient.get<Slots>("/api/v1/leads/demo-slots", { skipAuth: true });
  } catch {
    got = null;
  }
  if (!got || !Array.isArray(got.slots)) {
    await apiClient.post("/api/v1/leads", demoLead(form), { skipAuth: true });
    onBooked("Thanks, we got it.", "Check your email. We will send a few times to choose from.");
    return;
  }
  showPicker(form, got.slots, got.slot_minutes ?? 30, onBooked);
}

/** Sends one form. Returns the words to show when it went. */
async function send(kind: string, form: HTMLFormElement, program: Program | null): Promise<[string, string]> {
  if (kind === "contact") {
    const r = await apiClient.post<{ message?: string }>("/api/v1/contact", {
      name: value(form, "name"),
      email: value(form, "email"),
      department: CONTACT_TOPICS[value(form, "topic")] ?? "other",
      message: value(form, "message"),
      company_hp: "",
    }, { skipAuth: true });
    return ["Message received.", r?.message || "We will get back to you within 1 business day."];
  }
  if (kind === "newsletter") {
    const email = (form.querySelector<HTMLInputElement>('input[type="email"]')?.value ?? "").trim();
    await apiClient.post("/api/v1/leads", { kind: "newsletter", name: email, email, data: {}, company: "" }, { skipAuth: true });
    return ["You are on the list.", "We will email you when there is a new guide."];
  }
  // affiliate
  if (!program?.terms) throw new Error("The partner terms did not load. Refresh the page, or email support@printcopilot.co.");
  const agree = form.querySelector<HTMLInputElement>('label.ck input[type="checkbox"]')?.checked ?? false;
  const promote = value(form, "promote");
  const audience = value(form, "audience");
  const r = await papi<{ status: string }>("/partners/apply", {
    auth: false,
    body: {
      name: value(form, "name"),
      email: value(form, "email"),
      business_name: value(form, "business") || null,
      website: value(form, "website") || null,
      promote_how: promote || "Not said by the applicant",
      audience_size: audience || null,
      terms_version: program.terms.version,
      accept_terms: agree,
      company: null,
    },
  });
  if (r?.status === "approved") return ["You are in.", "Check your email for your link, your code and how to sign in."];
  const days = program.application_response_days;
  return ["Application received.",
    `We read every application ourselves${days ? ` and usually answer within ${days} working ${days === 1 ? "day" : "days"}` : ""}.`];
}

/** The affiliate form shows the terms it asks the applicant to accept, or says applications are closed. */
function prepareAffiliate(form: HTMLFormElement, program: Program | null) {
  if (program && (!program.accepting_applications || !program.terms)) {
    sayDone(form, "Applications are closed right now", "We are not taking applications right now. Please check back soon.");
    return;
  }
  if (!program?.terms || form.querySelector("[data-pc-terms]")) return;
  // The program needs to know how they will promote it.
  const promote = form.querySelector<HTMLSelectElement>('select[name="promote"]');
  if (promote) promote.required = true;
  const box = form.querySelector("label.ck");
  if (!box) return;
  const terms = document.createElement("details");
  terms.setAttribute("data-pc-terms", "1");
  terms.style.cssText = "border:1px solid #D9DFE8;border-radius:10px;padding:10px 14px;font-size:14px;line-height:20px";
  terms.innerHTML =
    `<summary style="cursor:pointer;font-weight:600">Read the Affiliate Terms (version ${program.terms.version})</summary>`
    + `<div style="max-height:220px;overflow:auto;margin-top:10px;color:#475467">`
    + program.terms.clauses.map((c, i) => `<p style="margin:0 0 8px"><b>${i + 1}. ${esc(c.title)}.</b> ${esc(c.text)}</p>`).join("")
    + `</div>`;
  box.insertAdjacentElement("beforebegin", terms);
  const words = box.querySelector("span");
  if (words) words.textContent = `I agree to the Affiliate Terms, version ${program.terms.version}.`;
}

/** The help page's search: questions that match stay, opened; the rest step aside. */
function wireHelpSearch(root: HTMLElement): () => void {
  const input = root.querySelector<HTMLInputElement>(".hs input");
  const button = root.querySelector<HTMLElement>("[data-pc-search]");
  if (!input) return () => {};
  const items = Array.from(root.querySelectorAll<HTMLDetailsElement>("details")).filter((d) => !d.closest("header"));
  let none: HTMLParagraphElement | null = null;
  const run = () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    for (const d of items) {
      const hit = !q || (d.textContent ?? "").toLowerCase().includes(q);
      d.style.display = hit ? "" : "none";
      if (hit) shown += 1;
      if (q && hit) d.open = true;
    }
    if (!none) {
      none = document.createElement("p");
      none.setAttribute("role", "status");
      none.style.cssText = "margin-top:14px;color:#C9D3E3";
      input.closest(".hs")?.insertAdjacentElement("afterend", none);
    }
    none.innerHTML = q && !shown ? 'No answer matches that. <a href="/contact" style="color:#fff;font-weight:600">Ask us</a> and a person will reply.' : "";
    if (q && shown) items.find((d) => d.style.display !== "none")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const click = (e: Event) => { e.preventDefault(); run(); };
  const key = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); run(); } };
  button?.addEventListener("click", click);
  input.addEventListener("keydown", key);
  input.addEventListener("search", run);
  return () => {
    button?.removeEventListener("click", click);
    input.removeEventListener("keydown", key);
    input.removeEventListener("search", run);
  };
}

export default function SiteWire({ page }: { page: SiteKey }) {
  useEffect(() => {
    const root = document.getElementById("pc-site");
    if (!root) return;
    const undo: Array<() => void> = [];
    let program: Program | null = null;

    root.querySelectorAll<HTMLFormElement>("form[data-pc-form]").forEach((form) => {
      const kind = form.dataset.pcForm ?? "";
      let sending = false;
      const go = async () => {
        if (sending) return;
        if (!form.reportValidity()) return;
        sending = true;
        busy(form, true);
        sayProblem(form, null);
        try {
          if (kind === "demo") {
            // Second step first: the visitor picks a time, and that sends it.
            await startDemo(form, (title, text) => sayDone(form, title, text));
            busy(form, false);
            return;
          }
          const [title, text] = await send(kind, form, program);
          sayDone(form, title, text);
        } catch (err) {
          sayProblem(form, errorText(err));
          busy(form, false);
        } finally {
          sending = false;
        }
      };
      const onSubmit = (e: Event) => { e.preventDefault(); go(); };
      const onClick = (e: Event) => { e.preventDefault(); go(); };
      form.addEventListener("submit", onSubmit);
      const buttons = Array.from(form.querySelectorAll<HTMLElement>("[data-pc-submit]"));
      buttons.forEach((b) => b.addEventListener("click", onClick));
      undo.push(() => {
        form.removeEventListener("submit", onSubmit);
        buttons.forEach((b) => b.removeEventListener("click", onClick));
      });

      if (kind === "newsletter") {
        const email = form.querySelector<HTMLInputElement>('input[type="email"]');
        if (email) { email.required = true; email.name = "email"; }
      }
      if (kind === "affiliate") {
        papi<Program>("/partners/program", { auth: false })
          .then((p) => { program = p; prepareAffiliate(form, p); })
          .catch(() => { program = null; });
      }
    });

    if (page === "help") undo.push(wireHelpSearch(root));
    return () => undo.forEach((fn) => fn());
  }, [page]);

  return null;
}
