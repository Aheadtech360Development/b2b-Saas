"use client";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import type ReCAPTCHAType from "react-google-recaptcha";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";

const ReCAPTCHA = dynamic(() => import("react-google-recaptcha"), {
  ssr: false,
}) as typeof ReCAPTCHAType;
const USER_GROUPS = [
  "Admin",
  "Accounting",
  "Purchasing",
  "Promo Standards",
  "Users",
];

export default function ResendRegistrationEmailsPage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const recaptchaRef = useRef<any>(null);

  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  function toggleGroup(group: string) {
    setSelectedGroups(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!recaptchaToken) {
      setMessage({ type: "error", text: "Please complete the reCAPTCHA verification." });
      return;
    }

    if (selectedGroups.length === 0 && !to.trim()) {
      setMessage({ type: "error", text: "Please select at least one user group or enter a TO email." });
      return;
    }

    setSending(true);
    setMessage(null);

    try {
      const result = await apiClient.post<{ message: string; sent_count: number }>(
        "/api/v1/account/resend-registration-emails",
        {
          groups: selectedGroups,
          to,
          cc,
          bcc,
          recaptcha_token: recaptchaToken,
        }
      );
      setMessage({ type: "success", text: result.message });
      setSelectedGroups([]);
      setTo("");
      setCc("");
      setBcc("");
      setRecaptchaToken(null);
      recaptchaRef.current?.reset();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send emails.";
      setMessage({ type: "error", text: msg });
      recaptchaRef.current?.reset();
      setRecaptchaToken(null);
    } finally {
      setSending(false);
    }
  }

  if (isLoading) return <div className="py-12 text-center text-gray-400">Loading...</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Resend Registration Emails</h1>

      {message && (
        <div className={`px-4 py-3 rounded-md text-sm font-medium mb-6 ${
          message.type === "success"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">

        {/* User Groups */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">
            Select User Group(s) to Resend Registration Emails for:
          </p>
          <div className="space-y-2">
            {USER_GROUPS.map((group) => (
              <label key={group} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedGroups.includes(group)}
                  onChange={() => toggleGroup(group)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-700">{group}</span>
              </label>
            ))}
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* TO */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">TO:</label>
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="email@example.com, email2@example.com"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">Separate multiple emails with commas</p>
        </div>

        {/* CC */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CC:</label>
          <input
            type="text"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="email@example.com"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* BCC */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">BCC:</label>
          <input
            type="text"
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
            placeholder="email@example.com"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* reCAPTCHA */}
        <div>
          <ReCAPTCHA
            ref={recaptchaRef}
            sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? ""}
            onChange={(token) => setRecaptchaToken(token)}
            onExpired={() => setRecaptchaToken(null)}
          />
          {!recaptchaToken && (
            <p className="text-xs text-gray-400 mt-1">Please complete the verification above to send.</p>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sending || !recaptchaToken}
            className="px-6 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {sending ? "Sending..." : "Send Email(s)"}
          </button>
        </div>
      </form>
    </div>
  );
}
