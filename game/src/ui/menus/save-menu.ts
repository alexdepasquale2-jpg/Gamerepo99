/** Save / load slot list: name, day, town, last-saved. Dawn autosave lives in its own slot and is load-only. */
import type { SaveBlob } from '../../sim/save';
import { AUTO_SLOT, MANUAL_SLOTS, type SaveSlots, type SlotId, type SlotMeta } from '../save-slots';
import { openMenu, type MenuHandle, type MenuItem } from '../kit/menu';

export const slotLabel = (m: SlotMeta | undefined, slot: SlotId): string =>
  m
    ? `${m.name} - day ${m.day}${m.town ? `, ${m.town}` : ''} - ${new Date(m.savedAt).toLocaleString()}`
    : `${slot === AUTO_SLOT ? 'Dawn autosave' : `Slot ${slot}`} - empty`;

export function openSaveMenu(
  mode: 'save' | 'load',
  slots: SaveSlots,
  io: { current: () => { blob: SaveBlob; town: string } | null; onLoad: (blob: SaveBlob) => void; onBack: () => void },
): MenuHandle {
  const metas = new Map(slots.list().map((m) => [m.slot, m]));
  const ids: SlotId[] = mode === 'save' ? [...MANUAL_SLOTS] : [AUTO_SLOT, 0, ...MANUAL_SLOTS];
  const items: MenuItem[] = ids
    .filter((s) => s !== 0 || metas.has(0))
    .map((slot) => ({
      id: `slot-${slot}`,
      label: slotLabel(metas.get(slot), slot),
      disabled: mode === 'load' && !metas.has(slot),
      onPick: () => {
        if (mode === 'save') {
          const cur = io.current();
          if (!cur) return handle.setNote('Nothing to save yet.');
          const r = slots.write(slot, cur.blob, { town: cur.town });
          handle.setNote(r.ok ? 'Saved.' : r.error);
          if (r.ok) setTimeout(() => (handle.close(), io.onBack()), 350);
        } else {
          const r = slots.read(slot);
          if (!r.ok) return handle.setNote(r.error);
          handle.close();
          io.onLoad(r.blob);
        }
      },
    }));
  items.push({ id: 'back', label: 'Back', onPick: () => (handle.close(), io.onBack()) });
  const handle = openMenu(mode === 'save' ? 'Save' : 'Load', items, {
    id: `hf-${mode}-menu`,
    onEscape: () => (handle.close(), io.onBack()),
    note: slots.available() ? '' : 'Saving is unavailable in this browser. The game goes on.',
  });
  return handle;
}
