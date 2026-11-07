import { bindWorldEconomy } from './play-world-economy';
/** Play-session state assembly: generate world, seed player/people, interaction compat runtime. */

import { createEventBus } from '../event-bus';
import { generateWorld } from '../fabric/fabric-bake';
import type { FabricWorld } from '../gen/world';
import { assembleInhabitant } from '../inhabitant';
import { firstTrust } from '../embodiment';
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
  const world = generateWorld({ seed, includeAnchors: true, peopleCount: 60 });
  const routes = toTravelRoutes(world.routes ?? []);
  const player = assembleInhabitant(data, archetypeId);
  player.townId = pickTownId(player.townId, world);
  const bus = createEventBus();
  const state: TravelSimState = {
    day: 1,
    seed,
    player,
    people: peopleFromWorld(world, data, seed),
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
  // Home hearth: the spark profile's home town when this world has it, else wherever the run starts.
  if (!player.homeTownId || !world.settlements?.some((s) => s.id === player.homeTownId)) player.homeTownId = player.townId;
  bindWorldEconomy(state, world);
  installPlayReactions(state);
  const interactionRt = interactionRuntimeFromPeople(state.people, player.spark, data.interactions, (id) => firstTrust(state, id));
  return { world, routes, state, interactionRt };
}
