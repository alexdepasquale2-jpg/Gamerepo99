/** Multi-slot save adapter. Every storage access is wrapped; failure returns a friendly message. */
import { parseAndValidateSave, serializeSave, type SaveBlob } from '../sim/save';

export const MANUAL_SLOTS = [1, 2, 3] as const;
export const AUTO_SLOT = 'auto';
export const LEGACY_KEY = 'the-last-spark:m1';
const INDEX_KEY = 'hearthfall:saves:index';
const slotKey = (slot: SlotId) => `hearthfall:save:${slot}`;

export type SlotId = number | typeof AUTO_SLOT;
export type SlotMeta = { slot: SlotId; name: string; day: number; town: string; savedAt: string };
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type SaveResult = { ok: true } | { ok: false; error: string };
export type LoadResult = { ok: true; blob: SaveBlob; meta: SlotMeta } | { ok: false; error: string };

const NO_STORE = 'Saving is unavailable in this browser. The game goes on.';
const FULL = 'There is no room left to save. The game goes on.';

function defaultStore(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createSaveSlots(store: StorageLike | null = defaultStore(), now: () => string = () => new Date().toISOString()) {
  const readIndex = (): SlotId[] => {
    try {
      const v = JSON.parse(store?.getItem(INDEX_KEY) ?? '[]') as unknown;
      return Array.isArray(v) ? (v.filter((x) => typeof x === 'number' || x === AUTO_SLOT) as SlotId[]) : [];
    } catch {
      return [];
    }
  };

  function read(slot: SlotId): LoadResult {
    if (!store) return { ok: false, error: NO_STORE };
    try {
      const raw = store.getItem(slotKey(slot));
      if (!raw) return { ok: false, error: 'That slot is empty.' };
      const env = JSON.parse(raw) as { meta?: SlotMeta; blob?: unknown };
      const check = parseAndValidateSave(JSON.stringify(env.blob));
      if (!check.ok || !env.meta) return { ok: false, error: check.ok ? 'That save could not be read.' : check.error };
      return { ok: true, blob: check.blob, meta: env.meta };
    } catch {
      return { ok: false, error: 'That save could not be read.' };
    }
  }

  function write(slot: SlotId, blob: SaveBlob, info: { name?: string; town?: string } = {}): SaveResult {
    if (!store) return { ok: false, error: NO_STORE };
    const meta: SlotMeta = {
      slot,
      name: info.name ?? (slot === AUTO_SLOT ? 'Dawn autosave' : `Slot ${slot}`),
      day: blob.tick,
      town: info.town ?? '',
      savedAt: now(),
    };
    try {
      store.setItem(slotKey(slot), JSON.stringify({ meta, blob: JSON.parse(serializeSave(blob)) }));
      const idx = readIndex();
      if (!idx.includes(slot)) store.setItem(INDEX_KEY, JSON.stringify([...idx, slot]));
      return { ok: true };
    } catch {
      return { ok: false, error: FULL };
    }
  }

  /** Legacy single-slot key becomes slot 0; deleted only after the new write verifies. */
  function migrateLegacy(): void {
    if (!store) return;
    try {
      const raw = store.getItem(LEGACY_KEY);
      if (!raw) return;
      const check = parseAndValidateSave(raw);
      if (!check.ok) return;
      if (read(0).ok || (write(0, check.blob, { name: 'Earlier save' }).ok && read(0).ok)) store.removeItem(LEGACY_KEY);
    } catch {
      /* leave legacy key in place */
    }
  }

  function list(): SlotMeta[] {
    migrateLegacy();
    const out: SlotMeta[] = [];
    for (const slot of readIndex()) {
      const r = read(slot);
      if (r.ok) out.push(r.meta);
    }
    return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  return { list, read, write, available: () => store !== null };
}

export type SaveSlots = ReturnType<typeof createSaveSlots>;
