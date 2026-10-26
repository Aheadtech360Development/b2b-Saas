"use client";

/**
 * Account, Security: changing the password. The site's one password rule
 * (lib/passwordRule), the same the server holds; the shop emails the buyer
 * when it changes.
 */
import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { PASSWORD_HINT, PASSWORD_MIN } from "@/lib/passwordRule";
import { AccountTabs } from "@/components/portal/AccountTabs";
import { Banner, PageHead } from "@/components/portal/ui";

type Field = "current_password" | "new_password" | "confirm_password";

export default function ChangePasswordPage() {
  const [form, setForm] = useState<Record<Field, string>>({ current_password: "", new_password: "", confirm_password: "" });
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  function validate() {
    const errs: Partial<Record<Field, string>> = {};
    if (!form.current_password) errs.current_password = "Your current password is needed.";
    if (!form.new_password) errs.new_password = "Choose a new password.";
    else if (form.new_password.length < PASSWORD_MIN) errs.new_password = `At least ${PASSWORD_MIN} characters.`;
    else if (form.new_password === form.current_password) errs.new_password = "Choose a password different from the current one.";
    if (form.new_password && form.confirm_password !== form.new_password) errs.confirm_password = "The two new passwords do not match.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiClient.patch("/api/v1/account/change-password", {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      setMessage({ tone: "ok", text: "Password changed. A confirmation email is on its way." });
      setForm({ current_password: "", new_password: "", confirm_password: "" });
      setErrors({});
    } catch (err: unknown) {
      const apiErr = err as { status?: number; code?: string };
      if (apiErr?.status === 400 || apiErr?.code === "VALIDATION_ERROR") {
        setErrors({ current_password: "That is not your current password." });
      } else {
        setMessage({ tone: "bad", text: "Your password could not be changed. Please try again." });
      }
    } finally {
      setSaving(false);
    }
  }

  const input = (k: Field, label: string, auto: string, hint?: string) => (
    <div className="cp-field">
      <label className="cp-label" htmlFor={`pw-${k}`}>{label}</label>
      <input id={`pw-${k}`} className="cp-input" type={show ? "text" : "password"} autoComplete={auto}
        value={form[k]} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `pw-${k}-err` : undefined}
        onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} />
      {errors[k] ? <span id={`pw-${k}-err`} className="cp-hint" style={{ color: "var(--cp-bad)" }}>{errors[k]}</span>
        : hint ? <span className="cp-hint">{hint}</span> : null}
    </div>
  );

  return (
    <>
      <PageHead eyebrow="Account" title="Security" sub="Your password." />
      <AccountTabs />
      <form onSubmit={submit} className="cp-card cp-pad cp-stack-sm" style={{ gap: 16, maxWidth: 560 }} noValidate>
        <h2 className="cp-h2">Change password</h2>
        {message && <Banner tone={message.tone}>{message.text}</Banner>}
        {input("current_password", "Current password", "current-password")}
        {input("new_password", "New password", "new-password", PASSWORD_HINT)}
        {input("confirm_password", "New password again", "new-password")}
        <label className="cp-check">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show passwords
        </label>
        <div className="cp-actions" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="cp-btn cp-btn-p" disabled={saving}>{saving ? "Saving…" : "Change password"}</button>
        </div>
      </form>
    </>
  );
}
