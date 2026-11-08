/**
 * Structural CSS for what only the panels area draws outside a sheet: the canvas-aligned layer, hotbar,
 * minimap, drag ghost and item icons. Colours come from the kit's CSS variables (with palette fallbacks),
 * so the kit stylesheet themes everything; sheet bodies use the kit's shared classes (hf-btn, hf-tabs,
 * hf-slots, hf-rows, hf-pre, hf-field, hf-muted, hf-note).
 */
const CSS = `
.hf-panels-layer{position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:20;font-family:var(--hf-font-ui,system-ui,sans-serif);color:var(--hf-text-primary,#E8DCC8)}
.hf-panels-layer [hidden]{display:none !important}
.hf-hotbar{position:absolute;left:50%;bottom:6px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:none}
.hf-hotbar__name{min-height:1.2em;font-size:12px;text-shadow:0 1px 2px var(--hf-void,#0B0A0F),0 0 3px var(--hf-void,#0B0A0F)}
.hf-hotbar__slots{display:flex;gap:2px;pointer-events:auto;touch-action:none}
.hf-hotbar .hf-hotslot{position:relative;width:var(--hf-slot,38px);height:var(--hf-slot,38px);padding:0;display:flex;align-items:center;justify-content:center;background:var(--hf-surface,#1B1612);opacity:.92;border:2px solid var(--hf-line-quiet,#4A4036);border-radius:4px;color:inherit;font:inherit;cursor:pointer;touch-action:none}
.hf-hotbar .hf-hotslot[aria-pressed=true]{border-color:var(--hf-accent,#F2B84B);opacity:1}
.hf-hotslot .hf-icon{transform:scale(var(--hf-icon-scale,1))}
.hf-hotbar .hf-hotslot.is-empty .hf-icon{opacity:.28;filter:grayscale(1)}
.hf-hotslot__key{position:absolute;left:3px;top:1px;font:10px/1 var(--hf-font-mono,monospace);color:var(--hf-text-muted,#8A7A68)}
.hf-hotslot__qty{position:absolute;right:3px;bottom:2px;font:11px/1 var(--hf-font-mono,monospace);text-shadow:0 1px 1px var(--hf-void,#0B0A0F)}
.hf-hotslot__mark{position:absolute;right:3px;top:1px;font-size:10px;color:var(--hf-glow,#F0D878)}
.hf-icon{display:inline-block;width:24px;height:24px;flex:none;background-repeat:no-repeat;image-rendering:pixelated}
.hf-drag-ghost{position:fixed;z-index:60;pointer-events:none;transform:translate(-50%,-60%);padding:4px;border:2px solid var(--hf-accent,#F2B84B);border-radius:50%;background:var(--hf-surface,#1B1612)}
.hf-minimap{position:absolute;right:8px;top:8px;width:var(--hf-mini-w,132px);height:auto;aspect-ratio:132/92;pointer-events:auto;cursor:pointer;border:1px solid var(--hf-line,#8A6A44);border-radius:4px;background:var(--hf-surface,#1B1612);image-rendering:pixelated}
.hf-map-canvas{display:block;width:100%;border:1px solid var(--hf-line,#8A6A44);border-radius:4px;image-rendering:pixelated}
.hf-legend{display:flex;flex-wrap:wrap;gap:2px 10px;margin:6px 0 0;padding:0;list-style:none}
.hf-legend i{display:inline-block;width:10px;height:3px;margin-right:4px;vertical-align:middle}
.hf-satchel-tip{margin:8px 0 0;white-space:pre-wrap}
.hf-roads{display:flex;flex-direction:column;gap:10px}
.hf-road h3{margin:0 0 4px;font-size:1em;font-weight:normal;color:var(--hf-accent,#F2B84B)}
.hf-road .hf-btn{display:block;width:100%;text-align:left;margin:2px 0}
.hf-inbox .hf-btn{display:block;width:100%;text-align:left;margin:2px 0}
.hf-inbox .is-unread{border-color:var(--hf-accent,#F2B84B)}
.hf-letter-read{margin:8px 0;white-space:pre-wrap}
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
