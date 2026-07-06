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

export const SIZE_ORDER = ['XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'];

export function sortSizes<T>(items: T[], getSize: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(getSize(a).toUpperCase());
    const bi = SIZE_ORDER.indexOf(getSize(b).toUpperCase());
    if (ai === -1 && bi === -1) return getSize(a).localeCompare(getSize(b));
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export function sortVariantsBySize<T extends { size?: string | null }>(variants: T[]): T[] {
  return [...variants].sort((a, b) => {
    const as = (a.size || '').toUpperCase();
    const bs = (b.size || '').toUpperCase();
    const ai = SIZE_ORDER.indexOf(as);
    const bi = SIZE_ORDER.indexOf(bs);
    if (ai === -1 && bi === -1) return as.localeCompare(bs);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
