/** New game: pick who you are, or let the world roll someone. Every choice is a full inhabitant built from data. */
import type { ArchetypeDef } from '../../sim/types/data';
import { openMenu, type MenuHandle } from '../kit/menu';

export function openInhabitantMenu(
  archetypes: ArchetypeDef[],
  io: { onPick: (archetypeId: string) => void; onRoll: () => void; onBack: () => void },
): MenuHandle {
  return openMenu(
    'Who still lives here?',
    [
      ...archetypes.map((a) => ({
        id: `arch-${a.id}`,
        label: a.title ? `${a.name}, ${a.title}` : a.name,
        hint: a.blurb,
        onPick: () => io.onPick(a.id),
      })),
      { id: 'roll', label: 'Let the world choose', hint: 'Roll someone from those who could live here.', onPick: io.onRoll },
      { id: 'back', label: 'Back', onPick: io.onBack },
    ],
    { id: 'hf-inhabitant-menu', onEscape: io.onBack, note: 'Each body moves, speaks and burns differently.' },
  );
}
