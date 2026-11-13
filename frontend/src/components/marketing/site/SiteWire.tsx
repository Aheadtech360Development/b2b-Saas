"use client";

/**
 * What printcopilot.co's design pages do in the browser. The design is plain
 * HTML (drawn by SitePage); this finds its forms and its help search after the
 * page is on screen and makes them work, with the same backend calls the old
 * pages made:
 *
 *   demo        POST /api/v1/leads (kind demo): the console's Leads, and the team is emailed
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
    + `<h3 style="font-size:24px;line-height:30px">${esc(title)}</h3>`
    + `<p style="margin-top:12px;color:#475467">${esc(text)}</p></div>`;
}

function busy(form: HTMLFormElement, on: boolean) {
  form.querySelectorAll<HTMLElement>("[data-pc-submit]").forEach((b) => {
    b.style.opacity = on ? "0.6" : "";
    b.style.pointerEvents = on ? "none" : "";
    b.setAttribute("aria-disabled", on ? "true" : "false");
  });
}

/** Sends one form. Returns the words to show when it went. */
async function send(kind: string, form: HTMLFormElement, program: Program | null): Promise<[string, string]> {
  if (kind === "demo") {
    await apiClient.post("/api/v1/leads", {
      kind: "demo",
      name: value(form, "name"),
      email: value(form, "email"),
      data: {
        business_name: value(form, "business"),
        website: value(form, "website"),
        sells: value(form, "sell"),
        sells_today: value(form, "today"),
        message: value(form, "notes"),
      },
      company: "",
    }, { skipAuth: true });
    return ["Thanks, we got it.", "Check your email. We will send a few times to choose from."];
  }
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
