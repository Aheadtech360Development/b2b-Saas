"use client";

/**
 * The shop's rewards program on its website (backend services/loyalty), as
 * three builder elements:
 *
 *   RewardsProgram  how points are earned and what they buy; Join and Log in
 *                   for a visitor, their own points once signed in
 *   ReferFriend     the refer-a-friend offer, with the customer's own link
 *   ProductPoints   what the product being viewed earns, following its price
 *                   as the customer picks options
 *
 * The server draws the program's numbers (data.loyalty), the same for every
 * visitor. What is a customer's own (their points, their link) is asked by
 * the browser once it knows who is reading, so the first paint matches the
 * server's signed-out page.
 */
import { useEffect, useRef, useState } from "react";
import { Coins } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import type { LoyaltyInfo } from "@/lib/builder/types";

export const REWARDS_HREF = "/account/rewards";
export const JOIN_HREF = `/create-account?next=${REWARDS_HREF}`;
export const LOGIN_HREF = `/login?next=${REWARDS_HREF}`;

/** "$5" or "$7.50". */
const dollars = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
const count = (n: number) => n.toLocaleString("en-US");

/** "1 point", "40 points": the shop names its points in the plural ("stars"),
 *  and one of them reads without the s ("bonus" and "class" keep theirs). */
export function unit(n: number, name: string): string {
  return `${count(n)} ${n === 1 && /[^su]s$/i.test(name) ? name.slice(0, -1) : name}`;
}

/** What a dollar earns, in the program's own words. */
export function earnLine(info: LoyaltyInfo): string {
  return `Earn ${unit(info.points_per_dollar, info.points_name)} for every $1 you spend, and turn them into money off your next order.`;
}

/** What a product at this price earns: rounded down, as an order is. */
export function pointsFor(price: number | null | undefined, perDollar: number): number {
  if (price === null || price === undefined || !Number.isFinite(price) || price <= 0) return 0;
  // In cents first: 4.35 * 100 is 434.99999 as a float, and the shop counts 435.
  return Math.floor((Math.round(price * 100) * perDollar) / 100);
}

/** The amount in a price line: "$1,250.00", "From $12.50". */
export function priceIn(text: string): number | null {
  const m = /\$\s?([\d,]+(?:\.\d+)?)/.exec(text);
  return m ? Number(m[1]!.replace(/,/g, "")) : null;
}

/** A customer, signed in, in the browser: not on the server, and not the shop's own staff. */
function useCustomer(edit?: boolean): boolean {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && !edit && !isLoading && !!user && !user.is_admin;
}

interface Summary {
  enabled: boolean;
  balance?: number;
  next_reward?: { points: number; reward: number; needed: number } | null;
}

export function RewardsProgram({
  id, info, heading, text, showSteps, showTiers, joinLabel, accountLabel, edit,
}: {
  id: string;
  info: LoyaltyInfo;
  heading: string;
  text: string;
  showSteps: boolean;
  showTiers: boolean;
  joinLabel: string;
  accountLabel: string;
  edit?: boolean;
}) {
  const customer = useCustomer(edit);
  const [mine, setMine] = useState<Summary | null>(null);
  useEffect(() => {
    if (!customer) { setMine(null); return; }
    let live = true;
    apiClient.get<Summary>("/api/v1/account/rewards/summary").then((s) => { if (live) setMine(s); }).catch(() => {});
    return () => { live = false; };
  }, [customer]);

  const name = info.points_name;
  const balance = mine?.enabled ? (mine.balance ?? 0) : null;
  return (
    <div data-b={id} className="b-loyal" data-state={balance !== null ? "in" : "out"}>
      <h2 className="b-heading b-loyal-title">{heading.trim() || info.program_name}</h2>
      <p className="b-loyal-lede">{text.trim() || earnLine(info)}</p>
      {showSteps && (
        <ol className="b-loyal-steps">
          <li><b>Join</b><span>Create a free account.</span></li>
          <li><b>Earn</b><span>{unit(info.points_per_dollar, name)} for every $1 you spend.</span></li>
          <li><b>Use</b><span>Turn your {name} into money off an order.</span></li>
        </ol>
      )}
      {showTiers && info.tiers.length > 0 && (
        <>
          <ul className="b-loyal-tiers">
            {info.tiers.map((t) => (
              <li key={t.points}><b>{dollars(t.reward)} off</b><span>{unit(t.points, name)}</span></li>
            ))}
          </ul>
          {info.expiry_months > 0 && (
            <p className="b-loyal-small">Unused {name} expire {info.expiry_months} {info.expiry_months === 1 ? "month" : "months"} after they are earned.</p>
          )}
        </>
      )}
      <div className="b-loyal-cta">
        {balance !== null ? (
          <>
            <p className="b-loyal-mine">
              <b>You have {unit(balance, name)}.</b>
              {mine?.next_reward ? ` ${count(mine.next_reward.needed)} more for ${dollars(mine.next_reward.reward)} off.` : ""}
            </p>
            <a className="b-btn b-btn-solid" href={REWARDS_HREF}>{accountLabel.trim() || "See my rewards"}</a>
          </>
        ) : (
          <>
            <a className="b-btn b-btn-solid" href={JOIN_HREF}>{joinLabel.trim() || "Join now"}</a>
            <a className="b-btn b-btn-outline" href={LOGIN_HREF}>Log in</a>
          </>
        )}
      </div>
    </div>
  );
}

export function ReferFriend({
  id, info, heading, text, buttonLabel, edit,
}: {
  id: string;
  info: LoyaltyInfo & { referral: NonNullable<LoyaltyInfo["referral"]> };
  heading: string;
  text: string;
  buttonLabel: string;
  edit?: boolean;
}) {
  const customer = useCustomer(edit);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!customer) { setLink(null); return; }
    let live = true;
    apiClient.get<{ referral?: { link: string } | null }>("/api/v1/account/rewards")
      .then((r) => { if (live) setLink(r.referral?.link ?? null); }).catch(() => {});
    return () => { live = false; };
  }, [customer]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch { /* the link is in the box, selected on focus, to copy by hand */ }
  }

  const name = info.points_name;
  const { friend_gets: friend, you_get: you } = info.referral;
  return (
    <div data-b={id} className="b-loyal b-loyal-ref" data-state={customer ? "in" : "out"}>
      <h2 className="b-heading b-loyal-title">{heading.trim() || "Give and get"}</h2>
      <p className="b-loyal-lede">
        {text.trim() || `Send a friend your link. When they sign up with it and their first order is paid, they get ${unit(friend, name)} and you get ${unit(you, name)}.`}
      </p>
      {customer ? (
        link && (
          <div className="b-loyal-link">
            <input className="b-input" readOnly value={link} aria-label="Your referral link" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="b-btn b-btn-solid" onClick={() => void copy()}>
              {copied ? "Copied" : buttonLabel.trim() || "Copy link"}
            </button>
          </div>
        )
      ) : (
        <div className="b-loyal-cta">
          <a className="b-btn b-btn-solid" href={LOGIN_HREF}>Log in to get your link</a>
          <a className="b-btn b-btn-outline" href={JOIN_HREF}>Create an account</a>
        </div>
      )}
    </div>
  );
}

export function ProductPoints({ id, info, price, edit }: { id: string; info: LoyaltyInfo; price: number | null; edit?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [amount, setAmount] = useState(price);
  // The buy box rewrites the price line as options and quantity change
  // (ThemeProductBuy); what this purchase earns follows it.
  useEffect(() => {
    if (edit) return;
    const root = ref.current?.closest("[data-product-id]") ?? document;
    const line = root.querySelector<HTMLElement>("[data-theme-price]");
    if (!line) return;
    const read = () => { const v = priceIn(line.textContent ?? ""); if (v !== null) setAmount(v); };
    const watch = new MutationObserver(read);
    watch.observe(line, { childList: true, characterData: true, subtree: true });
    return () => watch.disconnect();
  }, [edit]);

  const points = pointsFor(amount, info.points_per_dollar);
  return (
    <p data-b={id} ref={ref} className="b-loyal-earn" hidden={!points || undefined}>
      <Coins size={16} aria-hidden /> Earn <b>{unit(points, info.points_name)}</b> with this purchase.
    </p>
  );
}
