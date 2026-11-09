/**
 * The Works chip under the spark bar: your Era and how far to the next, and the one tap that opens the
 * Works sheet (J on a keyboard). Hidden while a sheet, menu or modal is up.
 */
import type { GameContext } from '../../app/contracts';
import { eraRow, nextEra, ROMAN, worksIfAny } from '../../sim/works/state';
import { ensureWorksStyles } from './style';

export type WorksChip = { sync(): void; destroy(): void };

export function createWorksChip(ctx: GameContext, layer: HTMLElement, open: () => void): WorksChip {
  ensureWorksStyles();
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'hf-works-chip';
  chip.id = 'hf-works-chip';
  chip.title = 'The Works · J';
  // Keep the tap off the world (tap-to-walk and the ring listen on pointerdown).
  chip.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
  chip.addEventListener('click', (e) => { e.stopPropagation(); open(); });
  layer.append(chip);
  let last = '';
  return {
    sync() {
      const st = ctx.session.getState();
      chip.hidden = !st || ctx.panels?.anyOpen() || !!ctx.ui?.blocking();
      if (!st) return;
      const era = eraRow(st);
      const next = nextEra(st);
      const r = worksIfAny(st)?.renown ?? 0;
      const text = `⚙ Era <b>${ROMAN[era.era]}</b>${next ? ` · ${r}/${next.renown}` : ''}`;
      if (text !== last) { chip.innerHTML = text; last = text; chip.setAttribute('aria-label', `The Works: era ${era.era}, ${r} renown`); }
    },
    destroy() { chip.remove(); },
  };
}
