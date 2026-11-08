/**
 * The kit's one stylesheet. Colours come from tokens (as CSS variables), never inline hex. Sheets and
 * HUD chips live in the canvas-aligned layer and size from its variables (--hf-u, --hf-fs-*); centred
 * menus and the end screens cover the whole window.
 */
import { cssVars, rgba, Z } from './tokens';

export const KIT_CSS = `
:root{${cssVars()}}
.hf-menu{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:${rgba('void', 0.72)};z-index:${Z.menu};font:16px/1.4 var(--hf-font-ui);color:var(--hf-text-primary)}
.hf-panel{min-width:min(320px,90vw);max-width:min(560px,92vw);max-height:92vh;overflow-y:auto;box-sizing:border-box;padding:18px 24px;background:${rgba('surface', 0.96)};border:1px solid var(--hf-line);border-radius:6px;box-shadow:0 6px 28px ${rgba('void', 0.6)}}
.hf-panel h1{margin:0 0 10px;font-size:21px;color:var(--hf-accent);font-weight:normal;letter-spacing:.02em}
.hf-item{display:block;width:100%;text-align:left;margin:2px 0;padding:6px 10px;min-height:34px;background:none;border:1px solid transparent;border-radius:4px;color:inherit;font:inherit;cursor:pointer}
.hf-item:hover{background:${rgba('surfaceRaised', 0.6)}}
.hf-item[aria-selected=true]{border-color:var(--hf-accent);background:var(--hf-surface-raised)}
.hf-item:focus-visible{outline:2px solid var(--hf-spark-outline);outline-offset:1px}
.hf-item[disabled]{opacity:.5;cursor:default}
.hf-hint{display:block;font-size:.82em;color:var(--hf-hint)}
.hf-note{min-height:1.4em;margin-top:10px;font-size:.88em;color:var(--hf-note)}
.hf-arrival{margin:0 0 12px;padding:0 0 0 18px;max-width:520px;font-size:15px}
.hf-arrival li{margin:4px 0}
@media (max-height:420px){.hf-menu{font-size:15px}.hf-panel{padding:12px 18px}.hf-panel h1{font-size:18px;margin-bottom:6px}.hf-arrival{font-size:13px}}

#hf-ui-layer{font-family:var(--hf-font-ui);color:var(--hf-text-primary)}
#hf-ui-layer > *{pointer-events:auto}
#hf-ui-layer [hidden]{display:none !important}
.hf-sheet,.hf-menu.hf-menu--sheet{position:absolute;inset:auto;left:var(--hf-sheet-left);top:var(--hf-sheet-top);width:var(--hf-sheet-width);height:auto;max-width:none;max-height:var(--hf-sheet-height);margin:0;box-sizing:border-box;display:flex;flex-direction:column;padding:0;background:${rgba('surface', 0.93)};color:var(--hf-text-primary);border:1px solid ${rgba('line', 0.7)};border-left:3px solid var(--hf-line);border-radius:6px;box-shadow:0 4px 18px ${rgba('void', 0.55)};font:var(--hf-fs-body)/1.4 var(--hf-font-ui);overflow:hidden;z-index:1}
.hf-sheet:not([open]){display:none}
#hf-ui-layer[data-dock=below] .hf-sheet,#hf-ui-layer[data-dock=below] .hf-menu--sheet{border-left:1px solid ${rgba('line', 0.7)};border-top:3px solid var(--hf-line)}
.hf-menu.hf-menu--sheet{align-items:stretch;justify-content:flex-start}
.hf-menu--sheet .hf-panel{min-width:0;max-width:none;max-height:none;min-height:0;overflow-y:auto;border:0;border-radius:0;box-shadow:none;background:none;padding:10px 12px}
.hf-menu--sheet .hf-panel h1{font-size:var(--hf-fs-heading)}
.hf-sheet__head{display:flex;align-items:center;gap:8px;padding:8px 10px 6px 12px;border-bottom:1px solid ${rgba('lineQuiet', 0.5)}}
.hf-sheet__head h2{flex:1;margin:0;font-size:var(--hf-fs-heading);font-weight:normal;color:var(--hf-accent);line-height:1.25}
.hf-sheet__x{flex:none;min-width:32px;min-height:32px;background:none;border:1px solid transparent;border-radius:4px;color:var(--hf-text-muted);font:inherit;cursor:pointer}
.hf-sheet__x:hover{color:var(--hf-text-primary);border-color:${rgba('line', 0.5)}}
.hf-sheet__body{flex:1;min-height:0;overflow:auto;padding:8px 12px}
.hf-sheet__foot{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 12px;border-top:1px solid ${rgba('lineQuiet', 0.5)}}
.hf-btn{min-height:32px;padding:4px 10px;background:var(--hf-surface-raised);color:var(--hf-text-primary);border:1px solid ${rgba('line', 0.6)};border-radius:4px;font:inherit;cursor:pointer}
.hf-btn:hover:not([disabled]){border-color:var(--hf-accent)}
.hf-btn:active:not([disabled]){background:var(--hf-surface-active)}
.hf-btn[disabled]{color:var(--hf-disabled);background:none;cursor:default}
.hf-btn[aria-pressed=true],.hf-btn.is-on{border-color:var(--hf-accent);color:var(--hf-accent)}
.hf-btn:focus-visible,.hf-sheet__x:focus-visible{outline:2px solid var(--hf-spark-outline);outline-offset:1px}
.hf-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:6px 12px 0}
.hf-tabs .hf-btn{font-size:var(--hf-fs-label);min-height:28px;padding:2px 8px}
.hf-pre{margin:0;white-space:pre-wrap;font:inherit}
.hf-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(13em,1fr));gap:4px 14px}
.hf-muted{color:var(--hf-text-muted)}
.hf-small{font-size:var(--hf-fs-label)}
.hf-glow{color:var(--hf-glow)}
.hf-rows{display:grid;grid-template-columns:minmax(5em,1fr) auto auto auto;gap:4px 8px;align-items:center}
.hf-rows .hf-head{color:var(--hf-text-muted);font-size:var(--hf-fs-label)}
.hf-num{font-family:var(--hf-font-mono);font-size:var(--hf-fs-label);text-align:right}
.hf-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(4.2em,1fr));gap:6px}
.hf-slot{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;min-height:48px;padding:6px 4px 4px;background:${rgba('surfaceRaised', 0.7)};border:1px solid ${rgba('lineQuiet', 0.8)};border-radius:4px;color:inherit;font:inherit;font-size:var(--hf-fs-label);cursor:pointer}
.hf-slot[aria-pressed=true]{border-color:var(--hf-accent);background:var(--hf-surface-active)}
.hf-swatch{width:14px;height:14px;border-radius:3px;border:1px solid ${rgba('void', 0.9)}}
.hf-qty{position:absolute;right:4px;top:2px;font-family:var(--hf-font-mono)}
.hf-field{box-sizing:border-box;width:100%;padding:6px 8px;background:${rgba('void', 0.6)};border:1px solid ${rgba('line', 0.7)};border-radius:4px;color:var(--hf-text-primary);font:inherit}
.hf-field:focus{outline:2px solid var(--hf-spark-outline);outline-offset:0}
.hf-list-btn{display:block;width:100%;text-align:left;margin:0 0 4px;padding:6px 8px;min-height:32px;background:${rgba('surfaceRaised', 0.6)};border:1px solid ${rgba('lineQuiet', 0.8)};border-radius:4px;color:var(--hf-text-muted);font:inherit;cursor:pointer}
.hf-list-btn.is-unread{color:var(--hf-glow);border-color:var(--hf-line);font-weight:bold}
.hf-read{max-height:12em;overflow:auto;white-space:pre-wrap;padding:8px;margin:6px 0;background:${rgba('void', 0.55)};border-radius:4px}
.hf-label{display:block;margin:10px 0 4px;color:var(--hf-text-muted);font-size:var(--hf-fs-label)}

.hf-chip{position:absolute;display:flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;background:${rgba('void', 0.55)};color:var(--hf-text-muted);font:var(--hf-fs-label)/1.4 var(--hf-font-ui);white-space:nowrap}
#hf-daybar{top:calc(var(--hf-u) * 4px);left:50%;transform:translateX(-50%);pointer-events:none;letter-spacing:.03em}
#hf-daybar #hf-status{color:var(--hf-text-primary)}
#hf-daybar[hidden],#hf-letter-chip[hidden],#hf-menu-btn[hidden]{display:none}
#hf-letter-chip{right:0;top:calc(var(--hf-u) * 98px);border-radius:999px 0 0 999px;border:1px solid ${rgba('line', 0.7)};border-right:0;color:var(--hf-glow);min-height:28px;cursor:pointer}
#hf-menu-btn{left:calc(var(--hf-u) * 6px);bottom:calc(var(--hf-u) * 6px);min-width:36px;min-height:34px;justify-content:center;border:1px solid ${rgba('line', 0.6)};color:var(--hf-text-primary);font-size:18px;cursor:pointer}

.hf-modal{position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;box-sizing:border-box;text-align:center;background:${rgba('void', 0.88)};color:var(--hf-text-primary);font-family:var(--hf-font-ui);z-index:${Z.modal}}
.hf-modal h2{font-size:28px;font-weight:normal;margin:0;letter-spacing:.04em;color:var(--hf-accent)}
.hf-modal p{max-width:640px;margin:0;line-height:1.45}
.hf-choice{font:18px var(--hf-font-ui);padding:10px 28px;min-width:180px;color:var(--hf-text-primary);background:var(--hf-surface-raised);border:1px solid var(--hf-text-muted);border-radius:4px;cursor:pointer}
.hf-choice:focus-visible{outline:2px solid var(--hf-spark-outline);outline-offset:2px}
.hf-choice:hover{border-color:var(--hf-accent)}
.hf-row{display:flex;gap:16px;flex-wrap:wrap;justify-content:center}
`;

export function ensureKitStyle(): void {
  if (typeof document === 'undefined' || !document.head || document.getElementById('hf-kit-style')) return;
  const s = document.createElement('style');
  s.id = 'hf-kit-style';
  s.textContent = KIT_CSS;
  document.head.appendChild(s);
}
