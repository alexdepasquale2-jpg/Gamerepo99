/** Play + inspect session factory. Play boots generateWorld into SimState. */

import { createEventBus } from './event-bus';
import { generateWorld } from './fabric/fabric-bake';
import type { FabricWorld } from './gen/world';
import {
  createPlaySession as createInspectSession,
  dumpWorld,
  type InspectSession,
} from './fabric/world-dump';
import { assembleInhabitant } from './inhabitant';
import { loadData, type DataTables } from './load-data';
import { peopleFromWorld, pickTownId } from './play-session-boot';
import {
  actMethod,
  installPlayReactions,
  listMethodActions,
} from './play-session-act';
import { createRng } from './rng';
import {
  listRoutesFrom,
  loadBiomeTerrainMuls,
  loadEncounterTables,
  loadSizeTravelMuls,
  startTravel,
  toTravelRoutes,
  type TravelRoute,
  type TravelSimState,
} from './travel';

export type PlayAction = { id: string; family?: string };
export type PlayEvent = { type: string; methodId?: string };
export type PlaySnapshot = {
  tick: number;
  day: number;
  spark: number;
  burnedOut: boolean;
  townId: string;
  townCount: number;
  fingerprint: string;
  reignitedCount: number;
  hollowCount: number;
};
export type PlaySession = {
  start(opts?: { seed?: number; archetypeId?: string }): void;
  listActions(): PlayAction[];
  act(actionId: string): void;
  tick(): void;
  snapshot(): PlaySnapshot;
  events(): PlayEvent[];
  listRoutes(): string[];
  travel(routeId: string): void;
  dump(): string;
};
export type CreatePlaySessionOpts =
  | { mode: 'inspect'; seed: number; peopleCount?: number }
  | { mode: 'play'; seed: number; archetypeId?: string; peopleCount?: number };

function createPlayModeSession(defaults: { seed: number; archetypeId: string }): PlaySession {
  let seed = defaults.seed;
  let archetypeId = defaults.archetypeId;
  let world: FabricWorld | null = null;
  let state: TravelSimState | null = null;
  let tickN = 0;
  let routes: TravelRoute[] = [];
  const eventLog: PlayEvent[] = [];

  function boot(nextSeed: number, nextArchetype: string): void {
    seed = nextSeed;
    archetypeId = nextArchetype;
    tickN = 0;
    eventLog.length = 0;
    const data = loadData();
    world = generateWorld({ seed, includeAnchors: true });
    routes = toTravelRoutes(world.routes ?? []);
    const player = assembleInhabitant(data, archetypeId);
    player.townId = pickTownId(player.townId, world);
    const bus = createEventBus();
    state = {
      day: 1,
      seed,
      player,
      people: peopleFromWorld(world, data),
      flags: {},
      packets: [],
      bus: { lastIds: [], ...bus },
      data,
      rng: createRng(seed),
      routes,
      encounterTables: loadEncounterTables(),
      biomeTerrainMuls: loadBiomeTerrainMuls(),
      sizeTravelMuls: loadSizeTravelMuls(),
    };
    installPlayReactions(state);
  }

  function appendJuiceSince(beforeLen: number): void {
    const ids = state?.bus?.lastIds ?? [];
    for (const type of ids.slice(beforeLen)) {
      eventLog.push({ type });
    }
  }

  return {
    start(opts) {
      boot(opts?.seed ?? seed, opts?.archetypeId ?? archetypeId);
    },
    listActions() {
      if (!state) return [];
      return listMethodActions(state);
    },
    act(actionId) {
      if (!state) {
        eventLog.push({ type: 'act', methodId: actionId });
        return;
      }
      actMethod(state, actionId, eventLog);
    },
    tick() {
      if (!state) return;
      tickN += 1;
      state.day += 1;
      eventLog.push({ type: 'tick' });
    },
    snapshot(): PlaySnapshot {
      const player = state?.player;
      const spark = player?.spark ?? 0;
      const burnAt = (state?.data as DataTables | undefined)?.reigniteThreshold ?? 35;
      let reignitedCount = 0;
      let hollowCount = 0;
      for (const p of Object.values(state?.people ?? {})) {
        if (p.flame >= burnAt) reignitedCount += 1;
        if ((p.marks ?? []).some((m) => m.markId === 'hollowness')) hollowCount += 1;
      }
      return {
        tick: tickN,
        day: state?.day ?? 0,
        spark,
        burnedOut: spark <= 0,
        townId: player?.townId ?? 'unknown',
        townCount: world?.gapSites?.length ?? world?.settlements?.length ?? 0,
        fingerprint: `${world?.fingerprint ?? 'unbooted'}-t${tickN}`,
        reignitedCount,
        hollowCount,
      };
    },
    events: () => [...eventLog],
    listRoutes() {
      if (!state?.player.townId) return [];
      return listRoutesFrom(routes, state.player.townId);
    },
    travel(routeId) {
      if (!state) return;
      const beforeLen = state.bus?.lastIds?.length ?? 0;
      const { daysEff } = startTravel(state, routeId);
      tickN += daysEff;
      appendJuiceSince(beforeLen);
      eventLog.push({ type: 'travel' });
    },
    dump: () => (world ? dumpWorld(world).text : ''),
  };
}

/** Unified play/inspect; no-arg → unstarted play shell for Probe feature-detect. */
export function createPlaySession(
  opts?: CreatePlaySessionOpts,
): PlaySession | InspectSession | null {
  if (!opts) return createPlayModeSession({ seed: 0, archetypeId: 'marrow' });
  if (opts.mode === 'inspect') return createInspectSession(opts);
  if (opts.mode === 'play') {
    return createPlayModeSession({
      seed: opts.seed,
      archetypeId: opts.archetypeId ?? 'marrow',
    });
  }
  return null;
}
