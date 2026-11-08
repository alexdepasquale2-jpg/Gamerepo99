/** World file export/import (M5 versioned files). Pure helpers first; DOM below. */
import { importWorld, type Arrival } from '../../sim/legacy';
import { keepImportedLegends } from '../../sim/contrib/legends';
import type { PlaySession } from '../../sim/play-session/play-session-types';
import { openMenu, type MenuHandle } from '../kit/menu';

export type ExportedFile = { filename: string; text: string };

export function exportWorldFile(session: PlaySession): ExportedFile | null {
  const file = session.worldFile({ createdAt: new Date().toISOString() });
  if (!file) return null;
  let day = 0;
  for (const d of file.deltas) if (d.t === 'day') day = (d as { day: number }).day;
  return { filename: `hearthfall-${file.seed}-${day}.world.json`, text: JSON.stringify(file, null, 2) };
}

/** Parse + import; on any failure the session is left untouched. */
export function importWorldText(
  session: PlaySession,
  text: string,
): { ok: true; legends: string[]; arrival: Arrival } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not a readable world file.' };
  }
  let r: ReturnType<typeof importWorld>;
  try {
    r = importWorld(raw);
  } catch {
    return { ok: false, error: 'That world file could not be read; nothing was imported.' };
  }
  if ('error' in r) return { ok: false, error: r.error };
  session.adoptState(r.state);
  // Keep the legends the file carried: townsfolk retell them at the first dawns (sim/contrib/legends).
  const st = session.getState();
  if (st) keepImportedLegends(st, r.legends);
  return { ok: true, legends: r.legends, arrival: r.arrival };
}

function download(f: ExportedFile): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([f.text], { type: 'application/json' }));
  a.download = f.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** "What came across": the names an imported world carries, shown before the game resumes. */
export function openArrivalMenu(arrival: Arrival, onDone: () => void): MenuHandle {
  const done = () => (handle.close(), onDone());
  const handle = openMenu('What came across', [{ id: 'walk-on', label: 'Walk on', hint: 'Step into the world the file carried', onPick: done }], {
    id: 'hf-world-arrival',
    onEscape: done,
  });
  const panel = handle.el.querySelector('.hf-panel')!;
  const list = document.createElement('ul');
  list.className = 'hf-arrival';
  for (const line of arrival.lines) {
    const li = document.createElement('li');
    li.textContent = line;
    list.appendChild(li);
  }
  panel.insertBefore(list, panel.querySelector('.hf-item'));
  return handle;
}

/** `onImported` gets the legend lines the file carried, for the townsfolk to speak once the world is up. */
export function openWorldFileMenu(session: PlaySession, io: { onImported: (legends: string[]) => void; onBack: () => void }): MenuHandle {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.id = 'hf-world-input';
  input.style.display = 'none';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const res = importWorldText(session, await file.text());
    if (res.ok) {
      handle.close();
      // A world that carried no one needs no ceremony; otherwise say who came across before walking on.
      const go = () => io.onImported(res.legends);
      if (res.arrival.names.length) openArrivalMenu(res.arrival, go);
      else go();
    } else handle.setNote(res.error);
    input.value = '';
  });
  const back = () => (handle.close(), io.onBack());
  const handle = openMenu(
    'World file',
    [
      {
        id: 'export',
        label: 'Export this world',
        hint: 'Download a .world.json to carry or share',
        onPick: () => {
          const f = exportWorldFile(session);
          if (f) (download(f), handle.setNote(`Saved ${f.filename}`));
        },
      },
      { id: 'import', label: 'Import a world file', hint: 'Replaces the current world with the file', onPick: () => input.click() },
      { id: 'back', label: 'Back', onPick: back },
    ],
    { id: 'hf-world-menu', onEscape: back },
  );
  handle.el.appendChild(input);
  return handle;
}
