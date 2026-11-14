/**
 * One printcopilot.co policy page (Privacy, Terms, Cookies, Affiliate Terms,
 * Data Processing Addendum), drawn from the data import-policies.py makes out
 * of the owner's PDF. Same look as the site's legal pages: a "Legal" band, a
 * side list of sections on wide screens, and on a phone one readable column
 * where tables scroll sideways instead of running off the screen.
 */
import type { ReactNode } from "react";

export type PolicyBlock =
  | { text: string; lead?: string }
  | { items: string[] }
  | { table: { head: string[]; rows: string[][] } };

export type Policy = {
  key: string;
  path: string;
  title: string;
  updated: string;
  sections: { id: string; heading: string; blocks: PolicyBlock[] }[];
};

const LINKS = /(https?:\/\/[^\s)]+[^\s).,;:]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,})/g;

/** The words as written, with email addresses and web addresses made into links. */
function linked(text: string): ReactNode[] {
  return text.split(LINKS).map((part, i) => {
    if (i % 2 === 0) return part;
    const href = part.includes("@") && !part.startsWith("http") ? `mailto:${part}` : part;
    return (
      <a key={i} href={href} className="pp-link">
        {part}
      </a>
    );
  });
}

const CSS = `
.pp{background:#fff;color:#3A4A5E}
.pp-hero{background:#F6F8FB;border-bottom:1px solid #E3E8EF}
.pp-hero-in{max-width:1200px;margin:0 auto;padding:64px 32px 48px}
.pp-eyebrow{font-size:12px;line-height:16px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#0B66E4;margin:0}
.pp h1{font-family:Outfit,sans-serif;margin:12px 0 0;font-size:48px;line-height:52px;color:#0C1E35;font-weight:600}
.pp-updated{margin:12px 0 0;font-size:16px;color:#5A6A7E}
.pp-body{max-width:1200px;margin:0 auto;padding:0 32px;display:flex;gap:56px;align-items:flex-start}
.pp-side{flex:none;width:232px;position:sticky;top:96px;padding-top:48px;align-self:flex-start;max-height:calc(100vh - 120px);overflow:auto}
.pp-side p{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#5A6A7E;margin:0;padding-bottom:8px}
.pp-side a{display:block;padding:7px 0;font-size:14px;line-height:20px;color:#3A4A5E;text-decoration:none}
.pp-side a:hover{color:#0B66E4}
.pp-main{flex:1;min-width:0;max-width:760px;padding:48px 0 96px}
.pp-sec{padding:32px 0;border-top:1px solid #E3E8EF;scroll-margin-top:90px}
.pp-sec:first-child{border-top:0;padding-top:0}
.pp h2{font-family:Outfit,sans-serif;font-size:24px;line-height:30px;color:#0C1E35;font-weight:600;margin:0}
.pp-main p{margin:12px 0 0;font-size:16px;line-height:26px;color:#3A4A5E;overflow-wrap:anywhere}
.pp-main p strong{color:#0C1E35;font-weight:600}
.pp-main ul{margin:12px 0 0;padding-left:22px;font-size:16px;line-height:26px;list-style:disc;color:#3A4A5E}
.pp-main li{margin-top:6px;overflow-wrap:anywhere;display:list-item}
.pp-main li::marker{color:#0B66E4}
.pp-link{font-weight:600;color:#0B66E4;text-decoration:none;overflow-wrap:anywhere}
.pp-link:hover{text-decoration:underline}
.pp-table{margin-top:16px;overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #E3E8EF;border-radius:12px}
.pp-table table{width:100%;border-collapse:collapse;font-size:14px;line-height:20px;min-width:520px}
.pp-table th{background:#F6F8FB;color:#0C1E35;font-weight:600;text-align:left;padding:10px 12px;border-bottom:1px solid #E3E8EF;vertical-align:bottom}
.pp-table td{padding:10px 12px;border-top:1px solid #EEF2F7;vertical-align:top;color:#3A4A5E;text-align:left}
@media (max-width:900px){.pp-side{display:none}.pp-body{display:block}}
@media (max-width:560px){
 .pp-hero-in{padding:40px 20px 32px}
 .pp h1{font-size:34px;line-height:40px}
 .pp-body{padding:0 20px}
 .pp-main{padding:32px 0 64px}
 .pp-sec{padding:24px 0}
 .pp h2{font-size:21px;line-height:28px}
 .pp-main p,.pp-main ul{font-size:15px;line-height:24px}
 .pp-table{border:0;border-radius:0;overflow:visible}
 .pp-table table,.pp-table tbody,.pp-table tr,.pp-table td{display:block;min-width:0}
 .pp-table thead{display:none}
 .pp-table tr{border:1px solid #E3E8EF;border-radius:12px;padding:6px 14px;margin-top:12px}
 .pp-table td{border:0;padding:6px 0;font-size:14px;line-height:21px}
 .pp-table td::before{content:attr(data-label);display:block;font-size:11.5px;line-height:16px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#5A6A7E;margin-bottom:2px}
 .pp-table td[data-label=""]::before{display:none}
}
`;

function Paragraph({ block }: { block: { text: string; lead?: string } }) {
  if (!block.lead) return <p>{linked(block.text)}</p>;
  // A bold opening runs straight into its sentence, with no space before a comma or full stop.
  const glue = /^[,.;:)]/.test(block.text) ? "" : " ";
  return (
    <p>
      <strong>{linked(block.lead)}</strong>
      {glue}
      {linked(block.text)}
    </p>
  );
}

export default function PolicyPage({ policy }: { policy: Policy }) {
  const name = policy.title.replace(/^PrintCoPilot\s+/, "");
  const sections = policy.sections.filter((s) => s.heading);
  return (
    <div className="pp">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <section className="pp-hero">
        <div className="pp-hero-in">
          <p className="pp-eyebrow">Legal</p>
          <h1>{name}</h1>
          <p className="pp-updated">Last updated: {policy.updated}</p>
        </div>
      </section>
      <div className="pp-body">
        <aside className="pp-side">
          <p>On this page</p>
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.heading}
            </a>
          ))}
        </aside>
        <main className="pp-main">
          {policy.sections.map((s) => (
            <section key={s.id} id={s.id} className="pp-sec">
              {s.heading ? <h2>{s.heading}</h2> : null}
              {s.blocks.map((b, i) =>
                "items" in b ? (
                  <ul key={i}>
                    {b.items.map((item, j) => (
                      <li key={j}>{linked(item)}</li>
                    ))}
                  </ul>
                ) : "table" in b ? (
                  <div key={i} className="pp-table">
                    <table>
                      <thead>
                        <tr>
                          {b.table.head.map((h, j) => (
                            <th key={j}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {b.table.rows.map((r, j) => (
                          <tr key={j}>
                            {r.map((c, k) => (
                              // On a phone each row stands alone as a card, every value under its column's name.
                              <td key={k} data-label={b.table.head[k] ?? ""}>
                                {linked(c)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Paragraph key={i} block={b} />
                ),
              )}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
