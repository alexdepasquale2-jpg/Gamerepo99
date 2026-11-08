/**
 * The one bubble look: kit colours from docs/art/PALETTE.md ("UI / overlay tokens" and the warm ramps),
 * crisp DOM text over the canvas. Injected once as a <style> element; sizes scale with the canvas
 * through `--hfv-u` (CSS px per canvas px) set by the voice layer.
 */

export const VOICE_COLORS = {
  void: '#0B0A0F',
  text: '#E8DCC8',
  muted: '#8A7A68',
  surface: '#1C1612',
  line: '#B89860',
  lineQuiet: '#7A7060',
  accent: '#F2B84B',
  wound: '#7A2E2E',
  note: '#84B8B0',
  ember: '#D97B3A',
} as const;

export const VOICE_FONT = 'Georgia, "Times New Roman", serif';

/** Reading time: about 60 ms per character, never under 3.5 s. */
export function readMs(text: string, min = 3500): number {
  return Math.max(min, Math.round(text.length * 60));
}

const C = VOICE_COLORS;
const CSS = `
#hf-voice-layer { position: fixed; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 8; overflow: hidden; --hfv-u: 1; }
#hf-voice-layer .hfv { position: absolute; left: 0; top: 0; box-sizing: border-box; font-family: ${VOICE_FONT};
  color: ${C.text}; line-height: 1.28; text-align: left; white-space: normal; overflow-wrap: break-word;
  will-change: transform, opacity; opacity: 0; transition: opacity 180ms ease-out; -webkit-font-smoothing: antialiased; }
#hf-voice-layer .hfv.on { opacity: 1; }
#hf-voice-layer .hfv.gone { opacity: 0; transition-duration: 260ms; }
#hf-voice-layer .hfv-bubble { max-width: min(max(calc(var(--hfv-u) * 168px), 15em), 62%); min-width: calc(var(--hfv-u) * 24px);
  font-size: clamp(12px, calc(var(--hfv-u) * 7.5px), 18px); padding: calc(var(--hfv-u) * 3px) calc(var(--hfv-u) * 5px);
  background: rgba(28, 22, 18, 0.94); border: max(1px, calc(var(--hfv-u) * 1px)) solid ${C.line};
  border-radius: calc(var(--hfv-u) * 3px); box-shadow: 0 calc(var(--hfv-u) * 1px) 0 ${C.void}; }
#hf-voice-layer .hfv-bubble::after { content: ''; position: absolute; left: var(--hfv-tail, 50%); bottom: calc(var(--hfv-u) * -4px);
  width: calc(var(--hfv-u) * 6px); height: calc(var(--hfv-u) * 6px); margin-left: calc(var(--hfv-u) * -3px);
  background: inherit; border: inherit; border-top: none; border-left: none; transform: rotate(45deg) scaleY(0.8); }
#hf-voice-layer .hfv-bubble.warm { border-color: ${C.accent}; }
#hf-voice-layer .hfv-bubble.hard { border-color: ${C.wound}; }
#hf-voice-layer .hfv-bubble.plain { border-color: ${C.lineQuiet}; }
#hf-voice-layer .hfv-name { display: block; font-size: 0.78em; letter-spacing: 0.02em; color: ${C.accent}; opacity: 0.9; margin-bottom: 1px; }
#hf-voice-layer .hfv-bubble.hard .hfv-name { color: ${C.muted}; }
#hf-voice-layer .hfv-ember { display: inline-block; width: 0.45em; height: 0.45em; border-radius: 50%; background: ${C.ember};
  margin-right: 0.35em; vertical-align: 0.1em; animation: hfv-pulse 0.9s ease-in-out infinite alternate; }
@keyframes hfv-pulse { from { opacity: 0.45; } to { opacity: 1; } }
#hf-voice-layer .hfv-tell { max-width: min(max(calc(var(--hfv-u) * 150px), 13em), 56%); font-size: clamp(12px, calc(var(--hfv-u) * 7px), 17px);
  font-style: italic; padding: 1px calc(var(--hfv-u) * 4px); color: ${C.text}; background: rgba(11, 10, 15, 0.72);
  border-radius: calc(var(--hfv-u) * 2px); text-shadow: 0 1px 0 ${C.void}; text-align: center; }
#hf-voice-layer .hfv-tell.hard { color: #E8C8B8; border-left: 2px solid ${C.wound}; }
#hf-voice-layer .hfv-tip { max-width: min(max(calc(var(--hfv-u) * 160px), 14em), 60%); font-size: clamp(12px, calc(var(--hfv-u) * 7px), 17px);
  padding: calc(var(--hfv-u) * 2px) calc(var(--hfv-u) * 5px); background: rgba(28, 22, 18, 0.9);
  border: max(1px, calc(var(--hfv-u) * 1px)) dashed ${C.note}; border-radius: calc(var(--hfv-u) * 3px); color: ${C.text}; }
#hf-voice-layer .hfv-tip::before { content: '?'; color: ${C.note}; font-weight: bold; margin-right: 0.4em; }
`;

let injected: HTMLStyleElement | null = null;

export function injectVoiceStyle(): void {
  if (injected?.isConnected) return;
  injected = document.createElement('style');
  injected.id = 'hf-voice-style';
  injected.textContent = CSS;
  document.head.appendChild(injected);
}
