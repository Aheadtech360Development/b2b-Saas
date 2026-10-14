"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { usePartner } from "@/components/partners/PartnerShell";
import { Banner, Field, Icon, Skeleton, copyText, errorText, useToast } from "@/components/partners/ui";
import { papi, partnerDownload } from "@/lib/partnerApi";

type LinkPage = {
  link: string; code: string; link_active: boolean; clicks_30: number; signups_30: number;
  conversion: number | null; cookie_days: number;
  captions: { title: string; text: string }[];
  banners: { id: string; title: string; width: number | null; height: number | null; mime: string }[];
};

function tagged(link: string, src: string) {
  const tag = src.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 60);
  return tag ? `${link}&src=${tag}` : link;
}

/** An image the API serves only to a signed-in partner, shown from memory. */
function useAuthedImage(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let made: string | null = null;
    papi<Blob>(path, { blob: true })
      .then((b) => { made = URL.createObjectURL(b); setUrl(made); })
      .catch(() => setUrl(null));
    return () => { if (made) URL.revokeObjectURL(made); };
  }, [path]);
  return url;
}

function BannerCard({ id, title, width, height }: { id: string; title: string; width: number | null; height: number | null }) {
  const url = useAuthedImage(`/partners/me/assets/${id}`);
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="imgph" style={{ borderRadius: 0, border: 0, minHeight: 120, padding: 0 }}>
        {url ? <img src={url} alt={title} style={{ maxWidth: "100%", maxHeight: 160, display: "block" }} /> : "Loading"}
      </div>
      <div className="row pad-s" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="b ink sm">{title}</div>
          {width && height ? <div className="xs muted">{width} x {height}</div> : null}
        </div>
        <button className="btn sm" onClick={() => partnerDownload(`/partners/me/assets/${id}`, title)}>
          <Icon name="download" size="s" />Download
        </button>
      </div>
    </div>
  );
}

export default function LinkPageView() {
  const { partner } = usePartner();
  const [data, setData] = useState<LinkPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [src, setSrc] = useState("");
  const toast = useToast();

  useEffect(() => {
    papi<LinkPage>("/partners/me/link").then(setData).catch((e) => setError(errorText(e)));
  }, []);

  const link = useMemo(() => tagged(data?.link ?? partner.link, src), [data, partner.link, src]);
  const qrPath = useMemo(() => `/partners/me/qr.svg${src.trim() ? `?src=${encodeURIComponent(src.trim())}` : ""}`, [src]);
  const qr = useAuthedImage(qrPath);

  async function copy(value: string, what: string) {
    toast.show((await copyText(value)) ? `${what} copied` : "Could not copy. Select it and copy it.");
  }

  if (error) return <Banner tone="bad">{error}</Banner>;
  if (!data) return <><Skeleton h={34} w={220} /><div className="g3">{[0, 1, 2].map((i) => <Skeleton key={i} h={110} />)}</div><Skeleton h={300} /></>;

  const share = data.captions[1]?.text ?? data.captions[0]?.text ?? "";
  const mail = `mailto:?subject=${encodeURIComponent("PrintCoPilot for print shops")}&body=${encodeURIComponent(share.replace("[YOUR LINK]", link).replace("[NAME]", ""))}`;
  const sms = `sms:?&body=${encodeURIComponent(`PrintCoPilot for print shops, free trial: ${link} (affiliate link, I earn a commission)`)}`;

  return (
    <>
      <div className="ph">
        <div>
          <h1>Link and assets</h1>
          <p>Everything you need to share PrintCoPilot.</p>
        </div>
      </div>

      {!data.link_active ? (
        <Banner tone="warn" icon="pause">
          Your link is not tracking new shops right now. Shops you already referred keep earning for you.
        </Banner>
      ) : null}

      <div className="g3">
        <div className="card tile">
          <span className="k"><Icon name="arrow" size="s" />Link clicks, 30 days</span>
          <span className="v">{data.clicks_30}</span>
          <span className="s">The same visitor counts once a day</span>
        </div>
        <div className="card tile">
          <span className="k"><Icon name="users" size="s" />Signups, 30 days</span>
          <span className="v">{data.signups_30}</span>
          <span className="s">From link or code</span>
        </div>
        <div className="card tile">
          <span className="k"><Icon name="percent" size="s" />Click to signup</span>
          <span className="v">{data.conversion === null ? "None yet" : `${data.conversion}%`}</span>
          <span className="s">{data.signups_30} of {data.clicks_30}</span>
        </div>
      </div>

      <div className="split">
        <section className="card">
          <div className="card-h"><h2>Your link and code</h2></div>
          <div className="pad col">
            <Field label="Referral link" htmlFor="l-link">
              <div className="row nw">
                <input id="l-link" className="input mono" readOnly value={link} />
                <button className="btn" onClick={() => copy(link, "Link")}><Icon name="copy" size="s" />Copy link</button>
              </div>
            </Field>
            <Field label="Referral code" htmlFor="l-code" hint="A shop can type this code at signup if it did not click your link.">
              <div className="row nw">
                <input id="l-code" className="input mono" readOnly value={data.code} />
                <button className="btn" onClick={() => copy(data.code, "Code")}><Icon name="copy" size="s" />Copy code</button>
              </div>
            </Field>
            <Field label={<>Campaign tag <span className="muted" style={{ fontWeight: 400 }}>Optional</span></>}
                   htmlFor="l-src" hint="Adds a tag so you can see which post brought a signup.">
              <input id="l-src" className="input" value={src} placeholder="instagram" maxLength={60}
                     onChange={(e) => setSrc(e.target.value)} />
            </Field>
            <div className="row">
              <span className="sm b ink">Share:</span>
              <a className="btn sm" href={mail}><Icon name="mail" size="s" />Email</a>
              <a className="btn sm" href={sms}><Icon name="send" size="s" />Message</a>
            </div>
          </div>
        </section>
        <section className="card">
          <div className="card-h"><h2>QR code</h2></div>
          <div className="pad col">
            <p className="sm muted">Points to your link. Good for flyers, packaging and trade show tables.</p>
            <div className="imgph" style={{ background: "#fff", border: "1px solid var(--line)", minHeight: 220 }}>
              {qr ? <img src={qr} alt={`QR code for ${link}`} style={{ width: 200, height: 200 }} /> : "Loading"}
            </div>
            <div className="row">
              <button className="btn sm" onClick={() => partnerDownload(`/partners/me/qr.png${src.trim() ? `?src=${encodeURIComponent(src.trim())}` : ""}`, `printcopilot-${data.code.toLowerCase()}.png`)}>
                <Icon name="download" size="s" />PNG
              </button>
              <button className="btn sm" onClick={() => partnerDownload(qrPath, `printcopilot-${data.code.toLowerCase()}.svg`)}>
                <Icon name="download" size="s" />SVG
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-h">
          <h2>Captions</h2>
          <span className="sm muted">Each caption already says you earn a commission.</span>
        </div>
        {data.captions.map((c, i) => {
          const text = c.text.replace("[YOUR LINK]", link);
          return (
            <div className="sec col" key={i} style={{ gap: 10 }}>
              <h3>{c.title}</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>
              <div><button className="btn sm" onClick={() => copy(text, "Caption")}><Icon name="copy" size="s" />Copy caption</button></div>
            </div>
          );
        })}
      </section>

      <section className="card">
        <div className="card-h">
          <h2>Banners</h2>
          <span className="sm muted">Uploaded by the PrintCoPilot team</span>
        </div>
        <div className="pad">
          {data.banners.length ? (
            <div className="g2">{data.banners.map((b) => <BannerCard key={b.id} {...b} />)}</div>
          ) : <p className="muted">No banners yet. They will show here when the team adds them.</p>}
        </div>
      </section>

      <section className="card">
        <div className="card-h">
          <h2>Share it the right way</h2>
          <Link className="btn gh sm" href="/partners/terms">Read the terms</Link>
        </div>
        <div className="g2 pad">
          <div className="col" style={{ gap: 10 }}>
            <h3 style={{ color: "var(--ok)" }}>Do</h3>
            {["Say that you earn a commission, in every post.",
              "Describe what PrintCoPilot does in your own words.",
              "Send people to your link or give them your code."].map((t) => (
              <div className="row nw" key={t} style={{ gap: 8, alignItems: "flex-start" }}>
                <span style={{ color: "var(--ok)" }}><Icon name="check" size="s" /></span><span className="sm">{t}</span>
              </div>
            ))}
          </div>
          <div className="col" style={{ gap: 10 }}>
            <h3 style={{ color: "var(--bad)" }}>Do not</h3>
            {["Make false claims or promise income.",
              "Spam, or run ads on the PrintCoPilot name.",
              "Refer yourself. Those signups are held for review."].map((t) => (
              <div className="row nw" key={t} style={{ gap: 8, alignItems: "flex-start" }}>
                <span style={{ color: "var(--bad)" }}><Icon name="x" size="s" /></span><span className="sm">{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      {toast.node}
    </>
  );
}
