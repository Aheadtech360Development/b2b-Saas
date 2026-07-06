"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { accountService } from "@/services/account.service";

interface Template {
  id: string;
  name: string;
  item_count: number;
  created_at: string;
}

export default function AccountTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    accountService.getTemplates().then((d) => setTemplates(d as Template[]));
  }, []);

  async function handleLoad(id: string) {
    setLoadingId(id);
    try {
      await accountService.loadTemplate(id);
      router.push("/cart");
    } finally { setLoadingId(null); }
  }

  async function handleDelete(id: string) {
    await accountService.deleteTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">Order Templates</h1>
      <p className="text-sm text-gray-500 mb-4">Saved order templates let you quickly reorder common product combinations.</p>

      {templates.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No templates saved yet. Add items to cart and click "Save as Template".</p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-400">{t.item_count} item{t.item_count !== 1 ? "s" : ""} · Saved {new Date(t.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleLoad(t.id)}
                  disabled={!!loadingId}
                  className="bg-brand-600 text-white rounded-md px-3 py-1.5 text-xs font-medium hover:bg-brand-700 disabled:opacity-50"
                >
                  {loadingId === t.id ? "Loading…" : "Load to Cart"}
                </button>
                <button onClick={() => handleDelete(t.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
