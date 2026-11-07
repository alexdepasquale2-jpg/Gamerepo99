/** World file export/import (M5 versioned files). Pure helpers first; DOM below. */
import { importWorld } from '../../sim/legacy';
import type { PlaySession } from '../../sim';
import { openMenu, type MenuHandle } from './dom';

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
): { ok: true; legends: string[] } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not a readable world file.' };
  }
  const r = importWorld(raw);
  if ('error' in r) return { ok: false, error: r.error };
  session.adoptState(r.state);
  return { ok: true, legends: r.legends };
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

export function openWorldFileMenu(session: PlaySession, io: { onImported: () => void; onBack: () => void }): MenuHandle {
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
      io.onImported();
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
