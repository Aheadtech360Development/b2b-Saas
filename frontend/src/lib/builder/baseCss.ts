/**
 * What every builder element looks like before the merchant styles it.
 *
 * Written inside :where() so it weighs nothing: any setting the merchant
 * makes (a rule on the element's own data-b attribute) beats it without a
 * fight, at every breakpoint. Colours, radii and fonts come from the site's
 * variables, so a theme change reaches every element that has not been told
 * otherwise.
 *
 * Breakpoints are container queries on the site wrapper, like the merchant's
 * own rules — see style.ts for why.
 */
import { MOBILE_MAX, TABLET_MAX } from "./style";

const TABLET = `@container bsite (max-width:${TABLET_MAX}px)`;
const PHONE = `@container bsite (max-width:${MOBILE_MAX}px)`;

export const BASE_CSS = `
.bsite{box-sizing:border-box;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-wrap:break-word;position:relative}
.bsite :where(*,*::before,*::after){box-sizing:border-box}
.bsite :where(img){max-width:100%;display:block}
.bsite :where(a){color:inherit}
.bsite :where(p,figure,blockquote,ul,ol){margin:0}
.bsite :where(button){font:inherit}
.bsite[data-part=header]{z-index:30}
.bsite[data-part=header][data-sticky]{position:sticky;top:0;z-index:40}

.bsite :where(.b-section){position:relative;width:100%}
.bsite :where(.b-in){width:100%;margin-inline:auto;padding-inline:20px}
.bsite :where(.b-in-contained){max-width:calc(var(--b-container) + 40px)}
.bsite :where(.b-in-wide){max-width:1480px}
.bsite :where(.b-in-full){max-width:none;padding-inline:0}
.bsite :where(.b-row){display:grid;gap:24px;grid-template-columns:repeat(2,minmax(0,1fr))}
.bsite :where(.b-col){min-width:0}
.bsite :where(.b-stack){display:flex;flex-direction:column;min-width:0}
.bsite :where(.b-stack[data-dir=row]){flex-direction:row;flex-wrap:wrap;align-items:center}
.bsite :where(.b-stack[data-dir=column]) > :where(.b-row,.b-grid,.b-section,.b-stack,.b-text,.b-heading,.b-rich,.b-img,.b-imglink,.b-video,.b-faq,.b-tabs,.b-quotes,.b-gallery,.b-banner,.b-news,.b-html,.b-divider,.b-global,.b-price,.b-buy,.b-pgallery,.b-search-field,.b-menu[data-layout=vertical]){align-self:stretch}
.bsite :where(.b-spacer){width:100%}
.bsite :where(.b-divider){border:0;border-top:1px solid var(--b-border,#e6e6e6);margin:0;width:100%}

.bsite :where(.b-heading){overflow-wrap:anywhere}
.bsite :where(.b-heading a){text-decoration:none}
.bsite :where(.b-text){white-space:pre-line}
.bsite :where(.b-rich) :where(p+p,ul,ol,h2,h3,h4,blockquote){margin-top:.85em}
.bsite :where(.b-rich) :where(ul,ol){padding-left:1.3em}
.bsite :where(.b-rich a){color:var(--b-primary,#14161B);text-underline-offset:3px}

.bsite :where(.b-btn){display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 24px;border-radius:var(--b-btn-radius);font-size:15px;line-height:1.1;text-decoration:none;cursor:pointer;border:1.5px solid var(--b-primary,#14161B);transition:filter .15s ease,background-color .15s ease,color .15s ease;white-space:nowrap;max-width:100%}
.bsite :where(.b-btn-solid){background:var(--b-primary,#14161B);color:#fff}
.bsite :where(.b-btn-outline){background:transparent;color:var(--b-primary,#14161B)}
.bsite :where(.b-btn-link){border-color:transparent;background:none;padding-inline:0;color:var(--b-primary,#14161B);text-decoration:underline;text-underline-offset:4px}
.bsite :where(.b-btn:hover){filter:brightness(.92)}
.bsite :where(.b-btn:focus-visible,.b-link:focus-visible,.b-iconlink:focus-visible,.b-menu-link:focus-visible){outline:2px solid var(--b-primary,#14161B);outline-offset:2px}
.bsite :where(.b-btn[disabled]){opacity:.55;cursor:not-allowed}
.bsite :where(.b-link){color:var(--b-primary,#14161B);text-underline-offset:3px}

.bsite :where(.b-img){width:100%;height:auto;object-fit:cover}
.bsite :where(.b-img-ph){width:100%;aspect-ratio:4/3;border-radius:var(--b-radius);background:linear-gradient(135deg,color-mix(in srgb,var(--b-primary,#14161B) 16%,#fff),var(--b-surface,#FAFAF8) 70%)}
.bsite :where(.b-empty.b-img-ph){display:grid;place-items:center}
.bsite :where(.b-imglink){display:block;overflow:hidden}
.bsite :where(.b-imglink img){width:100%;height:100%;object-fit:cover}
.bsite :where(.b-video){position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#000}
.bsite :where(.b-video iframe){position:absolute;inset:0;width:100%;height:100%;border:0}
.bsite :where(.b-icon){display:inline-flex;color:var(--b-primary,#14161B);text-decoration:none}

.bsite :where(.b-faq details){border-bottom:1px solid var(--b-border,#e6e6e6)}
.bsite :where(.b-faq summary){display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 0;cursor:pointer;font-weight:600;list-style:none}
.bsite :where(.b-faq summary)::-webkit-details-marker{display:none}
.bsite :where(.b-faq summary)::after{content:"+";font-size:20px;font-weight:400;line-height:1;color:var(--b-muted,#5B6170)}
.bsite :where(.b-faq details[open] summary)::after{content:"\\2212"}
.bsite :where(.b-faq-a){padding:0 0 18px;color:var(--b-muted,#5B6170);white-space:pre-line}

.bsite :where(.b-tabs-list){display:flex;gap:4px;border-bottom:1px solid var(--b-border,#e6e6e6);overflow-x:auto;scrollbar-width:thin}
.bsite :where(.b-tab){padding:12px 16px;border:0;background:none;cursor:pointer;font-weight:600;color:var(--b-muted,#5B6170);border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
.bsite :where(.b-tab[aria-selected=true]){color:var(--b-text,#14161B);border-bottom-color:var(--b-primary,#14161B)}
.bsite :where(.b-tab-panel){padding:18px 0;white-space:pre-line}

.bsite :where(.b-quotes){display:grid;gap:20px;grid-template-columns:repeat(3,minmax(0,1fr))}
.bsite :where(.b-quote){background:var(--b-surface,#FAFAF8);border:1px solid var(--b-border,#e6e6e6);border-radius:var(--b-radius);padding:24px;display:flex;flex-direction:column;gap:14px}
.bsite :where(.b-quote blockquote){font-size:16px;line-height:1.6}
.bsite :where(.b-quote figcaption){font-weight:600;font-size:14px;color:var(--b-muted,#5B6170)}
.bsite :where(.b-gallery){display:grid;gap:12px;grid-template-columns:repeat(3,minmax(0,1fr))}
.bsite :where(.b-gallery img){width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:var(--b-radius)}

.bsite :where(.b-banner){position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:flex-start;gap:14px;padding:56px 32px;background-size:cover;background-position:center;border-radius:var(--b-radius)}
.bsite :where(.b-banner[data-align=center]){align-items:center;text-align:center}
.bsite :where(.b-banner[data-align=right]){align-items:flex-end;text-align:right}
.bsite :where(.b-banner[data-img])::before{content:"";position:absolute;inset:0;background:rgba(0,0,0,.42)}
.bsite :where(.b-banner) > *{position:relative}
.bsite :where(.b-banner h2){font-size:clamp(26px,4cqi,40px);line-height:1.15}
.bsite :where(.b-banner p){max-width:620px;opacity:.9;white-space:pre-line}
.bsite :where(.b-banner .b-btn){background:#fff;color:#14161B;border-color:#fff;margin-top:8px}

.bsite :where(.b-news form){display:flex;gap:10px;flex-wrap:wrap;max-width:560px}
.bsite :where(.b-news input){flex:1 1 220px;min-width:0;padding:13px 16px;border:1.5px solid var(--b-border,#e6e6e6);border-radius:var(--b-btn-radius);font:inherit;background:var(--b-background,#fff);color:inherit}
.bsite :where(.b-news input:focus){outline:none;border-color:var(--b-primary,#14161B)}
.bsite :where(.b-news-done){font-weight:600}
.bsite :where(.b-news-err){color:#B42318;font-size:14px;margin-top:8px}

.bsite :where(.b-logo){display:inline-flex;align-items:center;text-decoration:none}
.bsite :where(.b-logo img){width:auto;max-width:240px;object-fit:contain}
.bsite :where(.b-storename){font-weight:700;font-size:20px;text-decoration:none;letter-spacing:-.01em}

.bsite :where(.b-menu){position:relative;min-width:0}
.bsite :where(.b-menu ul){list-style:none;margin:0;padding:0}
.bsite :where(.b-menu-list){display:flex;flex-wrap:wrap;align-items:center;gap:2px}
.bsite :where(.b-menu-item){position:relative;display:flex;align-items:center}
.bsite :where(.b-menu-link){display:inline-flex;align-items:center;gap:4px;padding:9px 12px;border-radius:8px;text-decoration:none;font-weight:500;font-size:15px;white-space:nowrap}
.bsite :where(.b-menu-link:hover){background:var(--b-surface,#F4F4F2)}
.bsite :where(.b-menu-caret){display:inline-grid;place-items:center;width:26px;height:26px;margin-left:-8px;border:0;background:none;cursor:pointer;color:inherit;border-radius:6px}
.bsite :where(.b-menu-sub){position:absolute;top:100%;left:0;min-width:220px;background:var(--b-background,#fff);color:var(--b-text,#14161B);border:1px solid var(--b-border,#e6e6e6);border-radius:12px;box-shadow:0 14px 36px rgba(20,22,27,.14);padding:6px;display:none;z-index:60;flex-direction:column}
.bsite :where(.b-menu-sub .b-menu-item){width:100%}
.bsite :where(.b-menu-sub .b-menu-link){display:flex;width:100%;padding:10px 12px}
.bsite :where(.b-menu-sub .b-menu-sub){top:0;left:100%}
.bsite :where(.b-menu-item:hover > .b-menu-sub,.b-menu-item:focus-within > .b-menu-sub,.b-menu-item[data-open] > .b-menu-sub){display:flex}
.bsite :where(.b-menu[data-layout=vertical] .b-menu-list){flex-direction:column;align-items:flex-start}
.bsite :where(.b-menu[data-layout=vertical] .b-menu-item){flex-direction:column;align-items:flex-start}
.bsite :where(.b-menu[data-layout=vertical] .b-menu-link){padding:6px 0}
.bsite :where(.b-menu[data-layout=vertical] .b-menu-link:hover){background:none;text-decoration:underline}
.bsite :where(.b-menu[data-layout=vertical] .b-menu-sub){position:static;display:flex;border:0;box-shadow:none;padding:0 0 0 14px;background:none;min-width:0}
.bsite :where(.b-menu[data-layout=vertical] .b-menu-caret){display:none}
.bsite :where(.b-menu-toggle){display:none;align-items:center;justify-content:center;width:42px;height:42px;border:0;background:none;cursor:pointer;color:inherit;border-radius:10px}
.bsite :where(.b-menu-toggle:hover){background:var(--b-surface,#F4F4F2)}
.bsite :where(.b-menu-empty){font-size:13px;color:var(--b-muted,#5B6170)}

.bsite :where(.b-search-field){display:flex;align-items:center;gap:8px;min-width:0;width:100%;max-width:420px;padding:0 6px 0 14px;border:1.5px solid var(--b-border,#e6e6e6);border-radius:999px;background:var(--b-background,#fff)}
.bsite :where(.b-search-field:focus-within){border-color:var(--b-primary,#14161B)}
.bsite :where(.b-search-field input){flex:1;min-width:0;border:0;outline:none;background:none;font:inherit;font-size:14px;padding:10px 0;color:inherit}
.bsite :where(.b-search-field button){display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:999px;background:none;cursor:pointer;color:inherit}
.bsite :where(.b-iconlink){position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:42px;height:42px;padding:0 9px;border-radius:999px;text-decoration:none}
.bsite :where(.b-iconlink:hover){background:var(--b-surface,#F4F4F2)}
.bsite :where(.b-count){position:absolute;top:2px;right:0;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--b-primary,#14161B);color:#fff;font-size:11px;font-weight:700;line-height:18px;text-align:center}
.bsite :where(.b-crumbs){display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px;color:var(--b-muted,#5B6170)}
.bsite :where(.b-crumbs a){text-decoration:none}
.bsite :where(.b-crumbs a:hover){text-decoration:underline}
.bsite :where(.b-announce){display:block;text-decoration:none;font-size:14px;line-height:1.4}

.bsite :where(.b-price){font-size:22px;font-weight:600}
.bsite :where(.b-pgallery){display:flex;flex-direction:column;gap:10px;min-width:0}
.bsite :where(.b-pgallery-main){aspect-ratio:1/1;border-radius:var(--b-radius);background:var(--b-surface,#FAFAF8);overflow:hidden}
.bsite :where(.b-pgallery-main img){width:100%;height:100%;object-fit:contain}
.bsite :where(.b-pgallery-thumbs){display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.bsite :where(.b-pgallery-thumb){aspect-ratio:1/1;padding:0;border:2px solid transparent;border-radius:calc(var(--b-radius) * .7);overflow:hidden;background:var(--b-surface,#FAFAF8);cursor:pointer}
.bsite :where(.b-pgallery-thumb[aria-current=true]){border-color:var(--b-primary,#14161B)}
.bsite :where(.b-pgallery-thumb img){width:100%;height:100%;object-fit:cover}
.bsite :where(.b-pgallery-grid){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.bsite :where(.b-pgallery-grid img){width:100%;aspect-ratio:1/1;object-fit:contain;background:var(--b-surface,#FAFAF8);border-radius:var(--b-radius)}

.bsite :where(.b-buy){display:flex;flex-direction:column;gap:18px}
.bsite :where(.b-buy .vlabel){display:block;font-size:13px;font-weight:600;margin-bottom:8px}
.bsite :where(.b-choices){display:flex;flex-wrap:wrap;gap:8px}
.bsite :where(.b-choice){min-width:46px;padding:10px 14px;border:1.5px solid var(--b-border,#e6e6e6);border-radius:10px;background:var(--b-background,#fff);color:inherit;font-size:14px;cursor:pointer}
.bsite :where(.b-choice.selected){border-color:var(--b-primary,#14161B);box-shadow:0 0 0 1px var(--b-primary,#14161B)}
.bsite :where(.b-swatch){width:34px;height:34px;padding:0;border-radius:999px;border:1.5px solid var(--b-border,#e6e6e6);cursor:pointer}
.bsite :where(.b-swatch.selected){outline:2px solid var(--b-primary,#14161B);outline-offset:2px}
.bsite :where(.b-buy-row){display:flex;flex-wrap:wrap;gap:10px}
.bsite :where(.b-qty){display:inline-flex;align-items:center;border:1.5px solid var(--b-border,#e6e6e6);border-radius:var(--b-btn-radius);overflow:hidden;flex:0 0 auto}
.bsite :where(.b-qty button){width:42px;height:48px;border:0;background:none;font-size:18px;cursor:pointer;color:inherit}
.bsite :where(.b-qty input){width:46px;height:48px;border:0;text-align:center;font:inherit;background:none;color:inherit;-moz-appearance:textfield}
.bsite :where(.b-buy-row .b-btn){flex:1 1 200px;padding:15px 22px}
.bsite :where(.b-buy > .b-btn){width:100%;padding:15px 22px}

.bsite :where(.b-grid){display:grid;gap:22px;grid-template-columns:repeat(4,minmax(0,1fr))}
.bsite :where(.b-card){display:flex;flex-direction:column;gap:10px;text-decoration:none;color:inherit;min-width:0}
.bsite :where(.b-card-img){position:relative;aspect-ratio:1/1;border-radius:var(--b-radius);background:var(--b-surface,#FAFAF8);overflow:hidden}
.bsite :where(.b-card-img img){width:100%;height:100%;object-fit:cover;transition:transform .35s ease}
.bsite :where(.b-card:hover .b-card-img img){transform:scale(1.035)}
.bsite :where(.b-badge){position:absolute;top:10px;left:10px;background:var(--b-primary,#14161B);color:#fff;font-size:11px;font-weight:700;padding:4px 9px;border-radius:999px}
.bsite :where(.b-card-title){font-weight:600;font-size:15px;line-height:1.35;overflow-wrap:anywhere}
.bsite :where(.b-card-meta){font-size:14px;color:var(--b-muted,#5B6170)}
.bsite :where(.b-ccard .b-card-img){aspect-ratio:4/3}
.bsite :where(.b-cimg){width:100%;aspect-ratio:21/8;object-fit:cover;border-radius:var(--b-radius)}
.bsite :where(.b-cbar){display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px;font-size:14px;color:var(--b-muted,#5B6170)}
.bsite :where(.b-cbar select){padding:9px 12px;border:1.5px solid var(--b-border,#e6e6e6);border-radius:10px;font:inherit;background:var(--b-background,#fff);color:var(--b-text,#14161B)}
.bsite :where(.b-more){display:flex;justify-content:center;gap:10px;margin-top:32px}

.bsite :where(.b-empty){padding:28px;border:1.5px dashed var(--b-border,#d9d9d9);border-radius:var(--b-radius);text-align:center;color:var(--b-muted,#5B6170);font-size:14px}
.bsite :where(.b-drop){min-height:76px;border:1.5px dashed #C3C8D2;border-radius:10px;display:grid;place-items:center;color:#8A909C;font-size:13px;font-family:system-ui,sans-serif;background:rgba(244,246,251,.6);padding:12px;text-align:center}
.bsite :where(.b-note){padding:14px 16px;border-radius:10px;background:#F4F6FB;color:#4A5160;font-size:13px;font-family:system-ui,sans-serif;border:1px dashed #C3C8D2;line-height:1.45}

${TABLET}{
  .bsite :where(.b-menu[data-mobile=drawer] .b-menu-list){display:none}
  .bsite :where(.b-menu[data-mobile=drawer] .b-menu-toggle){display:inline-flex}
  .bsite :where(.b-grid){grid-template-columns:repeat(3,minmax(0,1fr))}
  .bsite :where(.b-quotes){grid-template-columns:repeat(2,minmax(0,1fr))}
}
${PHONE}{
  .bsite :where(.b-in){padding-inline:16px}
  .bsite :where(.b-in-full){padding-inline:0}
  .bsite :where(.b-row){grid-template-columns:minmax(0,1fr)}
  .bsite :where(.b-grid,.b-gallery){grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
  .bsite :where(.b-quotes){grid-template-columns:minmax(0,1fr)}
  .bsite :where(.b-banner){padding:40px 20px}
  .bsite :where(.b-pgallery-thumbs){grid-template-columns:repeat(4,minmax(0,1fr))}
  .bsite :where(.b-search-field){max-width:none}
  .bsite :where(.b-storename){font-size:17px}
  .bsite :where(.b-logo img){max-width:150px}
}

.bsite-layer{position:fixed;inset:0;z-index:2147483000}
.bsite-layer .b-drawer-back{position:absolute;inset:0;background:rgba(15,17,22,.45);animation:bfade .18s ease}
.bsite-layer .b-drawer{position:absolute;top:0;bottom:0;left:0;width:min(360px,88vw);background:var(--b-background,#fff);color:var(--b-text,#14161B);box-shadow:8px 0 32px rgba(0,0,0,.18);display:flex;flex-direction:column;animation:bslide .22s ease}
.bsite-layer .b-drawer-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--b-border,#e6e6e6);font-weight:700}
.bsite-layer .b-drawer-close{display:grid;place-items:center;width:40px;height:40px;border:0;background:none;border-radius:10px;cursor:pointer;color:inherit}
.bsite-layer .b-drawer-body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:8px 8px 24px}
.bsite-layer .b-drawer ul{list-style:none;margin:0;padding:0}
.bsite-layer .b-drawer a{display:block;padding:13px 12px;border-radius:10px;text-decoration:none;color:inherit;font-weight:500}
.bsite-layer .b-drawer a:hover{background:var(--b-surface,#F4F4F2)}
.bsite-layer .b-drawer details > summary{display:flex;justify-content:space-between;align-items:center;padding:13px 12px;border-radius:10px;cursor:pointer;font-weight:500;list-style:none}
.bsite-layer .b-drawer details > summary::-webkit-details-marker{display:none}
.bsite-layer .b-drawer details > summary::after{content:"+";font-size:18px;color:var(--b-muted,#5B6170)}
.bsite-layer .b-drawer details[open] > summary::after{content:"\\2212"}
.bsite-layer .b-drawer details ul{padding-left:12px}
@keyframes bfade{from{opacity:0}to{opacity:1}}
@keyframes bslide{from{transform:translateX(-100%)}to{transform:none}}
@media (prefers-reduced-motion:reduce){.bsite-layer .b-drawer,.bsite-layer .b-drawer-back{animation:none}}
`;
