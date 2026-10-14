"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { usePartner } from "@/components/partners/PartnerShell";
import { METHODS } from "@/components/partners/states";
import { Banner, Chip, Empty, Icon, Skeleton, errorText } from "@/components/partners/ui";
import { day, money, moneyShort, papi, partnerDownload } from "@/lib/partnerApi";

type Payouts = {
  balances: { pending: number; payable: number; clawbacks: number };
  paid_count: number; paid_cents: number; minimum_cents: number; hold_days: number;
  readiness: { state: string; words: string };
  method: keyof typeof METHODS | null; account: string | null; has_w9: boolean;
  history: { id: string; paid_on: string; amount_cents: number; method: keyof typeof METHODS; reference: string | null; lines: number }[];
  yearly: { year: number; cents: number }[];
};

export default function PayoutsPage() {
  const { partner } = usePartner();
  const [data, setData] = useState<Payouts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    papi<Payouts>("/partners/me/payouts").then(setData).catch((e) => setError(errorText(e)));
  }, []);

  if (error) return <Banner tone="bad">{error}</Banner>;
  if (!data) return <><Skeleton h={34} w={260} /><div className="g3">{[0, 1, 2].map((i) => <Skeleton key={i} h={110} />)}</div><Skeleton h={240} /></>;

  const b = data.balances;
  const above = b.payable >= data.minimum_cents && data.minimum_cents > 0;
  const progress = data.minimum_cents ? Math.min(100, Math.max(0, (b.payable / data.minimum_cents) * 100)) : 100;

  return (
    <>
      <div className="ph">
        <div>
          <h1>Payouts and statements</h1>
          <p>Payouts are recorded by the PrintCoPilot team. You get an email and a statement each time.</p>
        </div>
      </div>

      {!data.has_w9 ? (
        <Banner tone="warn" icon="file" action={partner.read_only ? undefined : <Link className="btn sm" href="/partners/settings#w9">Upload W-9</Link>}>
          <b>W-9 missing.</b> Add your W-9 to be paid. We cannot record a payout until it is on file.
        </Banner>
      ) : null}

      <div className="g3">
        <div className="card tile dark">
          <span className="k"><Icon name="wallet" size="s" />Payable now</span>
          <span className="v">{money(b.payable)}</span>
          <span className="s">Net of clawbacks</span>
        </div>
        <div className="card tile">
          <span className="k"><Icon name="clock" size="s" />Pending</span>
          <span className="v">{money(b.pending)}</span>
          <span className="s">Still inside the {data.hold_days} day hold</span>
        </div>
        <div className="card tile">
          <span className="k"><Icon name="scale" size="s" />Minimum payout</span>
          <span className="v">{moneyShort(data.minimum_cents)}</span>
          <span className="s">Smaller balances roll over</span>
        </div>
      </div>

      <div className="split">
        <section className="card">
          <div className="card-h">
            <h2>Where you stand</h2>
            {above ? <Chip tone="ok">Above minimum</Chip> : <Chip tone="warn">Rolls over</Chip>}
          </div>
          <div className="pad col">
            <p className="b ink">Payable {money(b.payable)} of {moneyShort(data.minimum_cents)} minimum</p>
            <div className="prog" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
              <i style={{ width: `${progress}%` }} />
            </div>
            <p className="sm muted">
              {above
                ? "When your payable balance is above the minimum, it is included in the next batch. Each refund or dispute is netted from the next payout."
                : `Smaller balances roll over. You will be included in the first batch after you reach ${moneyShort(data.minimum_cents)}.`}
            </p>
          </div>
        </section>
        <section className="card">
          <div className="card-h"><h2>Payout details</h2></div>
          <div className="pad col">
            <dl className="kv">
              <dt>Method</dt><dd>{data.method ? METHODS[data.method] : "Not set"}</dd>
              <dt>Account</dt><dd>{data.account ?? "Not set"}</dd>
              <dt>W-9</dt><dd>{data.has_w9 ? <Chip tone="ok">On file</Chip> : <Chip tone="warn">Missing</Chip>}</dd>
            </dl>
            {!partner.read_only ? (
              <Link className="btn sm" href="/partners/settings#payout" style={{ alignSelf: "flex-start" }}>
                <Icon name="edit" size="s" />Edit payout details
              </Link>
            ) : null}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-h">
          <h2>Payout history</h2>
          <span className="sm muted">{data.history.length} payout{data.history.length === 1 ? "" : "s"}</span>
        </div>
        {data.history.length === 0 ? (
          <div className="pad"><Empty icon="wallet" title="No payouts yet">
            Your first payout shows here once your payable balance reaches {moneyShort(data.minimum_cents)} and a batch is paid.
          </Empty></div>
        ) : (
          <div className="tw">
            <table className="tbl stk">
              <thead>
                <tr><th>Paid on</th><th className="num">Amount</th><th>Method</th><th>Reference</th><th className="num">Lines</th><th>Statement</th></tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id}>
                    <td className="ink" data-l="Paid on">{day(h.paid_on, true)}</td>
                    <td className="num b" data-l="Amount">{money(h.amount_cents)}</td>
                    <td data-l="Method">{METHODS[h.method] ?? h.method}</td>
                    <td className="mono" data-l="Reference">{h.reference ?? ""}</td>
                    <td className="num" data-l="Lines">{h.lines}</td>
                    <td data-l="Statement">
                      <button className="btn sm" onClick={() => partnerDownload(`/partners/me/payouts/${h.id}/statement.pdf`, `statement-${h.paid_on}.pdf`)}>
                        <Icon name="download" size="s" />PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="tfoot">
          <span>Paid to date <b className="ink">{money(data.paid_cents)}</b></span>
          <span>Yearly totals for your tax records are on the statement.</span>
        </div>
      </section>

      {data.yearly.length ? (
        <section className="card">
          <div className="card-h"><h2>Paid by year</h2></div>
          <div className="tw">
            <table className="tbl">
              <thead><tr><th>Year</th><th className="num">Paid</th></tr></thead>
              <tbody>{data.yearly.map((y) => <tr key={y.year}><td className="ink">{y.year}</td><td className="num b">{money(y.cents)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="card-h"><h2>How a payout happens</h2></div>
        <div className="pad">
          <div className="steps">
            {["Commission earned", `${data.hold_days} day hold ends`, "Added to a batch", "Paid outside the system", "Statement emailed"]
              .map((t, i) => <span className="step on" key={t}><b>{i + 1}</b>{t}</span>)}
          </div>
        </div>
      </section>
    </>
  );
}
