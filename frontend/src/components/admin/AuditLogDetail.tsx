"use client";

interface Props {
  oldValues: string | null;
  newValues: string | null;
}

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function AuditLogDetail({ oldValues, newValues }: Props) {
  const old = parseJson(oldValues);
  const next = parseJson(newValues);

  if (!old && !next) {
    return <p className="text-sm text-gray-400 italic">No value data recorded.</p>;
  }

  const allKeys = Array.from(
    new Set([...Object.keys(old ?? {}), ...Object.keys(next ?? {})])
  );

  const changed = allKeys.filter(
    (k) => JSON.stringify((old ?? {})[k]) !== JSON.stringify((next ?? {})[k])
  );

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border border-gray-200 rounded">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            <th className="px-4 py-2 text-left">Field</th>
            <th className="px-4 py-2 text-left bg-red-50">Old Value</th>
            <th className="px-4 py-2 text-left bg-green-50">New Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {allKeys.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-3 text-gray-400 text-center">
                No fields to display.
              </td>
            </tr>
          ) : (
            allKeys.map((key) => {
              const oldVal = (old ?? {})[key];
              const newVal = (next ?? {})[key];
              const isChanged = JSON.stringify(oldVal) !== JSON.stringify(newVal);
              return (
                <tr key={key} className={isChanged ? "bg-yellow-50" : ""}>
                  <td className="px-4 py-2 font-mono text-xs font-semibold text-gray-700">
                    {key}
                    {isChanged && (
                      <span className="ml-1 text-orange-500">*</span>
                    )}
                  </td>
                  <td className="px-4 py-2 bg-red-50 text-red-800 font-mono text-xs">
                    {oldVal !== undefined ? JSON.stringify(oldVal) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2 bg-green-50 text-green-800 font-mono text-xs">
                    {newVal !== undefined ? JSON.stringify(newVal) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      {changed.length > 0 && (
        <p className="mt-2 text-xs text-gray-400">
          * {changed.length} field{changed.length !== 1 ? "s" : ""} changed
        </p>
      )}
    </div>
  );
}
