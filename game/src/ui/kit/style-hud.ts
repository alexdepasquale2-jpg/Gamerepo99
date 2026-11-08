/**
 * HUD chips over the canvas (spark bar, day chip, letters, purse, ☰) and the touch bar. Everything sits
 * in the canvas-aligned layer and scales with `--hf-u`; anything near the bottom lifts by
 * `--hf-pad-overlap` so the on-screen pad never covers it.
 */
import { HUD_LAYOUT, rgba } from './tokens';

const chipGlass = `@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){.hf-chip{background:${rgba('void', 0.42)};-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}}`;

export const HUD_CSS = `
.hf-chip{position:absolute;display:flex;align-items:center;gap:6px;box-sizing:border-box;padding:3px 10px;border-radius:var(--hf-r-pill);background:${rgba('void', 0.62)};border:1px solid ${rgba('line', 0.2)};box-shadow:var(--hf-shadow1);color:var(--hf-fg-muted);font:500 var(--hf-fs-label)/1.4 var(--hf-font-ui);white-space:nowrap}
${chipGlass}
button.hf-chip{cursor:pointer;transition:background-color var(--hf-dur-fast),border-color var(--hf-dur-fast),transform var(--hf-dur-fast) var(--hf-ease)}
button.hf-chip:hover{border-color:var(--hf-border-strong)}
button.hf-chip:active{transform:scale(.96)}
button.hf-chip:focus-visible{outline:2px solid var(--hf-focus);outline-offset:2px}
#hf-daybar{top:calc(var(--hf-u) * 4px);left:50%;transform:translateX(-50%);pointer-events:none;letter-spacing:.03em;font-variant-numeric:tabular-nums}
#hf-daybar #hf-status{color:var(--hf-fg);font-weight:600}
#hf-daybar[hidden],#hf-letter-chip[hidden],#hf-menu-btn[hidden]{display:none}
#hf-letter-chip{right:0;top:calc(var(--hf-u) * ${HUD_LAYOUT.lettersTop}px);min-height:max(28px,var(--hf-tap));padding:3px 12px 3px 14px;border-radius:var(--hf-r-pill) 0 0 var(--hf-r-pill);border:1px solid ${rgba('glow', 0.45)};border-right:0;color:var(--hf-glow);font-weight:600;box-shadow:0 0 14px ${rgba('glow', 0.18)}}
#hf-menu-btn{left:calc(var(--hf-u) * 6px);bottom:calc(var(--hf-u) * 6px + var(--hf-pad-overlap));min-width:max(36px,var(--hf-tap));min-height:max(34px,var(--hf-tap));justify-content:center;border-radius:var(--hf-r-md);border-color:var(--hf-border-strong);color:var(--hf-fg);font-size:18px}

#hf-spark{position:absolute;left:calc(var(--hf-u) * ${HUD_LAYOUT.spark.x}px);top:calc(var(--hf-u) * ${HUD_LAYOUT.spark.y}px);width:calc(var(--hf-u) * ${HUD_LAYOUT.spark.w}px);height:max(7px,calc(var(--hf-u) * ${HUD_LAYOUT.spark.h}px));box-sizing:border-box;border:1px solid ${rgba('sparkOutline', 0.85)};border-radius:var(--hf-r-pill);background:var(--hf-spark-empty);box-shadow:0 0 0 2px ${rgba('void', 0.45)},0 1px 6px ${rgba('void', 0.4)};overflow:hidden;pointer-events:none}
#hf-spark > i{display:block;height:100%;width:100%;transform-origin:left center;transform:scaleX(var(--v,1));background:linear-gradient(180deg,${rgba('glow', 0.95)},var(--hf-spark-fill) 55%);box-shadow:0 0 8px ${rgba('sparkFill', 0.55)};transition:transform .6s var(--hf-ease)}
#hf-spark.is-low{animation:hf-gutter 1.8s ease-in-out infinite}
@keyframes hf-gutter{50%{border-color:${rgba('sparkOutline', 0.3)};box-shadow:0 0 0 2px ${rgba('void', 0.45)},0 0 10px ${rgba('wound', 0.8)}}}
#hf-purse{left:calc(var(--hf-u) * ${HUD_LAYOUT.hotbar.x}px);bottom:calc(var(--hf-u) * ${360 - HUD_LAYOUT.hotbar.y + 4}px + var(--hf-pad-overlap));color:var(--hf-glow);font-family:var(--hf-font-mono);font-variant-numeric:tabular-nums;pointer-events:none}

#hf-touch{position:absolute;left:0;right:0;bottom:calc(var(--hf-u) * 6px);height:0;pointer-events:none}
#hf-ui-layer[data-dock=below] #hf-touch{bottom:calc(8px + env(safe-area-inset-bottom,0px) - var(--hf-below))}
#hf-touch .hf-tgrp{position:absolute;bottom:0;display:flex;gap:calc(var(--hf-u) * 4px);align-items:flex-end;pointer-events:auto}
#hf-touch .hf-tgrp--l{left:max(calc(var(--hf-u) * 6px),env(safe-area-inset-left,0px));max-width:calc(var(--hf-u) * 188px)}
#hf-touch .hf-tgrp--r{right:max(calc(var(--hf-u) * 6px),env(safe-area-inset-right,0px))}
#hf-ui-layer[data-dock=below] #hf-touch .hf-tgrp--l,#hf-ui-layer[data-dock=below] #hf-touch .hf-tgrp--r{max-width:none}
.hf-tb{position:relative;min-width:max(44px,calc(var(--hf-u) * ${HUD_LAYOUT.touchBtn}px));min-height:max(44px,calc(var(--hf-u) * ${HUD_LAYOUT.touchBtn}px));padding:2px 8px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;background:${rgba('surface', 0.72)};color:var(--hf-fg);border:1px solid var(--hf-border-strong);border-radius:var(--hf-r-md);box-shadow:var(--hf-shadow2);font:500 var(--hf-fs-label)/1.1 var(--hf-font-ui);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform var(--hf-dur-fast) var(--hf-ease),background-color var(--hf-dur-fast)}
.hf-tb b{font-size:1.35em;font-weight:normal;line-height:1}
.hf-tb:active{background:var(--hf-surface-active);transform:scale(.95)}
.hf-tb:focus-visible{outline:2px solid var(--hf-focus);outline-offset:2px}
.hf-tb--act{min-width:max(64px,calc(var(--hf-u) * 56px));border-color:var(--hf-accent);color:var(--hf-accent);background:${rgba('surface', 0.82)};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hf-tb--act span{max-width:calc(var(--hf-u) * 110px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hf-tb .hf-badge{position:absolute;top:-6px;right:-6px;min-width:18px;padding:0 5px;box-sizing:border-box;border-radius:var(--hf-r-pill);background:var(--hf-glow);color:var(--hf-void);font:bold 11px/18px var(--hf-font-mono);box-shadow:0 0 0 2px ${rgba('void', 0.7)}}
`;
