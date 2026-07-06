"use client";

import { useState } from "react";
import { adminService } from "@/services/admin.service";

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

interface EmailTemplateEditorProps {
  template: EmailTemplate;
  onSaved: (updated: EmailTemplate) => void;
  onCancel: () => void;
}

export function EmailTemplateEditor({ template, onSaved, onCancel }: EmailTemplateEditorProps) {
  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.body_html);
  const [bodyText, setBodyText] = useState(template.body_text ?? "");
  const [isActive, setIsActive] = useState(template.is_active);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableVars: string[] = (() => {
    try {
      return template.available_variables ? JSON.parse(template.available_variables) : [];
    } catch {
      return [];
    }
  })();

  function insertVariable(varName: string) {
    setBodyHtml((prev) => prev + `{{ ${varName} }}`);
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await adminService.updateEmailTemplate(template.id, {
        subject,
        body_html: bodyHtml,
        body_text: bodyText || null,
        is_active: isActive,
      }) as EmailTemplate;
      onSaved(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePreview() {
    setIsPreviewing(true);
    setError(null);
    try {
      const result = await adminService.previewEmailTemplate(template.id, {}) as { body_html: string };
      setPreviewHtml(result.body_html);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setIsPreviewing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">{template.name}</h2>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded"
          />
          Active
        </label>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {availableVars.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Insert variable:</p>
          <div className="flex flex-wrap gap-1">
            {availableVars.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded border border-gray-200 hover:bg-gray-200 font-mono"
              >
                {`{{ ${v} }}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-500 mb-1">HTML Body</label>
        <textarea
          rows={12}
          value={bodyHtml}
          onChange={(e) => setBodyHtml(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Plain Text Body (optional)</label>
        <textarea
          rows={4}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {previewHtml && (
        <div className="border border-gray-200 rounded-md p-4">
          <p className="text-xs text-gray-500 mb-2 font-medium">Preview</p>
          <div
            className="text-sm text-gray-800"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      )}

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="border border-gray-300 rounded-md px-4 py-2 text-sm hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPreviewing}
          className="border border-brand-300 text-brand-700 rounded-md px-4 py-2 text-sm hover:bg-brand-50"
        >
          {isPreviewing ? "Loading…" : "Preview"}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="bg-brand-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save Template"}
        </button>
      </div>
    </div>
  );
}
