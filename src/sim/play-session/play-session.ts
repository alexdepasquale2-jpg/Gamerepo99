import { bindWorldEconomy } from './play-world-economy';
import { toTravelRoutes } from '../travel/travel';
/** Play + inspect session factory. Play boots generateWorld into SimState. */

import type { FabricWorld } from '../gen/world';
import {
  createPlaySession as createInspectSession,
  dumpWorld,
  type InspectSession,
} from '../fabric/world-dump';
import type { CompatRuntime } from '../interaction';
import { generateWorld } from '../fabric/fabric-bake';
import { loadData, type DataTables } from '../load-data';
import { exportWorld } from '../legacy/world-file';
import { loadState, saveState } from '../save';
import { admitNewPeople, buildPlaySnapshot, interactionRuntimeFromPeople } from './play-session-boot';
import { actMethod, listMethodActions } from './play-session-act';
import { bootPlayState } from './play-session-state';
import {
  listRoutesFrom,
  startTravel,
  type TravelRoute,
  type TravelSimState,
} from '../travel/travel';
import { tickPackets } from '../packets';
import { regrowNodes } from '../goods/nodes';
import { advanceToDawn, runDuskHooks } from '../scenario/scenario-advance';
import { firstTrust } from '../embodiment';
import '../contrib';
import { carryItOn, letItRest, offerSuccession } from '../legacy';
import {
  attachSuccessionHandle,
  lockedSuccessionUi,
  maybeOpenSuccession,
  type SuccessionUi,
} from '../succession';
import { siteKindFromSiteId, type ScenarioPersonView } from '../scenario/scenario-resolve';

export type {
  PlayAction,
  PlayEvent,
  PlaySnapshot,
  PlaySession,
  PlayMetrics,
  PlayLastResolve,
  CreatePlaySessionOpts,
} from './play-session-types';
import type {
  PlayEvent,
  PlaySession,
  PlayLastResolve,
  CreatePlaySessionOpts,
} from './play-session-types';

function toPersonView(p: TravelSimState['people'][string]): ScenarioPersonView {
  return {
    id: p.id,
    name: p.name,
    woundId: p.woundId,
    tags: p.tags,
    siteId: p.siteId,
    siteKind: p.siteKind ?? siteKindFromSiteId(p.siteId),
    anchor: p.anchor,
    townId: p.townId,
    marks: p.marks?.map((m) => ({ ...m })),
  };
}

function createPlayModeSession(defaults: {
  seed: number;
  archetypeId: string;
}): PlaySession {
  let seed = defaults.seed;
  let archetypeId = defaults.archetypeId;
  let world: FabricWorld | null = null;
  let state: TravelSimState | null = null;
  let tickN = 0;
  let routes: TravelRoute[] = [];
  const eventLog: PlayEvent[] = [];
  const successionOpen = { value: false };
  let successionUi: SuccessionUi = lockedSuccessionUi();
  const metrics: { firstChoiceAtTick?: number; firstConsequenceAtTick?: number } = {};
  let lastResolveVal: PlayLastResolve | undefined;
  let interactionRt: CompatRuntime | undefined;
  const juiceHandlers = new Set<(id: string, payload: unknown) => void>();

  function boot(nextSeed: number, nextArchetype: string): void {
    seed = nextSeed;
    archetypeId = nextArchetype;
    tickN = 0;
    eventLog.length = 0;
    successionOpen.value = false;
    successionUi = lockedSuccessionUi();
    metrics.firstChoiceAtTick = undefined;
    metrics.firstConsequenceAtTick = undefined;
    lastResolveVal = undefined;
    ({ world, routes, state, interactionRt } = bootPlayState(seed, archetypeId));
    connectJuice();
  }

  // Loaded/imported states have a fresh bus too; presentation must follow it.
  function connectJuice(): void {
    const bus = state!.bus as { emit?: (e: string, p: unknown) => void };
    const inner = bus.emit;
    bus.emit = (e, p) => {
      inner?.(e, p);
      for (const h of [...juiceHandlers]) h(e, p);
    };
  }

  function appendJuiceSince(beforeLen: number): void {
    for (const type of state?.bus?.lastIds?.slice(beforeLen) ?? []) eventLog.push({ type });
  }

  /** Load/import path: swap in a whole SimState and rebuild what lives outside it. */
  function adopt(next: TravelSimState): void {
    state = next;
    connectJuice();
    seed = next.seed;
    world = generateWorld({ seed, includeAnchors: true, peopleCount: 60 });
    bindWorldEconomy(next, world);
    routes = toTravelRoutes(world.routes ?? []);
    next.routes = routes;
    if (!world.settlements?.some((s) => s.id === next.player.townId)) next.player.townId = world.settlements?.[0]?.id;
    // Saves from before homes were tracked: the hearth you load at is home.
    next.player.homeTownId ??= next.player.townId;
    tickN = Math.max(0, next.day - 1);
    eventLog.length = 0;
    successionOpen.value = false;
    lastResolveVal = undefined;
    interactionRt = interactionRuntimeFromPeople(next.people, next.player.spark, (next.data as DataTables).interactions, (id) => firstTrust(next, id));
  }

  /** People who joined since the runtime was built (children come of age, arrivals) become actable. */
  function admitNewcomers(): void {
    if (state && interactionRt) admitNewPeople(interactionRt, state.people, state.player.spark, (id) => firstTrust(state!, id));
  }

  const session: PlaySession = {
    start(opts) {
      boot(opts?.seed ?? seed, opts?.archetypeId ?? archetypeId);
    },
    listActions: () => {
      if (!state) return [];
      admitNewcomers();
      return listMethodActions(state, interactionRt as CompatRuntime | undefined);
    },
    act(actionId) {
      if (!state) {
        eventLog.push({ type: 'act', methodId: actionId });
        return;
      }
      admitNewcomers();
      actMethod(
        state,
        actionId,
        eventLog,
        {
          tickN,
          metrics,
          setLastResolve: (r) => {
            lastResolveVal = r;
          },
        },
        interactionRt ? { interactionCompat: interactionRt } : undefined,
      );
      maybeOpenSuccession(state, eventLog, successionOpen);
    },
    tick() {
      if (!state) return;
      tickN += 1;
      const beforeLen = state.bus?.lastIds?.length ?? 0;
      // Rest is a real dusk then a real dawn: the evening's personal costs, then recovery and the world's day.
      // A fire that goes out in the night burns out before dawn can rekindle it.
      runDuskHooks(state);
      if (maybeOpenSuccession(state, eventLog, successionOpen)) {
        appendJuiceSince(beforeLen);
        eventLog.push({ type: 'tick' });
        return;
      }
      advanceToDawn(state);
      tickPackets(state);
      regrowNodes(state);
      admitNewcomers();
      appendJuiceSince(beforeLen);
      maybeOpenSuccession(state, eventLog, successionOpen);
      eventLog.push({ type: 'tick' });
    },
    snapshot: () =>
      buildPlaySnapshot({ tickN, state, world, successionOpen: successionOpen.value }),
    events: () => [...eventLog],
    listRoutes: () =>
      state?.player.townId ? listRoutesFrom(routes, state.player.townId) : [],
    travel(routeId) {
      if (!state) return;
      const beforeLen = state.bus?.lastIds?.length ?? 0;
      const { daysEff } = startTravel(state, routeId);
      tickN += daysEff;
      appendJuiceSince(beforeLen);
      maybeOpenSuccession(state, eventLog, successionOpen);
      eventLog.push({ type: 'travel' });
    },
    dump: () => (world ? dumpWorld(world).text : ''),
    getWorld: () => world,
    getSeed: () => seed,
    listPeople: () => Object.values(state?.people ?? {}).map(toPersonView),
    metrics: () => ({ ...metrics }),
    onJuice(handler) {
      juiceHandlers.add(handler);
      return () => void juiceHandlers.delete(handler);
    },
    townDespair: () =>
      Object.fromEntries(Object.entries(state?.towns ?? {}).map(([id, t]) => [id, t.despair])),
    successionOffer: () => (state && successionOpen.value ? offerSuccession(state) : null),
    chooseSuccession(choice) {
      if (!state) return { ok: false, reason: 'not_open' };
      const res = choice === 'continue' ? carryItOn(state) : letItRest(state);
      if (res.ok) successionOpen.value = false;
      return res;
    },
    lastResolve: () => (lastResolveVal ? { ...lastResolveVal } : undefined),
    saveBlob: () => (state ? saveState(state) : null),
    loadBlob(blob) {
      adopt(loadState(blob, (state?.data as DataTables | undefined) ?? loadData()) as TravelSimState);
    },
    worldFile: (opts) => (state ? exportWorld(state, opts) : null),
    adoptState: (st) => adopt(st as TravelSimState),
    getState: () => state ?? undefined,
  };
  attachSuccessionHandle(session, {
    setSpark: (spark) => {
      if (state) state.player.spark = spark;
    },
    getUi: () => successionUi,
    getBurnedOut: () => successionOpen.value,
  });
  return session;
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
