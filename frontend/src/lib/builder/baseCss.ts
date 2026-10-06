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
.bsite{box-sizing:border-box;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-wrap:break-word;position:relative;overflow-x:clip}
/* No element is wider than what holds it, whatever width it was given for a
   desktop. Weightless, so a width the merchant sets for a device still wins. */
.bsite :where([data-b]){max-width:100%}
.bsite :where(*,*::before,*::after){box-sizing:border-box}
.bsite :where(img){max-width:100%;display:block}
.bsite :where(a){color:var(--b-link,inherit)}
.bsite :where(a:hover){color:var(--b-link-hover,var(--b-link,inherit))}
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
.bsite :where(.b-stack[data-dir=column]) > :where(.b-row,.b-grid,.b-section,.b-stack,.b-text,.b-heading,.b-rich,.b-img,.b-imglink,.b-video,.b-faq,.b-tabs,.b-quotes,.b-gallery,.b-banner,.b-news,.b-form,.b-desc,.b-html,.b-divider,.b-global,.b-price,.b-buy,.b-pgallery,.b-search-field,.b-menu[data-layout=vertical]){align-self:stretch}
.bsite :where(.b-spacer){width:100%}
.bsite :where([data-lay]) > *,.bsite :where(.b-section[data-lay]) > .b-in > *{min-width:0}
.bsite :where([data-lay]) :where(.b-text,.b-heading,.b-rich){overflow-wrap:anywhere}
.bsite :where(.b-search-count){margin:0 0 16px;color:var(--b-muted,#6B6B6B);font-size:15px}
.bsite :where(.b-search-note){display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin:0;padding:22px 24px;border:1px dashed var(--b-border,#DADADA);border-radius:var(--b-radius,12px);color:var(--b-muted,#6B6B6B)}
.bsite :where(.b-search-note b){color:var(--b-text,#14161B);font-size:17px}
.bsite :where(.b-search-note a){color:var(--b-primary,#14161B);text-underline-offset:3px;font-weight:600}
.bsite :where(.b-stars){position:relative;display:inline-block;line-height:1;letter-spacing:1px;color:var(--b-border,#DADADA);white-space:nowrap}
.bsite :where(.b-stars > span){position:absolute;top:0;left:0;bottom:0;overflow:hidden;color:#F5A524}
.bsite :where(.b-rating){display:inline-flex;align-items:center;gap:6px;color:inherit;text-decoration:none;flex-wrap:wrap}
.bsite :where(.b-rcount){color:var(--b-muted,#6B6B6B)}
.bsite :where(.b-reviews){display:flex;flex-direction:column;gap:18px}
.bsite :where(.b-rev-head){display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px}
.bsite :where(.b-rev-head .b-heading){margin:0;flex:1 1 100%}
.bsite :where(.b-rev-sum){display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
.bsite :where(.b-rev-sum .b-rcount,.b-rev-by,.b-rev-signin){color:var(--b-muted,#6B6B6B);font-size:14px}
.bsite :where(.b-rev-signin){text-decoration:underline;text-underline-offset:3px}
.bsite :where(.b-rev-form){display:flex;flex-direction:column;gap:10px;padding:18px;border:1px solid var(--b-border,#E6E6E6);border-radius:var(--b-radius,12px);max-width:640px}
.bsite :where(.b-input){width:100%;min-width:0;padding:12px 14px;border:1.5px solid var(--b-border,#e6e6e6);border-radius:var(--b-btn-radius);font:inherit;background:var(--b-background,#fff);color:inherit;resize:vertical}
.bsite :where(.b-input:focus){outline:none;border-color:var(--b-primary,#14161B)}
.bsite :where(.b-rev-rate){display:flex;gap:4px}
.bsite :where(.b-rev-rate button){border:0;background:none;font-size:26px;line-height:1;cursor:pointer;color:var(--b-border,#DADADA);padding:0}
.bsite :where(.b-rev-rate button.on){color:#F5A524}
.bsite :where(.b-rev-actions){display:flex;gap:10px;flex-wrap:wrap}
.bsite :where(.b-rev-err){color:#B42318;margin:0;font-size:14px}
.bsite :where(.b-rev-done){margin:0;padding:10px 14px;border-radius:10px;background:#ECFDF3;color:#05603A;font-size:14px}
.bsite :where(.b-rev-list){list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.bsite :where(.b-rev){padding:18px 0;border-top:1px solid var(--b-border,#E6E6E6);display:flex;flex-direction:column;gap:8px;min-width:0}
.bsite :where(.b-rev-top){display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.bsite :where(.b-rev-body){margin:0;white-space:pre-line;overflow-wrap:anywhere}
.bsite :where(.b-rev-img){max-width:160px;border-radius:8px}
.bsite :where(.b-rev-reply){padding:10px 14px;border-radius:10px;background:var(--b-surface,#F7F7F5);font-size:14px}
.bsite :where(.b-rev-reply p){margin:4px 0 0}
.bsite :where(.b-divider){border:0;border-top:1px solid var(--b-border,#e6e6e6);margin:0;width:100%}

.bsite :where(.b-heading){overflow-wrap:anywhere;color:var(--b-head,inherit)}
.bsite :where(.b-heading a){text-decoration:none}
.bsite :where(.b-text){white-space:pre-line}
/* Pasted markup — a description, a merchant's own HTML — brings its own widths.
   Nothing in it is wider than the block; what cannot shrink (a wide table, a
   line that must not wrap) scrolls inside the block instead of widening the
   page or being cut off. Weightless, so the merchant's own CSS still wins. */
.bsite :where(.b-rich,.b-html){max-width:100%;overflow-x:auto;overflow-wrap:anywhere;scrollbar-width:thin}
.bsite :where(.b-rich,.b-html) :where(*){max-width:100%}
.bsite :where(.b-rich,.b-html) :where(img[width],video[width]){height:auto}
.bsite :where(.b-rich,.b-html) :where(pre){overflow-x:auto;scrollbar-width:thin}
.bsite :where(.b-rich,.b-html) :where(table){max-width:none;overflow-wrap:normal;word-break:normal}
.bsite :where(.b-rich) :where(p+p,ul,ol,h2,h3,h4,blockquote){margin-top:.85em}
.bsite :where(.b-rich) :where(h2){font-family:var(--b-font-heading,inherit);font-size:1.45em;font-weight:700;line-height:1.25;color:var(--b-head,inherit)}
.bsite :where(.b-rich) :where(h3){font-family:var(--b-font-heading,inherit);font-size:1.2em;font-weight:700;line-height:1.3;color:var(--b-head,inherit)}
.bsite :where(.b-rich) :where(h4){font-size:1.05em;font-weight:700}
.bsite .b-rich :where(h2,h3,h4){margin:1.15em 0 .35em}
.bsite .b-rich > :where(:first-child){margin-top:0}
.bsite :where(.b-rich) :where(ul,ol){padding-left:1.3em}
.bsite :where(.b-rich) :where(ul){list-style:disc}
.bsite :where(.b-rich) :where(ol){list-style:decimal}
.bsite :where(.b-rich a){color:var(--b-link,var(--b-primary,#14161B));text-underline-offset:3px}
.bsite :where(.b-rich a:hover){color:var(--b-link-hover,var(--b-link,var(--b-primary,#14161B)))}

.bsite :where(.b-btn){display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 24px;border-radius:var(--b-btn-radius);font-size:15px;line-height:1.1;text-decoration:none;cursor:pointer;border:1.5px solid var(--b-primary,#14161B);transition:filter .15s ease,background-color .15s ease,color .15s ease;white-space:normal;text-align:center;overflow-wrap:anywhere;max-width:100%}
.bsite :where(.b-btn-solid){background:var(--b-primary,#14161B);color:#fff}
.bsite :where(.b-btn-outline){background:transparent;color:var(--b-primary,#14161B)}
.bsite :where(.b-btn-link){border-color:transparent;background:none;padding-inline:0;color:var(--b-primary,#14161B);text-decoration:underline;text-underline-offset:4px}
.bsite :where(.b-btn:hover){filter:brightness(.92)}
.bsite :where(.b-btn:focus-visible,.b-link:focus-visible,.b-iconlink:focus-visible,.b-menu-link:focus-visible){outline:2px solid var(--b-primary,#14161B);outline-offset:2px}
.bsite :where(.b-btn[disabled]){opacity:.55;cursor:not-allowed}
.bsite :where(.b-link){color:var(--b-link,var(--b-primary,#14161B));text-underline-offset:3px}
.bsite :where(.b-link:hover){color:var(--b-link-hover,var(--b-link,var(--b-primary,#14161B)))}

.bsite :where(.b-img){width:100%;height:auto;object-fit:cover}
.bsite :where(.b-img-ph){width:100%;aspect-ratio:4/3;border-radius:var(--b-radius);background:linear-gradient(135deg,color-mix(in srgb,var(--b-primary,#14161B) 16%,#fff),var(--b-surface,#FAFAF8) 70%)}
.bsite :where(.b-empty.b-img-ph){display:grid;place-items:center}
.bsite :where(.b-imglink){display:block;overflow:hidden}
.bsite :where(.b-imglink img){width:100%;height:100%;object-fit:cover}
.bsite :where(.b-video){position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;background:#000}
.bsite :where(.b-video iframe){position:absolute;inset:0;width:100%;height:100%;border:0}
.bsite :where(.b-icon){display:inline-flex;color:var(--b-primary,#14161B);text-decoration:none}

.bsite :where(.b-faq details){border-bottom:1px solid var(--b-border,#e6e6e6)}
.bsite :where(.b-faq summary){display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 0;cursor:pointer;font-weight:600;list-style:none;overflow-wrap:anywhere}
.bsite :where(.b-faq-a,.b-tab-panel,.b-quote,.b-text,.b-crumbs,.b-announce,.b-news-done){overflow-wrap:anywhere}
.bsite :where(.b-faq summary)::-webkit-details-marker{display:none}
.bsite :where(.b-faq summary)::after{content:"+";font-size:20px;font-weight:400;line-height:1;color:var(--b-muted,#5B6170)}
.bsite :where(.b-faq details[open] summary)::after{content:"\\2212"}
.bsite :where(.b-faq-a){padding:0 0 18px;color:var(--b-muted,#5B6170);white-space:pre-line}
.bsite :where(.b-desc){display:flex;flex-direction:column;gap:14px;min-width:0}
.bsite :where(.b-desc-acc){border-top:1px solid var(--b-border,#e6e6e6)}
.bsite :where(.b-desc-acc details){border-bottom:1px solid var(--b-border,#e6e6e6)}
.bsite :where(.b-desc-acc summary){display:flex;justify-content:space-between;align-items:center;gap:16px;padding:16px 2px;cursor:pointer;list-style:none;font-family:var(--b-font-heading,inherit);font-size:1.08em;font-weight:600;line-height:1.35;color:var(--b-head,inherit);overflow-wrap:anywhere;-webkit-user-select:none;user-select:none}
.bsite :where(.b-desc-acc summary)::-webkit-details-marker{display:none}
.bsite :where(.b-desc-acc summary)::after{content:"";flex:0 0 auto;width:8px;height:8px;margin-right:4px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;opacity:.55;transform:translateY(-3px) rotate(45deg);transition:transform .2s ease}
.bsite :where(.b-desc-acc details[open] > summary)::after{transform:translateY(2px) rotate(-135deg)}
.bsite :where(.b-desc-acc summary:focus-visible){outline:2px solid var(--b-primary,#14161B);outline-offset:2px;border-radius:4px}
.bsite :where(.b-desc-body){padding:0 2px 18px}
.bsite .b-desc-body > :first-child{margin-top:0}
.bsite .b-desc-body > :last-child{margin-bottom:0}
@supports (interpolate-size:allow-keywords){
  .bsite :where(.b-desc-acc details){interpolate-size:allow-keywords}
  .bsite :where(.b-desc-acc details)::details-content{height:0;overflow:clip;transition:height .25s ease,content-visibility .25s allow-discrete}
  .bsite :where(.b-desc-acc details[open])::details-content{height:auto}
}
@media (prefers-reduced-motion:reduce){.bsite :where(.b-desc-acc details)::details-content{transition:none}}

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
.bsite :where(.b-banner p){max-width:min(620px,100%);opacity:.9;white-space:pre-line}
.bsite :where(.b-banner) > :where(*){max-width:100%;overflow-wrap:anywhere}
.bsite :where(.b-banner .b-btn){background:#fff;color:#14161B;border-color:#fff;margin-top:8px}

.bsite :where(.b-news form){display:flex;gap:10px;flex-wrap:wrap;max-width:560px}
.bsite :where(.b-news input){flex:1 1 220px;min-width:0;padding:13px 16px;border:1.5px solid var(--b-border,#e6e6e6);border-radius:var(--b-btn-radius);font:inherit;background:var(--b-background,#fff);color:inherit}
.bsite :where(.b-news input:focus){outline:none;border-color:var(--b-primary,#14161B)}
.bsite :where(.b-news-done){font-weight:600}
.bsite :where(.b-news-err){color:#B42318;font-size:14px;margin-top:8px}
.bsite :where(.b-form){width:100%;max-width:100%}
.bsite :where(.b-form form){display:flex;flex-direction:column;gap:20px;margin:0}
.bsite :where(.b-form-grid){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 18px}
.bsite :where(.b-form-field){display:flex;flex-direction:column;gap:7px;min-width:0;grid-column:1 / -1}
.bsite :where(.b-form-field[data-w=half]){grid-column:auto}
.bsite :where(.b-form-label){font-size:14px;font-weight:600;line-height:1.4;color:var(--f-label,inherit)}
.bsite :where(.b-form-req){color:#D92D20;margin-left:3px}
.bsite :where(.b-form-opt){font-weight:400;color:var(--b-muted,#5B6170);font-size:13px}
.bsite :where(.b-form-in){box-sizing:border-box;width:100%;min-width:0;margin:0;font:inherit;font-size:15px;line-height:1.45;padding:12px 14px;border:1.5px solid var(--f-border,var(--b-border,#D0D5DD));border-radius:var(--f-radius,10px);background:var(--f-bg,var(--b-background,#fff));color:inherit;outline:none;transition:border-color .15s ease,box-shadow .15s ease;-webkit-appearance:none;appearance:none}
.bsite :where(select.b-form-in){padding-right:40px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%235B6170' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center}
.bsite :where(textarea.b-form-in){min-height:140px;resize:vertical}
.bsite :where(.b-form-in)::placeholder{color:var(--b-muted,#8A8F98);opacity:1}
.bsite :where(.b-form-in:focus){border-color:var(--f-focus,var(--b-primary,#14161B));box-shadow:0 0 0 3px color-mix(in srgb,var(--f-focus,var(--b-primary,#14161B)) 16%,transparent)}
.bsite :where(.b-form-in[aria-invalid=true]){border-color:#D92D20}
.bsite :where(.b-form-tick){display:flex;align-items:flex-start;gap:10px;font-size:15px;line-height:1.45;cursor:pointer;color:var(--f-label,inherit)}
.bsite :where(.b-form-box){flex:0 0 auto;width:18px;height:18px;margin:2px 0 0;accent-color:var(--f-btn-bg,var(--b-primary,#14161B))}
.bsite :where(.b-form-err){color:#B42318;font-size:13px;margin:0}
.bsite :where(.b-form-actions){display:flex}
.bsite :where(.b-form-btn){display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 28px;border:0;border-radius:var(--f-btn-radius,10px);background:var(--f-btn-bg,var(--b-primary,#14161B));color:var(--f-btn-color,#fff);font:inherit;font-size:15px;font-weight:600;cursor:pointer;transition:filter .15s ease,transform .05s ease}
.bsite :where(.b-form-btn:hover){filter:brightness(1.08)}
.bsite :where(.b-form-btn:active){transform:translateY(1px)}
.bsite :where(.b-form-btn:disabled){opacity:.6;cursor:progress}
.bsite :where(.b-form-actions[data-full] .b-form-btn){width:100%}
.bsite :where(.b-form-trap){position:absolute;left:-10000px;width:1px;height:1px;opacity:0;pointer-events:none}
.bsite :where(.b-form-done){padding:22px 24px;border:1.5px solid var(--f-border,var(--b-border,#D0D5DD));border-radius:var(--f-radius,10px);background:var(--f-bg,var(--b-surface,#F7F7F5))}
.bsite :where(.b-form-done p){margin:0 0 10px;font-size:16px;font-weight:600;overflow-wrap:anywhere}
.bsite :where(.b-form-again){padding:0;border:0;background:none;font:inherit;font-size:14px;text-decoration:underline;cursor:pointer;color:inherit}
.bsite :where(.b-form-empty){grid-column:1 / -1;margin:0;padding:18px;border:1.5px dashed var(--b-border,#D0D5DD);border-radius:10px;color:var(--b-muted,#5B6170);font-size:14px}

.bsite :where(.b-logo){display:inline-flex;align-items:center;text-decoration:none;min-width:0;flex:0 1 auto;color:var(--b-head,inherit)}
.bsite :where(.b-logo img){width:auto;max-width:100%;object-fit:contain}
/* A logo nobody has sized keeps the modest default it always had. */
.bsite :where(.b-logo[data-auto] img){max-width:min(240px,100%)}
.bsite :where(.b-logo[data-w] img){width:100%}
.bsite :where(.b-logo[data-h] img){height:100%}
.bsite :where(.b-logo[data-align=center]){align-self:center;margin-inline:auto}
.bsite :where(.b-logo[data-align=right]){align-self:flex-end;margin-left:auto}
.bsite :where(.b-logo[data-align=left]){align-self:flex-start;margin-right:auto}
.bsite :where(.b-storename){font-weight:700;font-size:20px;text-decoration:none;letter-spacing:-.01em;min-width:0;overflow-wrap:anywhere;color:var(--b-head,inherit)}

.bsite :where(.b-menu){position:relative;min-width:0;font-size:var(--b-fs,15px);font-weight:var(--b-fw,500)}
.bsite :where(.b-menu-title){font-family:var(--b-font-heading,inherit);font-weight:700;font-size:1.05em;margin:0 0 10px;color:var(--b-head,inherit);overflow-wrap:anywhere}
.bsite :where(.b-menu ul){list-style:none;margin:0;padding:0}
.bsite :where(.b-menu-list){display:flex;flex-wrap:wrap;align-items:center;gap:2px}
.bsite :where(.b-menu-item){position:relative;display:flex;align-items:center}
.bsite :where(.b-menu-link){display:inline-flex;align-items:center;gap:4px;padding:9px 12px;border-radius:8px;text-decoration:none;font-weight:inherit;font-size:inherit;white-space:nowrap}
.bsite :where(.b-menu-link:hover){background:var(--b-surface,#F4F4F2)}
.bsite :where(.b-menu-caret){display:inline-grid;place-items:center;width:26px;height:26px;margin-left:-8px;border:0;background:none;cursor:pointer;color:var(--b-link,inherit);border-radius:6px}
.bsite :where(.b-menu-sub){--b-link:initial;--b-link-hover:initial;position:absolute;top:100%;left:0;min-width:220px;background:var(--b-background,#fff);color:var(--b-text,#14161B);border:1px solid var(--b-border,#e6e6e6);border-radius:12px;box-shadow:0 14px 36px rgba(20,22,27,.14);padding:6px;display:none;z-index:60;flex-direction:column}
.bsite :where(.b-menu-sub .b-menu-item){width:100%}
.bsite :where(.b-menu-sub .b-menu-link){display:flex;width:100%;padding:10px 12px}
.bsite :where(.b-menu-sub .b-menu-sub){top:0;left:100%}
.bsite :where(.b-menu-item:hover > .b-menu-sub,.b-menu-item:focus-within > .b-menu-sub,.b-menu-item[data-open] > .b-menu-sub){display:flex}
.bsite :where(.b-menu[data-layout=vertical] .b-menu-list){flex-direction:column;align-items:flex-start}
.bsite :where(.b-menu[data-layout=vertical] .b-menu-item){flex-direction:column;align-items:flex-start}
.bsite :where(.b-menu[data-layout=vertical] .b-menu-link){padding:6px 0;white-space:normal;overflow-wrap:anywhere}
.bsite :where(.b-menu[data-layout=vertical] .b-menu-list){gap:0}
.bsite :where(.b-menu[data-layout=vertical] .b-menu-link:hover){background:none;text-decoration:underline}
.bsite :where(.b-menu[data-layout=vertical] .b-menu-sub){position:static;display:flex;border:0;box-shadow:none;padding:0 0 0 14px;background:none;min-width:0;color:inherit;--b-link:inherit;--b-link-hover:inherit}
.bsite :where(.b-menu[data-layout=vertical] .b-menu-caret){display:none}
.bsite :where(.b-menu-toggle){display:none;align-items:center;justify-content:center;width:42px;height:42px;border:0;background:none;cursor:pointer;color:var(--b-link,inherit);border-radius:10px}
.bsite :where(.b-menu-toggle:hover,.b-menu-caret:hover){color:var(--b-link-hover,var(--b-link,inherit))}
.bsite :where(.b-menu-toggle:hover){background:var(--b-surface,#F4F4F2)}
.bsite :where(.b-menu-empty){font-size:13px;color:var(--b-muted,#5B6170)}

.bsite :where(.b-search-field){display:flex;align-items:center;gap:8px;min-width:0;width:100%;max-width:420px;padding:0 6px 0 14px;border:1.5px solid var(--b-border,#e6e6e6);border-radius:999px;background:var(--b-background,#fff)}
.bsite :where(.b-search-field:focus-within){border-color:var(--b-primary,#14161B)}
.bsite :where(.b-search-field input){flex:1;min-width:0;border:0;outline:none;background:none;font:inherit;font-size:14px;padding:10px 0;color:inherit}
.bsite :where(.b-search-field button){display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:999px;background:none;cursor:pointer;color:inherit}
.bsite :where(.b-iconlink){position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:42px;height:42px;padding:0 9px;border-radius:999px;text-decoration:none}
.bsite :where(.b-iconlink,.b-menu-toggle){flex:0 0 auto}
.bsite :where(.b-stack:has(> .b-iconlink):not(:has(> .b-search-field))){flex-shrink:0}
.bsite :where(.b-stack[data-dir=row]) > :where(.b-search-field){flex:1 1 160px;width:auto}
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

.bsite .b-html{position:relative;contain:paint;isolation:isolate;overflow-y:hidden}
.bsite :where(.b-empty){padding:28px;border:1.5px dashed var(--b-border,#d9d9d9);border-radius:var(--b-radius);text-align:center;color:var(--b-muted,#5B6170);font-size:14px}
.bsite :where(.b-drop){min-height:76px;border:1.5px dashed #C3C8D2;border-radius:10px;display:grid;place-items:center;color:#8A909C;font-size:13px;font-family:system-ui,sans-serif;background:rgba(244,246,251,.6);padding:12px;text-align:center}
.bsite :where(.b-note){padding:14px 16px;border-radius:10px;background:#F4F6FB;color:#4A5160;font-size:13px;font-family:system-ui,sans-serif;border:1px dashed #C3C8D2;line-height:1.45}

${TABLET}{
  .bsite :where(.b-menu[data-mobile=drawer] .b-menu-list){display:none}
  .bsite :where(.b-menu[data-mobile=drawer] .b-menu-toggle){display:inline-flex}
  .bsite :where(.b-menu[data-mobile=drawer]){flex:0 0 auto;order:99;margin-left:-6px}
  .bsite :where(.b-stack:has(> .b-menu[data-mobile=drawer])) > :nth-child(1 of :not(.b-menu[data-mobile=drawer])){margin-right:auto}
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
  .bsite :where(.b-logo[data-auto] img){max-width:min(150px,100%)}
  .bsite :where(.b-form-grid){grid-template-columns:minmax(0,1fr)}
  .bsite :where(.b-form-field[data-w=half]){grid-column:1 / -1}
  .bsite :where(.b-form-btn){width:100%}
  .bsite :where(.b-form-in){font-size:16px}
}

.bsite-layer{position:fixed;inset:0;z-index:2147483000}
.bsite-layer .b-drawer-back{position:absolute;inset:0;background:rgba(15,17,22,.45);animation:bfade .18s ease}
.bsite-layer .b-drawer{position:absolute;top:0;bottom:0;right:0;width:min(360px,88vw);background:var(--b-background,#fff);color:var(--b-text,#14161B);box-shadow:-8px 0 32px rgba(0,0,0,.18);display:flex;flex-direction:column;animation:bslide .22s ease;font-family:var(--b-font-body,system-ui,sans-serif)}
.bsite-layer .b-drawer-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 12px 12px 20px;border-bottom:1px solid var(--b-border,#e6e6e6);font-weight:700;font-size:17px}
.bsite-layer .b-drawer-head span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bsite-layer .b-drawer-close{display:grid;place-items:center;width:40px;height:40px;border:0;background:none;border-radius:10px;cursor:pointer;color:inherit}
.bsite-layer .b-drawer-body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:6px 8px 16px}
.bsite-layer .b-drawer ul{list-style:none;margin:0;padding:0}
.bsite-layer .b-drawer a{display:flex;align-items:center;gap:12px;min-height:48px;padding:12px;border-radius:10px;text-decoration:none;color:inherit;font-size:16px;font-weight:600;overflow-wrap:anywhere}
.bsite-layer .b-drawer a:hover{background:var(--b-surface,#F4F4F2)}
.bsite-layer .b-drawer details > summary{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:48px;padding:12px;border-radius:10px;cursor:pointer;font-size:16px;font-weight:600;list-style:none;overflow-wrap:anywhere}
.bsite-layer .b-drawer details > summary::-webkit-details-marker{display:none}
.bsite-layer .b-drawer details > summary::after{content:"+";font-size:18px;color:var(--b-muted,#5B6170)}
.bsite-layer .b-drawer details[open] > summary::after{content:"\\2212"}
.bsite-layer .b-drawer details ul{padding-left:12px}
.bsite-layer .b-drawer details a{font-weight:500;font-size:15px;min-height:44px}
.bsite-layer .b-drawer-body > ul > li + li{border-top:1px solid var(--b-border,#eeeeee)}
.bsite-layer .b-drawer-foot{border-top:1px solid var(--b-border,#e6e6e6);padding:8px;background:var(--b-surface,#F7F7F5)}
.bsite-layer .b-drawer-foot a{font-weight:500;font-size:15px}
.bsite-layer .b-drawer-foot svg{flex:0 0 auto;color:var(--b-muted,#5B6170)}
@keyframes bfade{from{opacity:0}to{opacity:1}}
@keyframes bslide{from{transform:translateX(100%)}to{transform:none}}
@media (prefers-reduced-motion:reduce){.bsite-layer .b-drawer,.bsite-layer .b-drawer-back{animation:none}}
`;
