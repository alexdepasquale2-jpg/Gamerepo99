/** PANELS area (stub). Owner: the panels agent. Replace everything in src/panels/ — keep attachPanels. See game/README.md. */
import type { GameContext, PanelsApi } from '../app/contracts';

export function attachPanels(_ctx: GameContext): PanelsApi {
  let held: string | null = null;
  return {
    satchel: { toggle: () => {}, held: () => held, hold: (id) => { held = id; } },
    board: { open: () => {} },
    trade: { open: () => {} },
    letters: { open: () => {} },
    map: { toggle: () => {} },
    roads: { open: () => {} },
    closeAll: () => {},
    anyOpen: () => false,
  };
}
