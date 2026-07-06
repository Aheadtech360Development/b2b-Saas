interface MOQWarningProps {
  sku: string;
  required: number;
  current: number;
}

export function MOQWarning({ sku, required, current }: MOQWarningProps) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
      <svg
        className="w-4 h-4 flex-shrink-0 mt-0.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01M12 4a8 8 0 100 16A8 8 0 0012 4z"
        />
      </svg>
      <span>
        <span className="font-semibold">{sku}</span>: minimum {required} units required,
        currently {current}.
      </span>
    </div>
  );
}
