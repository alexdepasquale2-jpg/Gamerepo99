/** Play-session state assembly: generate world, seed player/people, optional interaction compat runtime. */

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
  /** Set only when interaction compat is opted in. */
  interactionRt?: CompatRuntime;
}

/** Fresh world + SimState for one play run (seed + archetype). */
export function bootPlayState(seed: number, archetypeId: string, interactionCompat: boolean): PlayBoot {
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
  installPlayReactions(state);
  const interactionRt = interactionCompat
    ? interactionRuntimeFromPeople(state.people, player.spark, data.interactions)
    : undefined;
  return { world, routes, state, interactionRt };
}
