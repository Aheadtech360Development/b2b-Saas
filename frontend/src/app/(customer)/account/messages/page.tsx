"use client";

import { useEffect, useState } from "react";
import { accountService } from "@/services/account.service";

interface Message {
  id: string;
  subject: string;
  body: string;
  is_read_by_company: boolean;
  created_at: string;
}

export default function AccountMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    accountService.getMessages().then((d) => setMessages(d as Message[]));
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setIsSending(true);
    try {
      const msg = await accountService.sendMessage({ subject, body }) as Message;
      setMessages((prev) => [msg, ...prev]);
      setSubject(""); setBody(""); setShowForm(false);
    } finally { setIsSending(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Messages</h1>
        <button onClick={() => setShowForm(true)} className="bg-brand-600 text-white rounded-md px-3 py-1.5 text-sm hover:bg-brand-700">
          New Message
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
          <form onSubmit={handleSend} className="space-y-3">
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your message…" required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={isSending} className="bg-brand-600 text-white rounded-md px-4 py-1.5 text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                {isSending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No messages</p>
        ) : messages.map((m) => (
          <div key={m.id} className={`bg-white rounded-lg border p-4 ${m.is_read_by_company ? "border-gray-200" : "border-brand-200 bg-brand-50"}`}>
            <p className="text-sm font-medium text-gray-900">{m.subject}</p>
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{m.body}</p>
            <p className="text-xs text-gray-400 mt-2">{new Date(m.created_at).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
