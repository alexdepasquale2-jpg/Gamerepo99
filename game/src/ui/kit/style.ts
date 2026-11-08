/**
 * The kit's one stylesheet. Colours come from tokens (as CSS variables), never inline hex. Sheets and
 * HUD chips live in the canvas-aligned layer and size from its variables (--hf-u, --hf-fs-*); centred
 * menus and the end screens cover the whole window. HUD and touch-bar rules live in style-hud.ts.
 *
 * Layout hooks other areas can rely on:
 * - `--hf-tap`: the minimum hit size (32px, 44px on a coarse pointer).
 * - `--hf-pad-reserve-bottom`: CSS px the on-screen pad takes from the window's bottom; 0 until
 *   `body[data-pad="on"]`. Sheets and HUD chips over the canvas lift by `--hf-pad-overlap`, the part of
 *   that reserve which actually overlaps the canvas (on a tall phone the pad sits in the empty band).
 */
import { HUD_CSS } from './style-hud';
import { cssVars, PAD_RESERVE_BOTTOM_PX, rgba, Z } from './tokens';

/** Glass where the browser can blur behind it; the solid ground stays as the fallback. */
const glass = (sel: string, blur = 'var(--hf-blur)'): string =>
  `@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){${sel}{background:var(--hf-glass);-webkit-backdrop-filter:blur(${blur}) saturate(1.2);backdrop-filter:blur(${blur}) saturate(1.2)}}`;

const ROOT = `
:root{${cssVars()}}
@media (pointer:coarse){:root{--hf-tap:var(--hf-tap-coarse)}}
body[data-pad=on]{--hf-pad-reserve-bottom:${PAD_RESERVE_BOTTOM_PX}px}
@media (orientation:landscape) and (max-height:540px){body[data-pad=on]{--hf-pad-reserve-bottom:${Math.round(PAD_RESERVE_BOTTOM_PX * 0.6)}px}}
#hf-ui-layer{--hf-pad-overlap:max(0px,calc(var(--hf-pad-reserve-bottom) - var(--hf-below)))}
@keyframes hf-rise{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes hf-in-side{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:none}}
@keyframes hf-in-below{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
@keyframes hf-fade{from{opacity:0}to{opacity:1}}
@keyframes hf-ember{0%,100%{opacity:.85;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}
`;

const MENU = `
.hf-menu{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:var(--hf-scrim);z-index:${Z.menu};font:15px/1.45 var(--hf-font-ui);color:var(--hf-fg);animation:hf-fade var(--hf-dur-med) ease-out both}
.hf-panel{min-width:min(340px,100%);max-width:min(520px,100%);max-height:100%;overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;padding:22px 22px 16px;background:var(--hf-glass-solid);border:1px solid var(--hf-border);border-radius:var(--hf-r-lg);box-shadow:var(--hf-shadow3);animation:hf-rise var(--hf-dur-med) var(--hf-ease) both}
${glass('.hf-menu:not(.hf-menu--sheet) > .hf-panel')}
.hf-panel h1{margin:0 0 14px;padding:0 0 12px;border-bottom:1px solid var(--hf-border);font:600 22px/1.2 var(--hf-font-display);color:var(--hf-accent);letter-spacing:.01em}
.hf-item{display:block;width:100%;box-sizing:border-box;text-align:left;margin:6px 0;padding:10px 14px;min-height:max(44px,var(--hf-tap));background:var(--hf-raised);border:1px solid var(--hf-border);border-radius:var(--hf-r-md);color:inherit;font:inherit;font-weight:500;cursor:pointer;transition:background-color var(--hf-dur-fast),border-color var(--hf-dur-fast),box-shadow var(--hf-dur-fast),transform var(--hf-dur-fast) var(--hf-ease)}
.hf-item:hover:not([disabled]){background:var(--hf-raised-hover);border-color:var(--hf-border-strong)}
.hf-item[aria-selected=true]{border-color:var(--hf-accent);background:var(--hf-accent-soft);box-shadow:inset 3px 0 0 var(--hf-accent)}
.hf-item:active:not([disabled]){transform:scale(.985);background:var(--hf-pressed)}
.hf-item:focus-visible{outline:2px solid var(--hf-focus);outline-offset:2px}
.hf-item[disabled]{opacity:.45;cursor:not-allowed;background:transparent}
.hf-hint{display:block;margin-top:2px;font-size:.84em;font-weight:400;color:var(--hf-fg-subtle)}
.hf-note{min-height:1.4em;margin-top:12px;padding-top:10px;border-top:1px solid var(--hf-border);font-size:.86em;color:var(--hf-note)}
.hf-note:empty{border-top-color:transparent}
.hf-arrival{margin:0 0 12px;padding:0 0 0 18px;max-width:520px;font-size:15px}
.hf-arrival li{margin:4px 0}
#hf-title-menu{background:radial-gradient(ellipse 80% 60% at 50% 105%,${rgba('sparkFill', 0.2)},transparent 70%),radial-gradient(ellipse at 50% 40%,${rgba('surface', 0.5)},${rgba('void', 0.92)} 75%)}
#hf-title-menu .hf-panel{max-width:min(420px,100%);padding:28px 26px 18px}
#hf-title-menu .hf-panel h1{text-align:center;font-size:clamp(28px,6vw,38px);font-weight:600;letter-spacing:.04em;border-bottom:0;margin-bottom:18px;padding-bottom:0;text-shadow:0 0 24px ${rgba('sparkFill', 0.35)}}
#hf-title-menu .hf-panel h1::before{content:'';display:block;width:12px;height:12px;margin:0 auto 14px;border-radius:50%;background:var(--hf-spark-fill);box-shadow:0 0 18px 6px ${rgba('sparkFill', 0.45)};animation:hf-ember 2.4s ease-in-out infinite}
#hf-title-menu .hf-note{text-align:center;font-style:italic;font-family:var(--hf-font-read);color:var(--hf-fg-muted)}
#hf-pause-menu .hf-panel{max-width:min(400px,100%)}
#hf-pause-menu .hf-note{font-family:var(--hf-font-mono);letter-spacing:.04em;color:var(--hf-fg-muted)}
@media (max-height:420px){.hf-menu{font-size:14px}.hf-panel{padding:12px 16px}.hf-panel h1{font-size:18px;margin-bottom:8px;padding-bottom:8px}.hf-item{margin:4px 0;padding:6px 12px}#hf-title-menu .hf-panel h1{font-size:24px;margin-bottom:8px}#hf-title-menu .hf-panel h1::before{margin-bottom:6px}.hf-arrival{font-size:13px}}
`;

/** Docked side sheet (desktop, phone landscape) and bottom sheet (phone portrait). */
const SHEET = `
#hf-ui-layer{font-family:var(--hf-font-ui);color:var(--hf-fg)}
#hf-ui-layer > *{pointer-events:auto}
#hf-ui-layer [hidden]{display:none !important}
.hf-sheet,.hf-menu.hf-menu--sheet{position:absolute;inset:auto;left:var(--hf-sheet-left);top:var(--hf-sheet-top);width:var(--hf-sheet-width);height:auto;max-width:none;max-height:max(min(var(--hf-sheet-height),160px),calc(var(--hf-sheet-height) - var(--hf-pad-overlap)));margin:0;box-sizing:border-box;display:flex;flex-direction:column;padding:0;background:var(--hf-glass-solid);color:var(--hf-fg);border:1px solid var(--hf-border);border-top-color:${rgba('line', 0.42)};border-radius:var(--hf-r-lg);box-shadow:var(--hf-shadow3);font:var(--hf-fs-body)/1.45 var(--hf-font-ui);overflow:hidden;z-index:1;animation:hf-in-side var(--hf-dur-med) var(--hf-ease) both}
${glass('.hf-sheet,.hf-menu.hf-menu--sheet')}
.hf-sheet:not([open]){display:none}
.hf-sheet::before,.hf-menu--sheet::before{content:none}
#hf-ui-layer[data-dock=below] .hf-sheet,#hf-ui-layer[data-dock=below] .hf-menu--sheet{left:calc(var(--hf-sheet-left) + env(safe-area-inset-left,0px));width:calc(var(--hf-sheet-width) - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px));max-height:calc(var(--hf-sheet-height) - env(safe-area-inset-bottom,0px));border-radius:var(--hf-r-xl) var(--hf-r-xl) var(--hf-r-lg) var(--hf-r-lg);animation-name:hf-in-below}
#hf-ui-layer[data-dock=below] .hf-sheet::before,#hf-ui-layer[data-dock=below] .hf-menu--sheet::before{content:'';flex:none;display:block;width:40px;height:5px;margin:8px auto 0;border-radius:var(--hf-r-pill);background:${rgba('textMuted', 0.55)}}
.hf-menu.hf-menu--sheet{align-items:stretch;justify-content:flex-start}
.hf-menu--sheet .hf-panel{min-width:0;max-width:none;max-height:none;min-height:0;overflow-y:auto;border:0;border-radius:0;box-shadow:none;background:none;padding:12px 16px;animation:none}
.hf-menu--sheet .hf-panel h1{font-size:var(--hf-fs-heading);margin-bottom:10px;padding-bottom:10px}
.hf-menu--sheet .hf-item{min-height:var(--hf-tap);padding:6px 12px;margin:4px 0}
.hf-sheet__head{flex:none;display:flex;align-items:center;gap:10px;padding:12px 10px 10px 16px;border-bottom:1px solid var(--hf-border)}
.hf-sheet__head h2{flex:1;min-width:0;margin:0;font:600 var(--hf-fs-heading)/1.25 var(--hf-font-display);color:var(--hf-accent);letter-spacing:.01em;overflow:hidden;text-overflow:ellipsis}
.hf-sheet__x{flex:none;display:grid;place-items:center;min-width:var(--hf-tap);min-height:var(--hf-tap);padding:0;background:transparent;border:1px solid transparent;border-radius:var(--hf-r-pill);color:var(--hf-fg-muted);font:inherit;line-height:1;cursor:pointer;transition:background-color var(--hf-dur-fast),color var(--hf-dur-fast)}
.hf-sheet__x:hover{color:var(--hf-fg);background:var(--hf-raised)}
.hf-sheet__x:active{background:var(--hf-pressed)}
.hf-sheet__body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:12px 16px;scrollbar-width:thin;scrollbar-color:${rgba('line', 0.45)} transparent}
.hf-sheet__foot{flex:none;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 16px;border-top:1px solid var(--hf-border);background:${rgba('void', 0.22)}}
@media (orientation:landscape) and (max-height:540px){.hf-sheet__head{padding:6px 6px 6px 12px}.hf-sheet__body{padding:8px 12px}.hf-sheet__foot{padding:6px 12px}.hf-menu--sheet .hf-panel{padding:8px 12px}}
`;

/** Buttons and the shared content classes every sheet body uses. */
const CONTROLS = `
.hf-btn{box-sizing:border-box;min-height:var(--hf-tap);padding:5px 14px;background:var(--hf-raised);color:var(--hf-fg);border:1px solid var(--hf-border-strong);border-radius:var(--hf-r-md);font:inherit;font-weight:500;line-height:1.2;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:background-color var(--hf-dur-fast),border-color var(--hf-dur-fast),color var(--hf-dur-fast),transform var(--hf-dur-fast) var(--hf-ease)}
.hf-btn:hover:not([disabled]){background:var(--hf-raised-hover);border-color:var(--hf-accent)}
.hf-btn:active:not([disabled]){background:var(--hf-pressed);transform:translateY(1px)}
.hf-btn[disabled]{color:var(--hf-disabled);background:transparent;border-color:${rgba('lineQuiet', 0.35)};cursor:not-allowed}
.hf-btn[aria-pressed=true],.hf-btn.is-on{background:var(--hf-accent-soft);border-color:var(--hf-accent);color:var(--hf-accent)}
.hf-btn.is-primary:not([disabled]){background:var(--hf-accent);border-color:var(--hf-accent);color:var(--hf-on-accent)}
.hf-btn:focus-visible,.hf-sheet__x:focus-visible,.hf-list-btn:focus-visible,.hf-slot:focus-visible{outline:2px solid var(--hf-focus);outline-offset:2px}
.hf-tabs{flex:none;display:flex;gap:6px;padding:10px 16px 0;overflow-x:auto;scrollbar-width:none}
.hf-tabs::-webkit-scrollbar{display:none}
.hf-tabs .hf-btn{flex:none;font-size:var(--hf-fs-label);min-height:max(28px,calc(var(--hf-tap) - 4px));padding:2px 12px;border-radius:var(--hf-r-pill)}
.hf-pre{margin:0;white-space:pre-wrap;font:inherit}
.hf-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(13em,1fr));gap:6px 16px}
.hf-muted{color:var(--hf-fg-muted)}
.hf-small{font-size:var(--hf-fs-label)}
.hf-glow{color:var(--hf-glow)}
.hf-rows{display:grid;grid-template-columns:minmax(5em,1fr) auto auto auto;gap:6px 10px;align-items:center}
.hf-rows .hf-head{color:var(--hf-fg-muted);font-size:var(--hf-fs-label);font-weight:600;letter-spacing:.05em;text-transform:uppercase}
.hf-num{font-family:var(--hf-font-mono);font-size:var(--hf-fs-label);text-align:right;font-variant-numeric:tabular-nums}
.hf-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(4.4em,1fr));gap:8px}
.hf-slot{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;min-height:max(52px,var(--hf-tap));padding:8px 4px 6px;background:var(--hf-raised);border:1px solid var(--hf-border);border-radius:var(--hf-r-md);color:inherit;font:inherit;font-size:var(--hf-fs-label);cursor:pointer;transition:border-color var(--hf-dur-fast),background-color var(--hf-dur-fast),transform var(--hf-dur-fast) var(--hf-ease)}
.hf-slot:hover{border-color:var(--hf-border-strong);background:var(--hf-raised-hover)}
.hf-slot:active{transform:scale(.97)}
.hf-slot[aria-pressed=true]{border-color:var(--hf-accent);background:var(--hf-accent-soft);box-shadow:0 0 0 1px var(--hf-accent) inset}
.hf-swatch{width:14px;height:14px;border-radius:4px;border:1px solid ${rgba('void', 0.9)}}
.hf-qty{position:absolute;right:5px;top:3px;font-family:var(--hf-font-mono);font-variant-numeric:tabular-nums}
.hf-field{box-sizing:border-box;width:100%;min-height:var(--hf-tap);padding:6px 10px;background:${rgba('void', 0.55)};border:1px solid var(--hf-border-strong);border-radius:var(--hf-r-sm);color:var(--hf-fg);font:inherit;transition:border-color var(--hf-dur-fast),box-shadow var(--hf-dur-fast)}
.hf-field:focus{outline:none;border-color:var(--hf-focus);box-shadow:0 0 0 3px ${rgba('sparkOutline', 0.25)}}
.hf-list-btn{display:block;width:100%;box-sizing:border-box;text-align:left;margin:0 0 6px;padding:8px 12px;min-height:var(--hf-tap);background:var(--hf-raised);border:1px solid var(--hf-border);border-radius:var(--hf-r-md);color:var(--hf-fg-muted);font:inherit;cursor:pointer;transition:background-color var(--hf-dur-fast),border-color var(--hf-dur-fast)}
.hf-list-btn:hover{background:var(--hf-raised-hover);border-color:var(--hf-border-strong)}
.hf-list-btn.is-unread{color:var(--hf-glow);border-color:var(--hf-line);font-weight:600;box-shadow:inset 3px 0 0 var(--hf-glow)}
.hf-read{max-height:12em;overflow:auto;white-space:pre-wrap;padding:10px 12px;margin:8px 0;background:${rgba('void', 0.5)};border:1px solid var(--hf-border);border-radius:var(--hf-r-md);font-family:var(--hf-font-read);line-height:1.55}
.hf-label{display:block;margin:12px 0 4px;color:var(--hf-fg-muted);font-size:var(--hf-fs-label);font-weight:600;letter-spacing:.04em}
`;

const MODAL = `
.hf-modal{position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));box-sizing:border-box;text-align:center;background:radial-gradient(ellipse at 50% 40%,${rgba('surface', 0.82)},${rgba('void', 0.95)} 75%);color:var(--hf-fg);font-family:var(--hf-font-ui);z-index:${Z.modal};animation:hf-fade var(--hf-dur-med) ease-out both}
.hf-modal > *{animation:hf-rise var(--hf-dur-med) var(--hf-ease) both}
.hf-modal h2{font:600 clamp(24px,4.5vw,32px)/1.2 var(--hf-font-display);margin:0;letter-spacing:.03em;color:var(--hf-accent)}
.hf-modal p{max-width:640px;margin:0;line-height:1.55;font-family:var(--hf-font-read)}
.hf-choice{font:500 17px var(--hf-font-ui);padding:12px 28px;min-width:180px;min-height:48px;color:var(--hf-fg);background:var(--hf-raised);border:1px solid var(--hf-border-strong);border-radius:var(--hf-r-md);cursor:pointer;transition:background-color var(--hf-dur-fast),border-color var(--hf-dur-fast),transform var(--hf-dur-fast) var(--hf-ease)}
.hf-choice:hover{border-color:var(--hf-accent);background:var(--hf-raised-hover)}
.hf-choice:active{transform:translateY(1px);background:var(--hf-pressed)}
.hf-choice:focus-visible{outline:2px solid var(--hf-focus);outline-offset:3px}
.hf-row{display:flex;gap:14px;flex-wrap:wrap;justify-content:center}
`;

/** Every surface's motion is decoration: under reduced motion nothing animates or transitions. */
const REDUCED = `
@media (prefers-reduced-motion:reduce){.hf-menu,.hf-menu *,.hf-modal,.hf-modal *,#hf-ui-layer,#hf-ui-layer *,.hf-panels-layer *,#ix-layer *{animation:none !important;transition:none !important}}
`;

export const KIT_CSS = ROOT + MENU + SHEET + CONTROLS + MODAL + HUD_CSS + REDUCED;

export function ensureKitStyle(): void {
  if (typeof document === 'undefined' || !document.head || document.getElementById('hf-kit-style')) return;
  const s = document.createElement('style');
  s.id = 'hf-kit-style';
  s.textContent = KIT_CSS;
  document.head.appendChild(s);
}
