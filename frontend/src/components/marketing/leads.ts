"use client";

/**
 * Where the marketing forms go.
 *
 *   Contact  → the app's own contact endpoint (POST /api/v1/contact), which
 *              emails the platform inbox — nothing new on the server.
 *   Demo,    → GoHighLevel, through this app's /api/marketing/lead, which
 *   Partners   holds the webhook addresses so they never reach the browser.
 */
import { useState, type FormEvent } from "react";
import { apiClient, ApiClientError } from "@/lib/api-client";

type Fields = Record<string, string>;

/** A form that shows its thank-you once it has been sent, and says so when it could not be. */
export function useLeadForm(send: (fields: Fields) => Promise<void>) {
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    const fields: Fields = {};
    new FormData(e.currentTarget).forEach((v, k) => {
      fields[k] = String(v).trim();
    });
    setSending(true);
    setError(null);
    try {
      await send(fields);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.message
          ? err.message
          : "We could not send that. Please try again, or email support@printcopilot.co.",
      );
    } finally {
      setSending(false);
    }
  }

  return { done, notDone: !done, submit, sending, error };
}

/** The contact form's topics, as the contact endpoint files them. */
const CONTACT_TOPICS: Record<string, string> = {
  Sales: "sales",
  Support: "support",
  Partnerships: "partnerships",
  Other: "other",
};

export async function sendContact(f: Fields): Promise<void> {
  await apiClient.post(
    "/api/v1/contact",
    {
      name: f.name,
      email: f.email,
      department: CONTACT_TOPICS[f.topic ?? ""] ?? "other",
      message: f.msg,
    },
    { skipAuth: true },
  );
}

/** A demo request or a partner application, on to GoHighLevel. */
export async function sendLead(form: "demo" | "partner", f: Fields): Promise<void> {
  const res = await fetch("/api/marketing/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ form, ...f }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiClientError(res.status, "LEAD_FAILED", body?.error ?? "");
  }
}
