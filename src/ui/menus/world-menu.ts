/** New game, second step: which world? The one you know (seed 42), a new one, or one by its number. */
import { DEFAULT_SOCIAL_SEED } from '../../sim/social/social-web-build';
import { openMenu, type MenuHandle } from './dom';

/** The world every earlier run was played in (the social web is baked for it). */
export const KNOWN_WORLD = DEFAULT_SOCIAL_SEED;
/** Highest world number a player can type: up to 9 digits (keeps ids short and seeds exact). */
export const MAX_WORLD = 999_999_999;

/** A rolled world number in [1, 99999], never the known world. `r` is a [0,1) draw. */
export function rollWorldSeed(r: number): number {
  const n = 1 + Math.floor(Math.min(Math.max(r, 0), 0.999999) * 99_999);
  return n === KNOWN_WORLD ? n + 1 : n;
}

/** "World 73104", " 73104 ", "#73104" -> 73104; anything else -> null. */
export function parseWorldNumber(text: string): number | null {
  const t = text.trim().replace(/^world\s*/i, '').replace(/^#/, '');
  return /^\d{1,9}$/.test(t) ? Number(t) : null; // 9 digits == MAX_WORLD
}

const INPUT_STYLE =
  'display:flex;gap:8px;margin:6px 0 2px;align-items:center';
const FIELD_STYLE =
  'flex:1;min-width:0;padding:6px 8px;background:#1b1714;border:1px solid #b89860;color:#f4e6c8;font:inherit';
const GO_STYLE =
  'padding:6px 12px;background:#3a3028;border:1px solid #f2b84b;color:#f4e6c8;font:inherit;cursor:pointer';

export function openWorldMenu(io: { newSeed: number; onPick: (seed: number) => void; onBack: () => void }): MenuHandle {
  const form = document.createElement('form');
  form.id = 'hf-world-seed-form';
  form.style.cssText = `${INPUT_STYLE};display:none`;
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  input.placeholder = 'World number';
  input.setAttribute('aria-label', 'World number');
  input.dataset.id = 'world-seed-input';
  input.maxLength = 16;
  input.style.cssText = FIELD_STYLE;
  const go = document.createElement('button');
  go.type = 'submit';
  go.dataset.id = 'world-seed-go';
  go.textContent = 'Go';
  go.style.cssText = GO_STYLE;
  form.append(input, go);
  // Typing here is for the field only: keep keys from reaching window/document listeners (game hotkeys).
  form.addEventListener('keydown', (e) => e.key !== 'Escape' && e.stopPropagation());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const seed = parseWorldNumber(input.value);
    if (seed === null) handle.setNote(`A world number is a whole number from 0 to ${MAX_WORLD}.`);
    else io.onPick(seed);
  });

  const handle = openMenu(
    'Which world?',
    [
      {
        id: 'world-known',
        label: 'This world (the one you know)',
        hint: `World ${KNOWN_WORLD}: the towns, roads and people you have met before.`,
        onPick: () => io.onPick(KNOWN_WORLD),
      },
      {
        id: 'world-new',
        label: 'A new world',
        hint: `World ${io.newSeed}: other towns, other people, other ties between them.`,
        onPick: () => io.onPick(io.newSeed),
      },
      {
        id: 'world-enter',
        label: 'Enter a world number',
        hint: 'Go back to a world you, or someone else, played before.',
        onPick: () => {
          form.style.display = 'flex';
          input.focus();
          handle.setNote('Type the number, then Go.');
        },
      },
      { id: 'back', label: 'Back', onPick: io.onBack },
    ],
    { id: 'hf-world-pick-menu', onEscape: io.onBack, note: 'Every world has its own towns, people and web of ties.' },
  );
  // The number field sits under "Enter a world number".
  const enter = handle.el.querySelector('[data-id=world-enter]');
  enter?.after(form);
  return handle;
}
