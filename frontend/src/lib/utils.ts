// frontend/src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind CSS classes safely. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as USD currency. */
export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Format an ISO date string as a readable date. */
export function formatDate(iso: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  });
}

/** Convert a string to a URL-safe slug. */
export function toSlug(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Apply a discount percentage to a price. Returns rounded to 2 decimal places. */
export function applyDiscount(price: number, discountPercent: number): number {
  return Math.round(price * (1 - discountPercent / 100) * 100) / 100;
}

/** Calculate a line total: quantity × unit price. */
export function lineTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100;
}

/** Truncate a string to maxLength and add ellipsis. */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength).trimEnd() + "…";
}

/** Get initials from a full name. */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** The common adult letter sizes, smallest first. Ordering goes through sizeRank. */
export const SIZE_ORDER = ['XXS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'];

// ── Size order ───────────────────────────────────────────────────────────────
// Where a size sits on a size chart, the same rule as the backend's
// app/services/size_order.py, so the shop shows XS, S, M, L, XL wherever it
// lists sizes. A short list of letters left out XXL, Small, X-Large, youth and
// numbered sizes, and sorted the rest alphabetically (L, M, S, XL, XS).
const SIZE_WORDS: Record<string, string> = {
  EXTRASMALL: 'XS', XSMALL: 'XS', XXSMALL: 'XXS', SMALL: 'S', SM: 'S',
  MEDIUM: 'M', MED: 'M', MD: 'M',
  LARGE: 'L', LG: 'L', XLARGE: 'XL', EXTRALARGE: 'XL',
  XXLARGE: 'XXL', '2XLARGE': 'XXL', XXXLARGE: 'XXXL', '3XLARGE': 'XXXL', '4XLARGE': 'XXXXL',
};
const ONE_SIZE = new Set(['OS', 'O/S', 'OSFA', 'OSFM', 'ONESIZE', 'ONESIZEFITSALL', 'ONESIZEFITSMOST', 'ONE']);
const MONTHS = '(?:M|MO|MOS|MONTH|MONTHS)';
// Groups, in chart order: infant, toddler, youth, adult, numbers, one size.
const INFANT = 0, TODDLER = 1, YOUTH = 2, ADULT = 3, NUMBER = 4, ONE = 5;

/** S = 0, M = 1, L = 2; each X before S goes down one, before L up one. */
function letterRank(code: string): number | null {
  let c = code;
  const times = /^(\d)X(S|L)?$/.exec(c);
  if (times) c = 'X'.repeat(Number(times[1])) + (times[2] || 'L');
  c = SIZE_WORDS[c] ?? c;
  const m = /^(X*)(S|M|L)$/.exec(c);
  if (!m) return null;
  const xs = (m[1] ?? '').length;
  if (m[2] === 'M') return xs === 0 ? 1 : null;
  return m[2] === 'S' ? -xs : 2 + xs;
}

/** Where a size sits on the chart, or null for one it does not know. */
export function sizeRank(label?: string | null): [number, number, number] | null {
  const raw = (label ?? '').trim().toUpperCase().replace(/\s+/g, ' ').replace(/–/g, '-');
  if (!raw) return null;
  // The same size however it is written: "X-Large", "2 XL", "M (Youth)".
  const code = raw.replace(/[\s\-_()]/g, '');
  if (ONE_SIZE.has(code)) return [ONE, 0, 0];

  if (['NB', 'NEWBORN', 'PREEMIE'].includes(code)) return [INFANT, -1, 0];
  let m = new RegExp(`^(\\d+)\\s*(?:-|/|TO)\\s*(\\d+)\\s*${MONTHS}$`).exec(raw)
    ?? new RegExp(`^(\\d+)\\s*${MONTHS}$`).exec(raw);
  if (m) {
    const first = Number(m[1]);
    return [INFANT, first, m[2] !== undefined ? Number(m[2]) : first];
  }
  m = /^(\d+)T$/.exec(code);
  if (m) return [TODDLER, Number(m[1]), 0];

  m = /^(\d+(?:\.\d+)?)\s*(?:-|\/)\s*(\d+(?:\.\d+)?)$/.exec(raw);
  if (m) return [NUMBER, Number(m[1]), Number(m[2])];
  m = /^(\d+(?:\.\d+)?)(?:\s*X\s*(\d+(?:\.\d+)?))?$/.exec(raw);
  if (m) return [NUMBER, Number(m[1]), m[2] !== undefined ? Number(m[2]) : 0];

  if (code.includes('YOUTH') || (code.startsWith('Y') && code.length > 1)) {
    const rest = code.includes('YOUTH') ? code.replace('YOUTH', '') : code.slice(1);
    const rank = letterRank(rest);
    if (rank !== null) return [YOUTH, rank, 0];
    if (/^\d+(?:\.\d+)?$/.test(rest)) return [YOUTH, 10 + Number(rest), 0];
  }

  const rank = letterRank(code);
  if (rank !== null) return [ADULT, rank, 0];
  for (const tall of ['TALL', 'T']) {
    if (code.endsWith(tall)) {
      const base = letterRank(code.slice(0, -tall.length));
      if (base !== null) return [ADULT, base, 0.5];
    }
  }
  if (code.includes('/')) {
    const parts = code.split('/').filter(Boolean).map(letterRank);
    if (parts.length === 2 && parts[0] != null && parts[1] != null) return [ADULT, (parts[0] + parts[1]) / 2, 0];
  }
  return null;
}

/** For Array.sort: known sizes on the chart, unknown ones after them in the
 *  order they came (the sort is stable). */
export function compareSizes(a?: string | null, b?: string | null): number {
  const ra = sizeRank(a);
  const rb = sizeRank(b);
  if (ra && rb) return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
  if (ra) return -1;
  if (rb) return 1;
  return 0;
}

export function sortSizes<T>(items: T[], getSize: (item: T) => string): T[] {
  return [...items].sort((a, b) => compareSizes(getSize(a), getSize(b)));
}

export function sortVariantsBySize<T extends { size?: string | null }>(variants: T[]): T[] {
  return [...variants].sort((a, b) => compareSizes(a.size, b.size));
}
