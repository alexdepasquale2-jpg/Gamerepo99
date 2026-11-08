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
