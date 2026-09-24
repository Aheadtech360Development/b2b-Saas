import Link from "next/link";

/**
 * printcopilot.co — the platform's own page.
 *
 * This is what a visitor gets at the platform's address, where no brand was
 * asked for. Every shop built here lives on its own address — <brand>.printcopilot.co
 * until the brand brings a domain of its own — so this one is never a shop,
 * and it used to say so and little else.
 *
 * One page: what it is, what it costs, and how to reach us. The prices and the
 * feature list come from the pricing sheet in designs/Platform-Pricing-Page.html.
 * Sober on purpose — no gradients, no motion, nothing that moves while someone
 * is trying to read a price.
 */

const CONTACT_EMAIL = "hello@printcopilot.co";

const TIERS = [
  {
    key: "starter",
    tier: "Tier 1",
    name: "Starter",
    blurb: "For shops not yet running wholesale volume.",
    price: "97",
    rate: "2.8%",
    popular: false,
    points: [
      "Orders, drafts, shipping labels, abandoned checkouts, returns, purchase orders",
      "Products, collections, reviews, inventory, multi-location inventory",
      "Customers and segments",
      "Live chat and messaging",
      "Buyer account portal, order history, addresses, multiple logins, saved cards",
      "Storefront, theme, discounts, blog, SEO, pages, menus, custom domains",
      "Sales, product and customer analytics",
      "24/7 AI Data Analytics Agent",
      "Gang Sheet Builder access",
    ],
    limits: "Up to 300 orders/month · 3 staff accounts · 1 domain",
  },
  {
    key: "wholesale",
    tier: "Tier 2",
    name: "Wholesale",
    blurb: "For shops running real bulk and wholesale order volume.",
    price: "297",
    rate: "1.9%",
    popular: true,
    points: [
      "Everything in Starter",
      "Wholesale accounts, sign-up and approval",
      "Customer tiers and discounts",
      "Net terms and credit at checkout",
      "Invoices for net terms accounts",
      "Matrix ordering grid",
      "Quick Buy reorder",
    ],
    limits: "Up to 1,500 orders/month · 10 staff accounts",
  },
  {
    key: "scale",
    tier: "Tier 3",
    name: "Scale",
    blurb: "For high-volume operations that have outgrown fixed limits.",
    price: "497",
    rate: "1.3%",
    popular: false,
    points: [
      "Everything in Wholesale",
      "Lowest commission, 1.3%",
      "Mobile app included",
      "Priority support, faster than the standard response window",
    ],
    limits: "Unlimited orders, staff accounts and domains",
  },
];

/** The full list, exactly as the pricing sheet has it. ✓ / — / text. */
const COMPARISON: { group: string; rows: [string, string, string, string][] }[] = [
  {
    group: "Orders and fulfillment",
    rows: [
      ["Orders", "✓", "✓", "✓"],
      ["Drafts", "✓", "✓", "✓"],
      ["Shipping labels", "✓", "✓", "✓"],
      ["Abandoned checkouts", "✓", "✓", "✓"],
      ["Returns", "✓", "✓", "✓"],
      ["Purchase orders", "✓", "✓", "✓"],
    ],
  },
  {
    group: "Products and catalog",
    rows: [
      ["Products, media, pricing, variants", "✓", "✓", "✓"],
      ["Collections", "✓", "✓", "✓"],
      ["Inventory tracking", "✓", "✓", "✓"],
      ["Product reviews", "✓", "✓", "✓"],
      ["Multi-location inventory", "✓", "✓", "✓"],
    ],
  },
  {
    group: "Customers",
    rows: [
      ["Customer records and order history", "✓", "✓", "✓"],
      ["Customer segments", "✓", "✓", "✓"],
    ],
  },
  {
    group: "Wholesale ordering tools",
    rows: [
      ["Wholesale accounts, sign-up and approval", "—", "✓", "✓"],
      ["Customer tiers and discounts", "—", "✓", "✓"],
      ["Matrix ordering grid", "—", "✓", "✓"],
      ["Quick Buy reorder", "—", "✓", "✓"],
      ["Net terms and credit at checkout", "—", "✓", "✓"],
      ["Invoices for net terms accounts", "—", "✓", "✓"],
    ],
  },
  {
    group: "Buyer account portal",
    rows: [
      ["Order history and reordering", "✓", "✓", "✓"],
      ["Saved addresses", "✓", "✓", "✓"],
      ["Multiple buyer logins per company", "✓", "✓", "✓"],
      ["Saved payment methods", "✓", "✓", "✓"],
    ],
  },
  {
    group: "Marketing and storefront",
    rows: [
      ["Discounts", "✓", "✓", "✓"],
      ["Blog", "✓", "✓", "✓"],
      ["On-page SEO", "✓", "✓", "✓"],
      ["Pages", "✓", "✓", "✓"],
      ["Menus", "✓", "✓", "✓"],
      ["Storefront theme", "✓", "✓", "✓"],
      ["Custom domains", "✓", "✓", "✓"],
    ],
  },
  {
    group: "Analytics",
    rows: [
      ["Sales, product and customer analytics", "✓", "✓", "✓"],
      ["24/7 AI Data Analytics Agent", "✓", "✓", "✓"],
    ],
  },
  {
    group: "Settings and operations",
    rows: [
      ["Users and roles", "✓", "✓", "✓"],
      ["Shipping and delivery settings", "✓", "✓", "✓"],
      ["Tax settings", "✓", "✓", "✓"],
      ["Notifications", "✓", "✓", "✓"],
      ["Policies", "✓", "✓", "✓"],
      ["Checkout settings", "✓", "✓", "✓"],
      ["Legal and billing", "✓", "✓", "✓"],
    ],
  },
  {
    group: "Gang Sheet Builder",
    rows: [
      ["Access to the tool", "✓", "✓", "✓"],
      ["Commission per order", "2.8%", "1.9%", "1.3%"],
    ],
  },
  {
    group: "Mobile app",
    rows: [["Buyer mobile app", "Paid add-on", "Paid add-on", "Included"]],
  },
  {
    group: "Limits and support",
    rows: [
      ["Monthly order volume", "Up to 300", "Up to 1,500", "Unlimited"],
      ["Staff accounts", "3", "10", "Unlimited"],
      ["Custom domains", "1", "3", "Unlimited"],
      ["Support", "24–48 business hours", "24–48 business hours", "Priority, faster response"],
    ],
  },
];

const FAQ: [string, string][] = [
  [
    "Do you take a percentage of everything I sell?",
    "No. The percentage only applies to orders placed through Gang Sheet Builder. Standard product and wholesale orders are covered by your monthly plan alone.",
  ],
  [
    "Is the AI Data Analytics Agent limited to a certain tier?",
    "No, it's included at every tier, including Starter. Chat with it about your store the same way at $97/month as you would at $497/month.",
  ],
  [
    "Can I change tiers later?",
    "Yes, upgrade or downgrade whenever your volume changes. Most shops move up once their Gang Sheet Builder volume grows enough that the lower commission outweighs the higher monthly plan.",
  ],
  [
    "What counts as a wholesale order?",
    "Any order placed by an approved wholesale account, including ones built with the matrix ordering grid. Wholesale account sign-up and the rest of the wholesale toolset unlock starting at Tier 2.",
  ],
  [
    "How soon can I start selling?",
    "As soon as you sign up. The shop exists at its own address straight away, and you connect your own domain whenever you have one.",
  ],
];

const WHAT_YOU_GET: [string, string][] = [
  ["Your own storefront", "Upload a design and it becomes your shop — products, prices and menus filled in from your own catalogue."],
  ["Wholesale the way it works", "Approved accounts, customer tiers, matrix ordering, net terms and invoices. Not a retail cart with a discount bolted on."],
  ["Gang Sheet Builder", "Buyers arrange their own artwork on a sheet, at the sizes and prices you set. The job lands in your review queue, priced and ready."],
  ["Print-ready artwork", "Buyers send the file with the order. It arrives on the line your production team opens."],
  ["One place to run it", "Orders, returns, purchase orders, inventory across locations, shipping labels, tax, discounts, blog, SEO."],
  ["An analyst on call", "Ask the AI agent what to fulfil first, where sales are moving, which segment to build. Included on every tier."],
];

export default function PlatformLanding() {
  return (
    <>
      <style>{CSS}</style>
      <div className="pc">
        <header className="pc-header">
          <div className="pc-wrap pc-header-in">
            <a href="#top" className="pc-logo">
              <span className="pc-mark" aria-hidden />
              PrintCopilot
            </a>
            <nav className="pc-nav">
              <a href="#what">Platform</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
              <a href="#contact">Contact</a>
            </nav>
            <div className="pc-head-actions">
              <Link href="/login?tenant=" className="pc-link">Log in</Link>
              <Link href="/signup" className="pc-btn">Get started</Link>
            </div>
          </div>
        </header>

        <main id="top">
          <section className="pc-wrap pc-hero">
            <h1>Commerce software for print shops, not a retail cart with wholesale bolted on.</h1>
            <p>
              Run your storefront, your wholesale accounts and your gang sheet production in one
              place. Every shop gets its own address from day one and keeps it when you bring
              your own domain.
            </p>
            <div className="pc-cta">
              <Link href="/signup" className="pc-btn pc-btn-lg">Start your shop</Link>
              <a href="#pricing" className="pc-btn-ghost pc-btn-lg">See pricing</a>
            </div>
            <p className="pc-fine">Your shop is live the moment you sign up, at its own address.</p>
          </section>

          <section id="what" className="pc-band">
            <div className="pc-wrap">
              <h2>What you get</h2>
              <div className="pc-grid">
                {WHAT_YOU_GET.map(([title, body]) => (
                  <div key={title} className="pc-cell">
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="pricing" className="pc-wrap pc-section">
            <h2>Pricing that scales the way your shop does</h2>
            <p className="pc-lede">
              One flat monthly plan, plus a small percentage on the orders that actually run
              through Gang Sheet Builder. Nothing else on your store is metered.
            </p>

            <div className="pc-tiers">
              {TIERS.map((t) => (
                <div key={t.name} className={`pc-card${t.popular ? " pc-card-pop" : ""}`}>
                  {t.popular && <span className="pc-badge">Most popular</span>}
                  <div className="pc-tier">{t.tier}</div>
                  <h3>{t.name}</h3>
                  <p className="pc-blurb">{t.blurb}</p>
                  <div className="pc-price">
                    <span className="pc-num">${t.price}</span>
                    <span className="pc-per">/month</span>
                  </div>
                  <div className="pc-rate">
                    <span className="pc-num">{t.rate}</span> on Gang Sheet Builder orders
                  </div>
                  <Link href={`/signup?plan=${t.key}`} className="pc-btn pc-btn-block">
                    Get started
                  </Link>
                  <ul className="pc-points">
                    {t.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                  <div className="pc-limits">{t.limits}</div>
                </div>
              ))}
            </div>

            <div className="pc-note">
              <h3>How the commission works</h3>
              <p>
                The percentage above applies only to orders placed through Gang Sheet Builder,
                since those run through production infrastructure we maintain for you. Every
                other order on your store — blanks, standard product listings, wholesale bulk
                orders — is covered entirely by your flat monthly plan. No hidden cut of your
                regular sales.
              </p>
            </div>
          </section>

          <section className="pc-band">
            <div className="pc-wrap">
              <h2>Compare every feature</h2>
              <p className="pc-lede">Every module in the platform, in full, nothing trimmed off this list.</p>
              <div className="pc-table-scroll">
                <table className="pc-table">
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Starter<span className="pc-th-sub pc-num">$97</span></th>
                      <th>Wholesale<span className="pc-th-sub pc-num">$297</span></th>
                      <th>Scale<span className="pc-th-sub pc-num">$497</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON.flatMap((section) => [
                      <tr key={section.group} className="pc-group">
                        <td colSpan={4}>{section.group}</td>
                      </tr>,
                      ...section.rows.map(([label, a, b, c]) => (
                        <tr key={`${section.group}-${label}`}>
                          <td>{label}</td>
                          <td className={cellClass(a)}>{a}</td>
                          <td className={cellClass(b)}>{b}</td>
                          <td className={cellClass(c)}>{c}</td>
                        </tr>
                      )),
                    ])}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section id="faq" className="pc-wrap pc-section">
            <h2>Questions</h2>
            <div className="pc-faq">
              {FAQ.map(([q, a]) => (
                <div key={q} className="pc-qa">
                  <h3>{q}</h3>
                  <p>{a}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="contact" className="pc-band">
            <div className="pc-wrap pc-contact">
              <h2>Talk to us</h2>
              <p className="pc-lede">
                Tell us what you print and how you sell it, and we&apos;ll show you the platform
                running on a shop like yours.
              </p>
              <div className="pc-contact-rows">
                <a href={`mailto:${CONTACT_EMAIL}`} className="pc-contact-row">
                  <span>Email</span>
                  <strong>{CONTACT_EMAIL}</strong>
                </a>
                <div className="pc-contact-row">
                  <span>Getting started</span>
                  <strong>Sign up and your shop is live the same minute</strong>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="pc-footer">
          <div className="pc-wrap pc-footer-in">
            <span>© {new Date().getFullYear()} PrintCopilot</span>
            <span className="pc-footer-links">
              <a href="#pricing">Pricing</a>
              <a href="#contact">Contact</a>
              <Link href="/login?tenant=">Log in</Link>
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}

function cellClass(value: string): string {
  if (value === "✓") return "pc-yes";
  if (value === "—") return "pc-no";
  return "pc-val";
}

const CSS = `
.pc{--ink:#111318;--muted:#5A5F68;--paper:#FAFAF9;--line:#E7E5E2;--brass:#B8912B;--brass-bg:#FBF4E2;--yes:#16A34A;
  background:var(--paper);color:var(--ink);font-family:"DM Sans",system-ui,sans-serif;line-height:1.6;}
.pc *{box-sizing:border-box;}
.pc-wrap{max-width:1080px;margin:0 auto;padding:0 24px;}
.pc-num{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums;}

.pc-header{border-bottom:1px solid var(--line);background:#fff;position:sticky;top:0;z-index:10;}
.pc-header-in{display:flex;align-items:center;gap:24px;padding-top:16px;padding-bottom:16px;flex-wrap:wrap;}
.pc-logo{display:flex;align-items:center;gap:9px;font-weight:700;font-size:18px;letter-spacing:-.02em;color:var(--ink);text-decoration:none;}
.pc-mark{width:22px;height:22px;border-radius:5px;background:var(--ink);display:block;}
.pc-nav{display:flex;gap:22px;margin-left:auto;font-size:14.5px;}
.pc-nav a{color:var(--muted);text-decoration:none;}
.pc-nav a:hover{color:var(--ink);}
.pc-head-actions{display:flex;align-items:center;gap:14px;}
.pc-link{color:var(--muted);text-decoration:none;font-size:14.5px;}
.pc-link:hover{color:var(--ink);}
.pc-btn{display:inline-block;background:var(--ink);color:#fff;text-decoration:none;font-size:14.5px;font-weight:600;
  padding:9px 18px;border-radius:8px;}
.pc-btn:hover{background:#23262D;}
.pc-btn-ghost{display:inline-block;border:1px solid var(--line);background:#fff;color:var(--ink);text-decoration:none;
  font-size:14.5px;font-weight:600;padding:9px 18px;border-radius:8px;}
.pc-btn-lg{padding:13px 26px;font-size:15.5px;}
.pc-btn-block{display:block;text-align:center;width:100%;margin:18px 0 0;}

.pc-hero{padding:72px 24px 60px;max-width:820px;text-align:center;}
.pc-hero h1{font-size:44px;line-height:1.14;letter-spacing:-.025em;font-weight:700;margin:0 0 18px;}
.pc-hero p{font-size:18px;color:var(--muted);margin:0 auto;max-width:640px;}
.pc-cta{display:flex;gap:12px;justify-content:center;margin-top:28px;flex-wrap:wrap;}
.pc-fine{font-size:13.5px;color:var(--muted);margin-top:16px;}

.pc-band{background:#fff;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:64px 0;}
.pc-section{padding:64px 24px;}
.pc h2{font-size:30px;letter-spacing:-.02em;font-weight:700;margin:0 0 12px;}
.pc-lede{color:var(--muted);font-size:16.5px;margin:0 0 34px;max-width:660px;}

.pc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px 32px;margin-top:30px;}
.pc-cell h3{font-size:16.5px;font-weight:700;margin:0 0 6px;}
.pc-cell p{color:var(--muted);font-size:14.5px;margin:0;}

.pc-tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;align-items:start;}
.pc-card{border:1px solid var(--line);border-radius:14px;background:#fff;padding:26px 22px;position:relative;}
.pc-card-pop{border:1.5px solid var(--brass);}
.pc-badge{position:absolute;top:-11px;left:22px;background:var(--brass-bg);color:#7A5F12;border:1px solid var(--brass);
  font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:20px;}
.pc-tier{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;}
.pc-card h3{font-size:21px;font-weight:700;margin:4px 0 6px;}
.pc-blurb{color:var(--muted);font-size:14px;margin:0 0 18px;min-height:40px;}
.pc-price{display:flex;align-items:baseline;gap:6px;}
.pc-price .pc-num{font-size:38px;font-weight:600;letter-spacing:-.02em;}
.pc-per{color:var(--muted);font-size:14.5px;}
.pc-rate{margin-top:6px;font-size:14px;color:var(--muted);}
.pc-rate .pc-num{color:var(--ink);font-weight:600;}
.pc-points{list-style:none;padding:0;margin:22px 0 0;border-top:1px solid var(--line);padding-top:18px;}
.pc-points li{font-size:14px;color:var(--muted);padding-left:22px;position:relative;margin-bottom:9px;}
.pc-points li::before{content:"✓";position:absolute;left:0;color:var(--yes);font-weight:700;}
.pc-limits{margin-top:16px;padding-top:14px;border-top:1px solid var(--line);font-size:13px;color:var(--muted);}

.pc-note{margin-top:36px;border:1px solid var(--line);border-left:3px solid var(--brass);border-radius:10px;
  background:#fff;padding:22px 24px;}
.pc-note h3{font-size:16px;font-weight:700;margin:0 0 8px;}
.pc-note p{color:var(--muted);font-size:14.5px;margin:0;}

.pc-table-scroll{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:#fff;}
.pc-table{width:100%;border-collapse:collapse;font-size:14px;min-width:620px;}
.pc-table th{text-align:left;padding:14px 16px;border-bottom:1px solid var(--line);font-weight:700;vertical-align:top;}
.pc-table th:not(:first-child){text-align:center;width:140px;}
.pc-th-sub{display:block;font-size:13px;font-weight:500;color:var(--muted);margin-top:2px;}
.pc-table td{padding:11px 16px;border-bottom:1px solid var(--line);color:var(--muted);}
.pc-table td:not(:first-child){text-align:center;}
.pc-group td{background:var(--paper);font-weight:700;color:var(--ink);font-size:13px;text-transform:uppercase;letter-spacing:.05em;}
.pc-yes{color:var(--yes);font-weight:700;}
.pc-no{color:#C4C2BE;}
.pc-val{color:var(--ink);font-weight:600;}

.pc-faq{display:grid;grid-template-columns:1fr 1fr;gap:26px 40px;}
.pc-qa h3{font-size:15.5px;font-weight:700;margin:0 0 6px;}
.pc-qa p{color:var(--muted);font-size:14.5px;margin:0;}

.pc-contact{max-width:680px;}
.pc-contact-rows{display:grid;gap:10px;}
.pc-contact-row{display:flex;justify-content:space-between;align-items:center;gap:16px;background:#fff;
  border:1px solid var(--line);border-radius:10px;padding:15px 20px;text-decoration:none;color:var(--ink);}
.pc-contact-row span{color:var(--muted);font-size:14px;}
.pc-contact-row strong{font-weight:600;font-size:15px;}

.pc-footer{border-top:1px solid var(--line);padding:26px 0;}
.pc-footer-in{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;font-size:14px;color:var(--muted);}
.pc-footer-links{display:flex;gap:20px;}
.pc-footer-links a{color:var(--muted);text-decoration:none;}
.pc-footer-links a:hover{color:var(--ink);}

@media (max-width:900px){
  .pc-grid,.pc-tiers,.pc-faq{grid-template-columns:1fr;}
  .pc-hero{padding:52px 24px 44px;}
  .pc-hero h1{font-size:32px;}
  .pc-hero p{font-size:16.5px;}
  .pc h2{font-size:25px;}
  .pc-nav{order:3;width:100%;margin-left:0;justify-content:space-between;gap:12px;font-size:14px;}
  .pc-head-actions{margin-left:auto;}
  .pc-blurb{min-height:0;}
}
`;
