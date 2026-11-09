/** New game, last step: who tells the tale? The storyteller paces what befalls you (sim/storyteller). */
import { TELLERS } from '../../sim/storyteller/data';
import { openMenu, type MenuHandle } from '../kit/menu';

export function openTellerMenu(io: { onPick: (tellerId: string) => void; onBack: () => void }): MenuHandle {
  return openMenu(
    'Who tells the tale?',
    [
      ...TELLERS.map((t) => ({ id: `teller-${t.id}`, label: `${t.name}, ${t.title}`, hint: t.blurb, onPick: () => io.onPick(t.id) })),
      { id: 'back', label: 'Back', onPick: io.onBack },
    ],
    { id: 'hf-teller-menu', onEscape: io.onBack, note: 'The teller decides when trouble comes, how hard, and when you are left in peace.' },
  );
}
