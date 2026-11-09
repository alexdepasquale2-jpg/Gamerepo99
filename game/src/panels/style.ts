/**
 * Structural CSS for what only the panels area draws outside a sheet: the canvas-aligned layer, hotbar,
 * minimap, drag ghost and item icons. Colours come from the kit's CSS variables (with palette fallbacks),
 * so the kit stylesheet themes everything (the fallbacks matter: this sheet can load before the kit's).
 * Sheet bodies use the kit's shared classes (hf-btn, hf-tabs, hf-slots, hf-rows, hf-pre, hf-field,
 * hf-muted, hf-note). The hotbar lifts by --hf-pad-overlap so an on-screen pad never covers it.
 */
const CSS = `
.hf-panels-layer{position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:20;font-family:var(--hf-font-ui,system-ui,sans-serif);color:var(--hf-text-primary,#E8DCC8);--hf-pad-overlap:max(0px,calc(var(--hf-pad-reserve-bottom,0px) - var(--hf-below,0px)))}
.hf-panels-layer [hidden]{display:none !important}
.hf-hotbar{position:absolute;left:50%;bottom:calc(6px + var(--hf-pad-overlap));transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none}
.hf-hotbar__name{min-height:1.2em;padding:1px 10px;border-radius:999px;background:rgba(11,10,15,.6);font:500 12px/1.3 var(--hf-font-ui,system-ui,sans-serif);text-shadow:0 1px 2px var(--hf-void,#0B0A0F)}
.hf-hotbar__name:empty{background:none}
.hf-hotbar__slots{display:flex;gap:2px;padding:3px;border-radius:var(--hf-r-lg,14px);background:rgba(11,10,15,.5);border:1px solid var(--hf-border,rgba(184,152,96,.28));box-shadow:var(--hf-shadow2,0 6px 18px rgba(11,10,15,.45));pointer-events:auto;touch-action:none}
@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.hf-hotbar__slots{background:rgba(11,10,15,.34);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}}
.hf-hotbar .hf-hotslot{position:relative;width:var(--hf-slot,38px);height:var(--hf-slot,38px);padding:0;display:flex;align-items:center;justify-content:center;background:rgba(28,22,18,.88);border:1px solid rgba(122,112,96,.55);border-radius:var(--hf-r-md,10px);color:inherit;font:inherit;cursor:pointer;touch-action:none;-webkit-tap-highlight-color:transparent;transition:border-color var(--hf-dur-fast,120ms),box-shadow var(--hf-dur-fast,120ms),transform var(--hf-dur-fast,120ms) var(--hf-ease,ease-out)}
.hf-hotbar .hf-hotslot:hover{border-color:var(--hf-border-strong,rgba(184,152,96,.6))}
.hf-hotbar .hf-hotslot:focus-visible{outline:2px solid var(--hf-focus,#5EC8C8);outline-offset:1px}
.hf-hotbar .hf-hotslot[aria-pressed=true]{border-color:var(--hf-accent,#F2B84B);background:rgba(62,58,48,.95);box-shadow:0 0 0 1px var(--hf-accent,#F2B84B) inset,0 0 12px rgba(242,184,75,.35);transform:translateY(-2px)}
.hf-hotslot .hf-icon{transform:scale(var(--hf-icon-scale,1))}
.hf-hotbar .hf-hotslot.is-empty .hf-icon{opacity:.28;filter:grayscale(1)}
.hf-hotslot__key{position:absolute;left:4px;top:2px;font:10px/1 var(--hf-font-mono,monospace);color:var(--hf-text-muted,#8A7A68)}
.hf-hotslot__qty{position:absolute;right:3px;bottom:2px;padding:0 2px;border-radius:4px;background:rgba(11,10,15,.55);font:600 10px/1.2 var(--hf-font-mono,monospace);font-variant-numeric:tabular-nums}
.hf-hotslot__mark{position:absolute;right:3px;top:1px;font-size:10px;color:var(--hf-glow,#F0D878)}
@media (pointer:coarse){.hf-hotslot__key{display:none}.hf-hotbar__slots{gap:1px;padding:2px}}
.hf-icon{display:inline-block;width:24px;height:24px;flex:none;background-repeat:no-repeat;image-rendering:pixelated}
.hf-drag-ghost{position:fixed;z-index:60;pointer-events:none;transform:translate(-50%,-60%) scale(1.1);padding:6px;border:2px solid var(--hf-accent,#F2B84B);border-radius:50%;background:var(--hf-surface,#1B1612);box-shadow:0 8px 22px rgba(11,10,15,.6),0 0 14px rgba(242,184,75,.35)}
.hf-minimap{position:absolute;right:8px;top:8px;width:var(--hf-mini-w,132px);height:auto;aspect-ratio:132/92;pointer-events:auto;cursor:pointer;box-sizing:border-box;border:1px solid var(--hf-border-strong,rgba(184,152,96,.6));border-radius:var(--hf-r-md,10px);background:var(--hf-surface,#1B1612);box-shadow:var(--hf-shadow2,0 6px 18px rgba(11,10,15,.45));image-rendering:pixelated;transition:border-color var(--hf-dur-fast,120ms),transform var(--hf-dur-fast,120ms) var(--hf-ease,ease-out)}
.hf-minimap:hover{border-color:var(--hf-accent,#F2B84B)}
.hf-minimap:active{transform:scale(.98)}
.hf-minimap:focus-visible{outline:2px solid var(--hf-focus,#5EC8C8);outline-offset:2px}
.hf-map-canvas{display:block;width:100%;box-sizing:border-box;border:1px solid var(--hf-border-strong,#8A6A44);border-radius:var(--hf-r-md,8px);image-rendering:pixelated}
.hf-legend{display:flex;flex-wrap:wrap;gap:2px 10px;margin:6px 0 0;padding:0;list-style:none}
.hf-legend i{display:inline-block;width:10px;height:3px;margin-right:4px;vertical-align:middle}
.hf-satchel-tip{margin:8px 0 0;white-space:pre-wrap}
.hf-roads{display:flex;flex-direction:column;gap:10px}
.hf-road h3{margin:0 0 6px;font:600 1em/1.25 var(--hf-font-display,Georgia,serif);color:var(--hf-accent,#F2B84B)}
.hf-road .hf-btn{display:block;width:100%;text-align:left;margin:2px 0}
.hf-inbox .hf-btn{display:block;width:100%;text-align:left;margin:2px 0}
.hf-inbox .is-unread{border-color:var(--hf-accent,#F2B84B)}
.hf-letter-read{margin:8px 0;white-space:pre-wrap;font-family:var(--hf-font-read,Georgia,serif);line-height:1.55}
.hf-sheet-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.hf-subhead{margin:12px 0 4px;font:600 .8em var(--hf-font-ui,Georgia,serif);letter-spacing:.06em;text-transform:uppercase;color:var(--hf-text-muted,#C8B898)}
.hf-board-page{display:grid;gap:4px}
.hf-trade-good{display:inline-flex;align-items:center;gap:6px}
`;

let injected = false;
export function ensurePanelStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'hf-panels-style';
  style.textContent = CSS;
  document.head.append(style);
}

// ==== SHOP SHEET (panels/shop.ts; owned by the shop unit — keep this block whole when restyling) ====
// Kit tokens only (var(--hf-*)) and the kit's shared classes (.hf-rows, .hf-tabs, .hf-btn), so a restyle
// carries over. Two columns side by side; a narrow sheet (container < 440px, or docked under a phone's
// canvas) shows one at a time behind Buy / Sell tabs, with 44px touch targets.
function shopCss(): string {
  return `
.hf-shop{container-type:inline-size;display:flex;flex-direction:column;gap:6px;min-height:100%}
.hf-shop__sub{margin:0}
.hf-shop__tabs{display:none;padding:0}
.hf-shop__cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start}
.hf-shop__col{min-width:0}
.hf-shop__head{display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin-top:2px}
.hf-shop__purse{text-transform:none;letter-spacing:0;color:var(--hf-text-primary)}
.hf-shop .hf-shop__rows{display:flex;flex-direction:column;gap:3px}
.hf-shop__row{border:1px solid var(--hf-line-quiet);border-radius:4px;background:var(--hf-surface-raised)}
.hf-shop__row.is-picked{border-color:var(--hf-line)}
.hf-shop__row.is-focus{border-color:var(--hf-accent);box-shadow:0 0 0 1px var(--hf-accent) inset}
.hf-shop__row.is-refused{opacity:.55}
.hf-shop__pick{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:6px;width:100%;min-height:36px;padding:3px 6px;background:none;border:0;color:inherit;font:inherit;text-align:left;cursor:pointer}
.hf-shop__pick[disabled]{cursor:default}
.hf-shop__pick:focus-visible{outline:2px solid var(--hf-spark-outline);outline-offset:-2px}
.hf-shop__name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hf-shop__price{padding:0 6px;border:1px solid var(--hf-line-quiet);border-radius:999px;font:var(--hf-fs-label,12px) var(--hf-font-mono);color:var(--hf-text-primary)}
.hf-shop__price.is-none{color:var(--hf-text-muted)}
.hf-shop__col[data-side=theirs] .hf-shop__price.is-cheap,.hf-shop__col[data-side=yours] .hf-shop__price.is-dear{border-color:var(--hf-mark-grown);color:var(--hf-mark-grown)}
.hf-shop__col[data-side=theirs] .hf-shop__price.is-dear,.hf-shop__col[data-side=yours] .hf-shop__price.is-cheap{border-color:var(--hf-wound);background:var(--hf-wound)}
.hf-shop__count{color:var(--hf-text-muted);min-width:2.2em}
.hf-shop__step{display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:0 6px 4px}
.hf-shop__stepbtn{min-width:32px;padding:0}
.hf-shop__qty{flex:1;text-align:right;color:var(--hf-accent)}
.hf-shop__foot{position:sticky;bottom:-8px;margin:auto -12px -8px;padding:8px 12px;display:flex;flex-direction:column;gap:6px;background:var(--hf-surface);border-top:1px solid var(--hf-line)}
.hf-shop__basket{margin:0;padding:0;list-style:none;max-height:7.5em;overflow:auto}
.hf-shop__line{display:flex;justify-content:space-between;gap:8px}
.hf-shop__line.is-sell .hf-num{color:var(--hf-mark-grown)}
.hf-shop__sum{display:flex;flex-wrap:wrap;gap:4px 12px;color:var(--hf-text-muted)}
.hf-shop__net{color:var(--hf-text-primary);font-weight:bold}
.hf-shop__net.is-in{color:var(--hf-mark-grown)}
.hf-shop__net.is-out{color:var(--hf-accent)}
.hf-shop__why{margin:0;color:var(--hf-glow)}
.hf-shop__acts{display:flex;gap:8px}
.hf-shop__clear{flex:none}
.hf-shop__settle{flex:1;min-height:40px;font-size:1.1em;border-color:var(--hf-accent);color:var(--hf-accent)}
.hf-shop__settle[disabled]{border-color:var(--hf-line-quiet)}
.hf-shop__msg{margin:0}
@container (max-width: 440px){
  .hf-shop__tabs{display:flex}
  .hf-shop__tab{flex:1;min-height:44px}
  .hf-shop__cols{grid-template-columns:1fr}
  .hf-shop[data-col=theirs] .hf-shop__col[data-side=yours],.hf-shop[data-col=yours] .hf-shop__col[data-side=theirs]{display:none}
}
#hf-ui-layer[data-dock=below] .hf-shop__tabs{display:flex}
#hf-ui-layer[data-dock=below] .hf-shop__tab{flex:1;min-height:44px}
#hf-ui-layer[data-dock=below] .hf-shop__cols{grid-template-columns:1fr}
#hf-ui-layer[data-dock=below] .hf-shop[data-col=theirs] .hf-shop__col[data-side=yours],#hf-ui-layer[data-dock=below] .hf-shop[data-col=yours] .hf-shop__col[data-side=theirs]{display:none}
#hf-ui-layer[data-dock=below] .hf-shop__pick{min-height:44px}
#hf-ui-layer[data-dock=below] .hf-shop__stepbtn,#hf-ui-layer[data-dock=below] .hf-shop .hf-btn{min-height:44px;min-width:44px}
/* Phones and small windows: the shop is a full-screen sheet, not a sliver beside the world. The UI layer is
   lifted over the hotbar and the on-screen pad while it is open (they'd cover the basket); x closes it. */
@media (pointer:coarse), (max-width:820px), (max-height:560px){
  body[data-shop=on] #hf-ui-layer{z-index:46 !important}
  body[data-shop=on] #hf-pad{visibility:hidden}
  #hf-ui-layer .hf-sheet.hf-sheet--shop[open]{position:fixed;left:calc(6px + env(safe-area-inset-left,0px));right:calc(6px + env(safe-area-inset-right,0px));top:calc(6px + env(safe-area-inset-top,0px));bottom:calc(6px + env(safe-area-inset-bottom,0px));width:auto;height:auto;max-height:none;border-radius:var(--hf-r-xl);animation-name:hf-in-below}
  #hf-ui-layer .hf-sheet.hf-sheet--shop[open]::before{content:none}
  .hf-sheet--shop .hf-sheet__body{padding:10px 12px 0}
  .hf-sheet--shop .hf-shop{gap:10px}
  .hf-sheet--shop .hf-shop__tab{min-height:48px;font-size:1.05em}
  .hf-sheet--shop .hf-shop__cols{align-items:stretch}
  .hf-sheet--shop .hf-shop .hf-shop__rows{gap:6px;align-items:stretch}
  .hf-sheet--shop .hf-shop__row{width:100%;box-sizing:border-box;align-self:stretch}
  .hf-sheet--shop .hf-shop__pick{width:100%;grid-template-columns:auto minmax(0,1fr) auto auto}
  .hf-sheet--shop .hf-shop__pick{min-height:56px;padding:6px 10px;gap:10px;font-size:1.08em}
  .hf-sheet--shop .hf-shop__pick canvas,.hf-sheet--shop .hf-shop__pick img{width:32px;height:32px}
  .hf-sheet--shop .hf-shop__price{font-size:1em;padding:2px 10px}
  .hf-sheet--shop .hf-shop__stepbtn,.hf-sheet--shop .hf-shop .hf-btn{min-height:48px;min-width:48px;font-size:1.1em}
  .hf-sheet--shop .hf-shop__step{padding:0 10px 8px}
  .hf-sheet--shop .hf-shop__foot{margin:auto -12px 0;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));bottom:0}
  .hf-sheet--shop .hf-shop__settle{min-height:52px;font-size:1.2em}
}
/* A phone on its side: little height, so the basket bar becomes one compact row beside the totals. */
@media (max-height:560px) and (orientation:landscape){
  .hf-sheet--shop .hf-sheet__head{padding:4px 6px 4px 12px}
  .hf-sheet--shop .hf-shop__pick{min-height:46px}
  .hf-sheet--shop .hf-shop__foot{flex-direction:row;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:6px 12px}
  .hf-sheet--shop .hf-shop__foot .hf-muted{display:none}
  .hf-sheet--shop .hf-shop__basket{max-height:3em;flex:1 1 40%}
  .hf-sheet--shop .hf-shop__acts{flex:1 1 280px}
  .hf-sheet--shop .hf-shop__settle{min-height:44px}
}
`;
}
let shopInjected = false;
/** Called by the shop sheet as it renders, so this block stays separate from the panels sheet above. */
export function ensureShopStyles(): void {
  if (shopInjected || typeof document === 'undefined') return;
  shopInjected = true;
  const style = document.createElement('style');
  style.id = 'hf-shop-style';
  style.textContent = shopCss();
  document.head.append(style);
}
// ==== END SHOP SHEET ====
