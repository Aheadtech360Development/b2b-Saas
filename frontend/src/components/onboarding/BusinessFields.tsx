"use client";

/**
 * Step 1, "What do you run?" (design screen 7): the business type tiles, its
 * name and its country. Drawn the same before the shop exists (the sign-up's
 * second screen) and after (going back to step 1 from the admin).
 */
import type { ReactNode } from "react";
import { ui } from "@/components/auth/AuthPage";
import { COUNTRIES } from "@/lib/countries";
import { BUSINESS_TYPES } from "@/services/onboarding.service";
import o from "./onboarding.module.css";

export function BusinessFields({
  type,
  onType,
  name,
  onName,
  country,
  onCountry,
  nameHint,
}: {
  type: string | null;
  onType: (key: string) => void;
  name: string;
  onName: (value: string) => void;
  country: string;
  onCountry: (code: string) => void;
  /** Under the name: the shop's address while it is being made. */
  nameHint?: ReactNode;
}) {
  return (
    <>
      <div className={o.tiles} role="radiogroup" aria-label="What do you run?">
        {BUSINESS_TYPES.map((t, i) => (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={type === t.key}
            className={`${o.tile} ${type === t.key ? o.tileOn : ""} ${i === BUSINESS_TYPES.length - 1 ? o.tileWide : ""}`}
            onClick={() => onType(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={ui.row2}>
        <div className={ui.field}>
          <label htmlFor="ob-name" className={ui.label}>Business name</label>
          <input id="ob-name" className={ui.input} value={name} maxLength={120} autoComplete="organization"
            onChange={(e) => onName(e.target.value)} />
          {nameHint}
        </div>
        <div className={ui.field}>
          <label htmlFor="ob-country" className={ui.label}>Country</label>
          <select id="ob-country" className={ui.input} value={country} autoComplete="country"
            onChange={(e) => onCountry(e.target.value)}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
      </div>
    </>
  );
}

export default BusinessFields;
