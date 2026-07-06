"use client";

import { useEffect, useState } from "react";
import { adminService } from "@/services/admin.service";
import { EmailTemplateEditor } from "@/components/admin/EmailTemplateEditor";

interface EmailTemplate {
  id: string;
  trigger_event: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  is_active: boolean;
  available_variables: string | null;
}

export default function AdminEmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const data = await adminService.listEmailTemplates() as EmailTemplate[];
      setTemplates(data);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function handleSaved(updated: EmailTemplate) {
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditing(null);
  }

  if (editing) {
    return (
      <div className="p-6 max-w-3xl">
        <button
          onClick={() => setEditing(null)}
          className="text-sm text-brand-600 hover:text-brand-800 mb-4 block"
        >
          ← Back to Templates
        </button>
        <EmailTemplateEditor
          template={editing}
          onSaved={handleSaved}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Email Templates</h1>
        <span className="text-sm text-gray-500">{templates.length} templates</span>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Template</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Trigger Event</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Subject</th>
              <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && templates.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#bbb", fontSize: "14px" }}>Loading…</td></tr>
            ) : templates.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-gray-400">No templates found</td></tr>
            ) : (
              templates.map((t) => (
                <tr key={t.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.trigger_event}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{t.subject}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${t.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {t.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditing(t)}
                      className="text-xs text-brand-600 hover:text-brand-800"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
