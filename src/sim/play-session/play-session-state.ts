/** Play-session state assembly: generate world, seed player/people, interaction compat runtime. */

import { tickCaravans } from '../caravans';
import { doctrineSupplyHook } from '../doctrine-tick';
import { createEventBus } from '../event-bus';
import { generateWorld } from '../fabric/fabric-bake';
import type { FabricWorld } from '../gen/world';
import { assembleInhabitant } from '../inhabitant';
import type { CompatRuntime } from '../interaction';
import { loadData } from '../load-data';
import { createRng } from '../rng';
import {
  loadBiomeTerrainMuls,
  loadEncounterTables,
  loadSizeTravelMuls,
  toTravelRoutes,
  type TravelRoute,
  type TravelSimState,
} from '../travel/travel';
import { installPlayReactions } from './play-session-act';
import { interactionRuntimeFromPeople, peopleFromWorld, pickTownId } from './play-session-boot';

export interface PlayBoot {
  world: FabricWorld;
  routes: TravelRoute[];
  state: TravelSimState;
  /** Resolves method@person acts (always on; legacy spark-spend path removed). */
  interactionRt: CompatRuntime;
}

/** Fresh world + SimState for one play run (seed + archetype). */
export function bootPlayState(seed: number, archetypeId: string): PlayBoot {
  const data = loadData();
  const world = generateWorld({ seed, includeAnchors: true });
  const routes = toTravelRoutes(world.routes ?? []);
  const player = assembleInhabitant(data, archetypeId);
  player.townId = pickTownId(player.townId, world);
  const bus = createEventBus();
  const state: TravelSimState = {
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
    kinEdges: world.kinEdges ?? [],
    encounterTables: loadEncounterTables(),
    biomeTerrainMuls: loadBiomeTerrainMuls(),
    sizeTravelMuls: loadSizeTravelMuls(),
  };
  state.economyHooks = { caravan: (s) => void tickCaravans(s, s.day), doctrine: doctrineSupplyHook };
  installPlayReactions(state);
  const interactionRt = interactionRuntimeFromPeople(state.people, player.spark, data.interactions);
  return { world, routes, state, interactionRt };
}
