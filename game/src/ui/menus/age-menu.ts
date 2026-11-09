/**
 * New game, third step: how old is the world? Every district lives that many dawns before day 1
 * (sim/realm-bake): a preset, or any number from 0 to 100,000. A long past is baked in slices so the
 * screen can show it filling, then told back in a few lines before you begin.
 */
import { BAKE, BAKE_MAX, clampDawns, createBaker, rememberBake, realmSummary, yearsOf, type RealmBake } from '../../sim/realm-bake';
import { openMenu, type MenuHandle } from '../kit/menu';

/** "2800", " 2,800 dawns " -> 2800; anything else, or out of range -> null. */
export function parseDawns(text: string): number | null {
  const t = text.trim().replace(/\s*dawns?$/i, '').replace(/[,_\s]/g, '');
  if (!/^\d{1,7}$/.test(t)) return null;
  const n = Number(t);
  return n <= BAKE_MAX ? n : null;
}

const num = (n: number): string => n.toLocaleString('en-US');
/** Dawns baked per slice: small enough that the bar moves, large enough that the bake stays quick. */
const SLICE = 4000;

/** Bake `dawns` for `seed` in slices, reporting progress; resolves with the bake (null if cancelled). */
export function bakeInSlices(seed: number, dawns: number, onProgress: (done: number) => void, cancelled: () => boolean): Promise<RealmBake | null> {
  const baker = createBaker(seed, dawns);
  return new Promise((resolve) => {
    const step = (): void => {
      if (cancelled()) return resolve(null);
      const finished = baker.step(SLICE);
      onProgress(baker.done());
      if (finished) resolve(rememberBake(baker.result()));
      else setTimeout(step, 0);
    };
    step();
  });
}

export function openAgeMenu(io: { seed: number; onPick: (dawns: number) => void; onBack: () => void }): MenuHandle {
  let handle: MenuHandle;
  let cancelled = false;

  /** Bake it (the screen fills), tell it back, then Begin. A young world begins at once. */
  function choose(dawnsRaw: number): void {
    const dawns = clampDawns(dawnsRaw);
    if (!dawns) return io.onPick(0);
    handle.close();
    cancelled = false;
    const baking = openMenu(
      'The realm remembers',
      [{ id: 'age-cancel', label: 'Cancel', onPick: () => { cancelled = true; baking.close(); reopen(); } }],
      { id: 'hf-age-bake-menu', onEscape: () => { cancelled = true; baking.close(); reopen(); }, note: `Dawn 0 of ${num(dawns)}` },
    );
    void bakeInSlices(io.seed, dawns, (done) => baking.setNote(`Dawn ${num(done)} of ${num(dawns)}: every district living its years.`), () => cancelled).then((bake) => {
      if (!bake) return;
      baking.close();
      handle = openMenu(
        yearsOf(dawns) >= 1 ? `A world ${num(yearsOf(dawns))} years old` : `A world ${num(dawns)} dawns old`,
        [
          { id: 'age-begin', label: 'Begin', hint: 'Walk into it.', onPick: () => { handle.close(); io.onPick(dawns); } },
          { id: 'back', label: 'Choose another age', onPick: () => { handle.close(); reopen(); } },
        ],
        { id: 'hf-age-told-menu', onEscape: () => { handle.close(); reopen(); }, note: realmSummary(bake).join(' ') },
      );
    });
  }

  function reopen(): void {
    handle = build();
  }

  function build(): MenuHandle {
    const form = document.createElement('form');
    form.id = 'hf-age-form';
    form.style.cssText = 'display:none;gap:8px;margin:6px 0 2px;align-items:center';
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.placeholder = `Dawns, 0 to ${num(BAKE_MAX)}`;
    input.setAttribute('aria-label', 'Dawns of history');
    input.dataset.id = 'age-input';
    input.maxLength = 12;
    input.className = 'hf-field';
    input.style.cssText = 'flex:1;min-width:0';
    const go = document.createElement('button');
    go.type = 'submit';
    go.dataset.id = 'age-go';
    go.textContent = 'Bake';
    go.className = 'hf-btn';
    form.append(input, go);
    form.addEventListener('keydown', (e) => e.key !== 'Escape' && e.stopPropagation());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = parseDawns(input.value);
      if (n === null) m.setNote(`A whole number of dawns from 0 to ${num(BAKE_MAX)}.`);
      else choose(n);
    });
    const m = openMenu(
      'How old is the world?',
      [
        ...BAKE.presets.map((p) => ({ id: `age-${p.id}`, label: p.dawns ? `${p.label} (${num(p.dawns)} dawns)` : p.label, hint: p.hint, onPick: () => choose(p.dawns) })),
        {
          id: 'age-enter',
          label: 'Enter a number of dawns',
          hint: `Any age from 0 to ${num(BAKE_MAX)} dawns. 28 dawns make a year.`,
          onPick: () => { form.style.display = 'flex'; input.focus(); m.setNote('Type the dawns, then Bake.'); },
        },
        { id: 'back', label: 'Back', onPick: () => { m.close(); io.onBack(); } },
      ],
      { id: 'hf-age-menu', onEscape: () => { m.close(); io.onBack(); }, note: 'All hundred districts live every one of those dawns before you take a step.' },
    );
    m.el.querySelector('[data-id=age-enter]')?.after(form);
    return m;
  }

  handle = build();
  // The flow closes whatever menu is current: always the one on screen now.
  return { get el() { return handle.el; }, close: () => { cancelled = true; handle.close(); }, setNote: (t) => handle.setNote(t) };
}
