"use client";

import { useEffect, useState } from "react";

import { usePartner } from "@/components/partners/PartnerShell";
import { Banner, Chip, Icon, Skeleton, errorText, useToast } from "@/components/partners/ui";
import { day, papi, partnerDownload } from "@/lib/partnerApi";

type Terms = {
  latest: { version: number; clauses: { title: string; text: string }[]; changes: string | null; published_at: string } | null;
  accepted_version: number | null;
  needs_acceptance: boolean;
  history: { version: number; published_at: string; changes: string | null; accepted_at: string | null }[];
};

export default function TermsPage() {
  const { partner, reload } = usePartner();
  const [data, setData] = useState<Terms | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = () => papi<Terms>("/partners/me/terms").then(setData).catch((e) => setError(errorText(e)));
  useEffect(() => { void load(); }, []);

  async function accept() {
    if (!data?.latest) return;
    setBusy(true);
    try {
      await papi("/partners/me/terms/accept", { body: { version: data.latest.version } });
      toast.show(`Version ${data.latest.version} accepted`);
      setTicked(false);
      await Promise.all([load(), reload()]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Banner tone="bad">{error}</Banner>;
  if (!data) return <><Skeleton h={34} w={220} /><Skeleton h={420} /></>;
  const t = data.latest;
  if (!t) return <Banner>No partner terms have been published yet.</Banner>;
  const first = data.history[data.history.length - 1]?.version;

  return (
    <>
      <div className="ph">
        <div>
          <h1>Partner terms</h1>
          <p>What you agreed to, and when.</p>
        </div>
        <button className="btn" onClick={() => partnerDownload(`/partners/me/terms/${t.version}.pdf`, `partner-terms-v${t.version}.pdf`)}>
          <Icon name="download" />Download PDF
        </button>
      </div>

      {data.needs_acceptance ? (
        <Banner tone="warn" icon="file">
          Version {t.version} was published on {day(t.published_at)}. Accept it to keep earning on new referrals.
          Commission you already earned is never reduced.
        </Banner>
      ) : null}

      <div className="split">
        <section className="card">
          <div className="card-h">
            <h2>Partner terms, version {t.version}</h2>
            {data.needs_acceptance ? <Chip tone="warn">Needs your OK</Chip> : <Chip tone="ok">Accepted</Chip>}
          </div>
          {t.clauses.map((c, i) => (
            <div className="sec" key={i}>
              <h3>{i + 1}. {c.title}</h3>
              <p style={{ marginTop: 6 }}>{c.text}</p>
            </div>
          ))}
          {data.needs_acceptance ? (
            <div className="sec col" style={{ background: "var(--soft)" }}>
              <h3>Accept version {t.version}</h3>
              <label className="chk">
                <input type="checkbox" checked={ticked} disabled={partner.read_only} onChange={(e) => setTicked(e.target.checked)} />
                I have read and accept the partner terms, version {t.version}.
              </label>
              <div className="row">
                <button className="btn pri" disabled={!ticked || busy || partner.read_only} onClick={accept}>Accept and continue</button>
                <span className="hint">The button turns on once you tick the box.</span>
              </div>
            </div>
          ) : null}
        </section>

        <div className="col">
          <section className="card">
            <div className="card-h"><h2>Acceptance history</h2></div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {data.history.map((h) => (
                <li key={h.version} className="sec" style={{ padding: "14px 24px" }}>
                  <div className="b ink">Version {h.version}, {h.accepted_at ? `accepted ${day(h.accepted_at, true)}` : `published ${day(h.published_at, true)}`}</div>
                  <div className="sm muted">
                    {h.accepted_at
                      ? h.version === first ? "At signup. Applies to everything earned so far." : "Applies to referrals made after it."
                      : (data.accepted_version ?? 0) < h.version ? "Waiting for you" : "Published before you joined"}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {t.changes && t.version > 1 ? (
            <section className="card">
              <div className="card-h"><h2>What changed in version {t.version}</h2></div>
              <p className="pad" style={{ whiteSpace: "pre-wrap" }}>{t.changes}</p>
            </section>
          ) : null}
        </div>
      </div>
      {toast.node}
    </>
  );
}
