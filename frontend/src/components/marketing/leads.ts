"use client";

/**
 * Where the marketing forms go: all of it to our own backend and database.
 *
 *   Contact   → POST /api/v1/contact, which emails the platform inbox and, sent
 *               from printcopilot.co, keeps the message for the console's Leads.
 *   Demo      → POST /api/v1/leads: kept in platform_leads (the console's Leads)
 *               and emailed to the platform team.
 *   Affiliate → the partner program itself (POST /api/v1/partners/apply), from
 *               pages/Partners.tsx: the same application /partners takes.
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
      // The form's hidden field for bots; people leave it empty.
      company_hp: f.hp_note ?? "",
    },
    { skipAuth: true },
  );
}

/** A demo request, kept in our database for the platform console's Leads. */
export async function sendDemo(f: Fields): Promise<void> {
  await apiClient.post(
    "/api/v1/leads",
    {
      kind: "demo",
      name: f.name,
      email: f.email,
      data: {
        business_name: f.biz ?? "",
        business_type: f.type ?? "",
        country: f.country ?? "",
        message: f.sell ?? "",
      },
      // The form's hidden field for bots; people leave it empty.
      company: f.hp_note ?? "",
    },
    { skipAuth: true },
  );
}
