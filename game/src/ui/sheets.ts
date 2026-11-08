/**
 * UiApi.sheet(): the one side-sheet slot for every area. Calling sheet(def) opens that sheet (closing
 * whichever other sheet was open) and renders its body; calling it again for an open id re-renders in
 * place without firing onClose. One DOM sheet per id, kept for the run and removed on teardown.
 */
import type { GameContext, SheetDef, SheetHandle } from '../app/contracts';
import { createSheet, type Sheet } from './kit/sheet';

type Entry = { sheet: Sheet; def: SheetDef };

export function createSheetHost(ctx: GameContext): { sheet: (def: SheetDef) => SheetHandle; destroy: () => void } {
  const entries = new Map<string, Entry>();
  let dying = false;

  const render = (e: Entry): void => {
    e.sheet.body.replaceChildren();
    try {
      e.def.render(e.sheet.body);
    } catch (err) {
      console.error(`sheet ${e.def.id} render failed`, err);
    }
  };

  function sheet(def: SheetDef): SheetHandle {
    let e = entries.get(def.id);
    if (!e) {
      const id = def.id;
      const s = createSheet({
        id: `hf-sheet-${id}`,
        title: def.title,
        onClose: () => {
          if (dying) return;
          ctx.voice?.sfx('close');
          entries.get(id)?.def.onClose?.();
        },
      });
      s.el.dataset.sheet = id;
      e = { sheet: s, def };
      entries.set(id, e);
    } else {
      e.def = def;
      e.sheet.setTitle(def.title);
    }
    const entry = e;
    if (!entry.sheet.isOpen()) {
      entry.sheet.open();
      ctx.voice?.sfx('open');
    }
    render(entry);
    return {
      close: () => entry.sheet.close(),
      refresh: () => {
        if (entry.sheet.isOpen()) render(entry);
      },
      isOpen: () => entry.sheet.isOpen(),
    };
  }

  return {
    sheet,
    destroy() {
      dying = true;
      for (const e of entries.values()) e.sheet.destroy();
      entries.clear();
    },
  };
}
