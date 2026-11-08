/**
 * Which panel sheet is open. Every panel opens through ctx.ui.sheet (one side sheet at a time); this keeps
 * the handle so panels can refresh, close and answer anyOpen. Toggles ignore a repeat within a few frames,
 * so a key bound by two areas (say M) can't open and shut a sheet in one press.
 */
import type { GameContext, SheetDef, SheetHandle } from '../app/contracts';

export type Sheets = {
  open(def: SheetDef): SheetHandle;
  toggle(id: string, open: () => void): void;
  /** Id of the panel sheet that is open, or null. */
  current(): string | null;
  refresh(id?: string): void;
  close(id?: string): void;
};

export function createSheets(ctx: GameContext): Sheets {
  let cur: { id: string; handle: SheetHandle } | null = null;
  const lastToggle = new Map<string, number>();
  const live = (): typeof cur => (cur && cur.handle.isOpen() ? cur : (cur = null));

  const close = (id?: string): void => {
    const c = live();
    if (!c || (id && c.id !== id)) return;
    cur = null;
    c.handle.close();
  };

  return {
    open(def) {
      const prev = live();
      if (prev) { cur = null; prev.handle.close(); }
      const entry: { id: string; handle: SheetHandle } = { id: def.id, handle: undefined as unknown as SheetHandle };
      entry.handle = ctx.ui.sheet({
        ...def,
        onClose: () => {
          if (cur === entry) cur = null;
          def.onClose?.();
        },
      });
      cur = entry;
      ctx.voice?.sfx?.('open');
      return entry.handle;
    },
    toggle(id, open) {
      const now = performance.now();
      if (now - (lastToggle.get(id) ?? -1e9) < 120) return;
      lastToggle.set(id, now);
      if (live()?.id === id) close(id);
      else open();
    },
    current: () => live()?.id ?? null,
    refresh(id) {
      const c = live();
      if (c && (!id || c.id === id)) c.handle.refresh();
    },
    close,
  };
}
