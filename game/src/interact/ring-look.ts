/**
 * The ring chips' look: pill chips led by a family glyph, layered over the interact layer's base CSS
 * (scoped under #ix-layer so it wins without editing that file). Colours keep the ring's meaning:
 * kind = teal, savage = rust, family = gold, held item = dashed. Glyphs are plain text symbols (with
 * the text-presentation selector) so no font or image is fetched and none turn into emoji.
 */
import { familyOf } from '../sim/play-session/verb-families';

const T = '︎';
const GLYPHS: Record<string, string> = {
  speak: `❝${T}`,
  help: `✚${T}`,
  give: `❦${T}`,
  promise: `✧${T}`,
  ask: '?',
  deal: `⚖${T}`,
  use: `✦${T}`,
  work: `⚒${T}`,
  other: '⋯',
};

/** The glyph for a chip: a family chip by its own id (`family:speak`), a verb by the family it sits in. */
export function glyphFor(c: { id: string; family?: string }): string {
  const fam = c.id.startsWith('family:') ? c.id.slice('family:'.length).replace(/-\d+$/, '') : familyOf({ id: c.id, family: c.family });
  return GLYPHS[fam] ?? GLYPHS[fam.replace(/\d+$/, '')] ?? '•';
}

const CSS = `
#ix-layer .ix-ring{gap:6px;filter:drop-shadow(0 6px 14px rgba(11,10,15,.45))}
#ix-layer .ix-grid{gap:6px}
#ix-layer .ix-chip{display:inline-flex;align-items:center;gap:6px;min-width:calc(var(--ix-fs)*6.5);min-height:max(calc(var(--ix-fs)*2.4),var(--hf-tap,32px));padding:3px 12px 3px 4px;
  background:rgba(28,22,18,.92);color:#CDEEE8;border:1.5px solid rgba(132,184,176,.8);border-radius:999px;font:500 var(--ix-fs)/1.1 var(--hf-font-ui,system-ui,sans-serif);
  box-shadow:0 1px 2px rgba(11,10,15,.5);transition:background-color .12s,transform .12s cubic-bezier(.2,.8,.2,1),box-shadow .12s;animation:ix-chip-in .16s cubic-bezier(.2,.8,.2,1) both}
@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){#ix-layer .ix-chip{background:rgba(28,22,18,.78);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}}
#ix-layer .ix-chip:hover{background:rgba(62,58,48,.95);transform:translateY(-1px)}
#ix-layer .ix-chip:focus-visible{outline:none;box-shadow:0 0 0 2px #0B0A0F,0 0 0 4px #5EC8C8}
#ix-layer .ix-chip:active{transform:scale(.95)}
#ix-layer .ix-chip.savage{border-color:rgba(200,102,74,.9);color:#F0B8A0}
#ix-layer .ix-chip.family{border-color:rgba(224,184,106,.9);color:#F2D79A}
#ix-layer .ix-chip.held{border-style:dashed}
#ix-layer .ix-glyph{flex:none;display:inline-grid;place-items:center;width:1.9em;height:1.9em;border-radius:50%;background:rgba(132,184,176,.18);font-style:normal;font-size:.95em;line-height:1}
#ix-layer .ix-chip.savage .ix-glyph{background:rgba(200,102,74,.2)}
#ix-layer .ix-chip.family .ix-glyph{background:rgba(242,184,75,.2)}
#ix-layer .ix-chip sup{left:auto;right:-4px;top:-6px;display:grid;place-items:center;min-width:1.5em;height:1.5em;padding:0 .2em;box-sizing:border-box;border-radius:999px;
  background:#0B0A0F;border:1px solid rgba(122,112,96,.8);color:#A89068;font:600 .6em/1 var(--hf-font-mono,monospace)}
@media (pointer:coarse){#ix-layer .ix-chip sup{display:none}}
/* A narrow phone: compact chips so three fit a row without burying the world. */
@media (max-width:560px){#ix-layer .ix-chip{min-width:0;padding:2px 10px 2px 3px;gap:4px;font-size:min(var(--ix-fs),14px)}}
#ix-layer .ix-head{min-height:max(28px,var(--hf-tap,28px));padding:2px 12px;border-radius:999px;background:rgba(11,10,15,.6);border:1px solid rgba(224,184,106,.45);font:600 var(--ix-fs)/1.1 var(--hf-font-ui,system-ui,sans-serif)}
#ix-layer .ix-head:focus-visible{outline:2px solid #5EC8C8;outline-offset:2px}
#ix-layer .ix-tip{padding:4px 10px;border-radius:8px;background:rgba(28,22,18,.96);border-color:rgba(184,152,96,.4);box-shadow:0 6px 18px rgba(11,10,15,.5);font-family:var(--hf-font-ui,system-ui,sans-serif)}
@keyframes ix-chip-in{from{opacity:0;transform:translateY(6px) scale(.9)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){#ix-layer .ix-chip,#ix-layer .ix-prompt{animation:none;transition:none}}
`;

/** Inject once (a scene restart re-creates the layer, not this). */
export function ensureRingLook(): void {
  if (typeof document === 'undefined' || document.getElementById('ix-ring-look')) return;
  const s = document.createElement('style');
  s.id = 'ix-ring-look';
  s.textContent = CSS;
  document.head.appendChild(s);
}
