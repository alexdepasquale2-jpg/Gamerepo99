/**
 * Test helper: M4 packet-01/02 tests exercise tickEconomyLod/tickCaravans against the
 * authored economy tables (ashford, lowmere, route_ashford_lowmere, cav_strand_grain).
 * Play boot rebinds the economy to the generated 2D world (generated settlement ids,
 * `road_<a>_<b>` routes), so these tests restore the authored tables onto a booted state.
 * Binding to the generated world is covered by play-world-economy.test.ts.
 */
import { loadData } from '../../../src/sim/load-data';
import { ensureEconomyState } from '../../../src/sim/economy';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import type { SimState } from '../../../src/sim/types/runtime';

export function bootAuthoredEconomy(seed: number): SimState {
  const { state } = bootPlayState(seed, 'marrow');
  const authored = loadData();
  state.data = {
    ...(state.data as object),
    economyRoutes: authored.economyRoutes,
    facilities: authored.facilities,
    caravanSchedules: authored.caravanSchedules,
  } as typeof state.data;
  state.towns = undefined;
  state.economyRoutes = undefined;
  state.caravans = [];
  ensureEconomyState(state);
  // M4 fixture: towns start opted out and each test opts in what it needs
  // (authored towns.json now opts ashford/lowmere/city_reach in for the living world).
  for (const t of Object.values(state.towns!)) t.economyOptIn = false;
  return state;
}
