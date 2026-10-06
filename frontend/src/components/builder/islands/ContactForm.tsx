"use client";

/**
 * A contact form a shop builds itself: its own fields, each required or not,
 * half a row or a whole one, in its own colours. What a customer sends lands
 * in the brand's Messages in the admin, under the form's name.
 *
 * Checked here, in words, before anything is sent — the browser's own bubbles
 * are not used. A field nobody can see catches the bots that fill in every box.
 */
import { useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";

export interface FormFieldDef {
  label?: string;
  type?: string;
  placeholder?: string;
  /** For a dropdown: one choice per line. */
  options?: string;
  required?: boolean;
  width?: string;
}

export interface FormLook {
  fieldBorder?: string; fieldBg?: string; fieldRadius?: number; labelColor?: string;
  buttonBg?: string; buttonColor?: string; buttonRadius?: number; focusColor?: string;
}

const TYPES = new Set(["text", "email", "tel", "number", "date", "textarea", "select", "checkbox"]);

/** A colour that is only a colour — never something that can break out of a style. */
export function safeColor(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20})$/i.test(s) ? s : undefined;
}

const px = (v: unknown, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? `${Math.max(0, Math.min(v, max))}px` : undefined;

/** The fields as they will be drawn: a type that exists, a label, a name no other field has. */
export function formFields(raw: unknown): (Required<Pick<FormFieldDef, "label" | "type">> & FormFieldDef & { name: string; choices: string[] })[] {
  const list = Array.isArray(raw) ? (raw as FormFieldDef[]) : [];
  const seen = new Map<string, number>();
  return list.filter((f) => f && typeof f === "object").map((f, i) => {
    const type = TYPES.has(String(f.type)) ? String(f.type) : "text";
    const label = String(f.label ?? "").trim() || `Field ${i + 1}`;
    const n = (seen.get(label) ?? 0) + 1;
    seen.set(label, n);
    const choices = String(f.options ?? "").split("\n").map((c) => c.trim()).filter(Boolean);
    return { ...f, type, label, name: n === 1 ? label : `${label} (${n})`, choices };
  });
}

/** What is wrong with what was typed, in words — or nothing. */
export function problemWith(type: string, required: boolean, value: string | boolean): string {
  if (type === "checkbox") return required && !value ? "Please tick this." : "";
  const v = String(value ?? "").trim();
  if (!v) return required ? "Please fill this in." : "";
  if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "That email address does not look right.";
  if (type === "tel" && v.replace(/\D/g, "").length < 7) return "That phone number looks too short.";
  if (type === "number" && !Number.isFinite(Number(v))) return "Please enter a number.";
  return "";
}

export function ContactForm({ id, formName, fields, button, success, buttonWidth, look, edit }: {
  id: string; formName: string; fields: unknown; button: string; success: string; buttonWidth: string;
  look: FormLook; edit?: boolean;
}) {
  const list = formFields(fields);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const trap = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const vars = {
    "--f-border": safeColor(look.fieldBorder), "--f-bg": safeColor(look.fieldBg), "--f-radius": px(look.fieldRadius, 40),
    "--f-label": safeColor(look.labelColor), "--f-btn-bg": safeColor(look.buttonBg), "--f-btn-color": safeColor(look.buttonColor),
    "--f-btn-radius": px(look.buttonRadius, 60), "--f-focus": safeColor(look.focusColor),
  } as Record<string, string | undefined>;
  const style = Object.fromEntries(Object.entries(vars).filter(([, v]) => v)) as React.CSSProperties;

  const set = (name: string, v: string | boolean) => {
    setValues((cur) => ({ ...cur, [name]: v }));
    if (errors[name]) setErrors((cur) => { const next = { ...cur }; delete next[name]; return next; });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (edit || state === "sending") return;
    const found: Record<string, string> = {};
    for (const f of list) {
      const why = problemWith(f.type, !!f.required, values[f.name] ?? (f.type === "checkbox" ? false : ""));
      if (why) found[f.name] = why;
    }
    setErrors(found);
    const first = list.find((f) => found[f.name]);
    if (first) {
      root.current?.querySelector<HTMLElement>(`[data-field="${list.indexOf(first)}"] :is(input,textarea,select)`)?.focus();
      return;
    }
    setState("sending");
    const data: Record<string, string> = {};
    for (const f of list) {
      const v = values[f.name];
      if (f.type === "checkbox") data[f.name] = v ? "Yes" : "No";
      else if (String(v ?? "").trim()) data[f.name] = String(v).trim();
    }
    try {
      await apiClient.post("/api/v1/storefront/contact", {
        page_slug: window.location.pathname.replace(/^\//, ""),
        form_name: formName.trim() || "Contact form",
        data: { ...data, _gotcha: trap.current?.value ?? "" },
      }, { skipAuth: true });
      setState("done");
      setValues({});
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div data-b={id} className="b-form" style={style} ref={root}>
        <div className="b-form-done" role="status">
          <p>{success || "Thanks — we got your message and will get back to you soon."}</p>
          <button type="button" className="b-form-again" onClick={() => setState("idle")}>Send another message</button>
        </div>
      </div>
    );
  }

  return (
    <div data-b={id} className="b-form" style={style} ref={root}>
      <form onSubmit={submit} noValidate aria-label={formName || "Contact form"}>
        {/* Nobody sees or tabs to this; a bot that fills in every box fills this one too. */}
        <input ref={trap} type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="b-form-trap" />
        <div className="b-form-grid" inert={edit || undefined}>
          {list.map((f, i) => {
            const fid = `${id}-f${i}`;
            const err = errors[f.name];
            const common = {
              id: fid, name: f.name, className: "b-form-in", "aria-invalid": err ? true : undefined,
              "aria-describedby": err ? `${fid}-e` : undefined, required: !!f.required,
            } as const;
            const value = values[f.name];
            return (
              <div key={fid} className={`b-form-field${f.type === "checkbox" ? " b-form-check" : ""}`} data-w={f.width === "half" ? "half" : "full"} data-field={i}>
                {f.type === "checkbox" ? (
                  <label htmlFor={fid} className="b-form-tick">
                    <input {...common} className="b-form-box" type="checkbox" checked={!!value} onChange={(e) => set(f.name, e.target.checked)} />
                    <span>{f.label}{f.required && <span className="b-form-req" aria-hidden="true">*</span>}</span>
                  </label>
                ) : (
                  <>
                    <label htmlFor={fid} className="b-form-label">
                      {f.label}{f.required ? <span className="b-form-req" aria-hidden="true">*</span> : <span className="b-form-opt"> (optional)</span>}
                    </label>
                    {f.type === "textarea" ? (
                      <textarea {...common} rows={5} placeholder={f.placeholder || undefined} value={String(value ?? "")} onChange={(e) => set(f.name, e.target.value)} />
                    ) : f.type === "select" ? (
                      <select {...common} value={String(value ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                        <option value="">{f.placeholder || "Choose…"}</option>
                        {f.choices.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <input {...common} type={f.type} placeholder={f.placeholder || undefined} value={String(value ?? "")}
                             autoComplete={f.type === "email" ? "email" : f.type === "tel" ? "tel" : /name/i.test(f.label) ? "name" : undefined}
                             inputMode={f.type === "tel" ? "tel" : f.type === "number" ? "decimal" : undefined}
                             onChange={(e) => set(f.name, e.target.value)} />
                    )}
                  </>
                )}
                {err && <span id={`${fid}-e`} className="b-form-err" role="alert">{err}</span>}
              </div>
            );
          })}
          {!list.length && edit && <p className="b-form-empty">Add fields to this form in the panel on the right.</p>}
        </div>
        <div className="b-form-actions" data-full={buttonWidth === "full" ? "" : undefined}>
          <button type="submit" className="b-form-btn" disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : (button || "Send message")}
          </button>
        </div>
        {state === "error" && <p className="b-form-err" role="alert">That did not go through. Please try again in a moment.</p>}
      </form>
    </div>
  );
}
