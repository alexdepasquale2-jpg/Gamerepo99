/** Play + inspect session factory. Play boots generateWorld into SimState. */

import type { FabricWorld } from '../gen/world';
import {
  createPlaySession as createInspectSession,
  dumpWorld,
  type InspectSession,
} from '../fabric/world-dump';
import type { CompatRuntime } from '../interaction';
import { buildPlaySnapshot } from './play-session-boot';
import { actMethod, listMethodActions, parseMethodAction } from './play-session-act';
import { bootPlayState } from './play-session-state';
import {
  listRoutesFrom,
  startTravel,
  type TravelRoute,
  type TravelSimState,
} from '../travel/travel';
import { tickPackets } from '../packets';
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
    woundId: p.woundId,
    tags: p.tags,
    siteId: p.siteId,
    siteKind: p.siteKind ?? siteKindFromSiteId(p.siteId),
    anchor: p.anchor,
    marks: p.marks?.map((m) => ({ ...m })),
  };
}

function createPlayModeSession(defaults: {
  seed: number;
  archetypeId: string;
  /** Opt-in interaction compat (default off). */
  interactionCompat?: boolean;
}): PlaySession {
  const useInteractionCompat = defaults.interactionCompat === true;
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
    ({ world, routes, state, interactionRt } = bootPlayState(seed, archetypeId, useInteractionCompat));
  }

  function appendJuiceSince(beforeLen: number): void {
    for (const type of state?.bus?.lastIds?.slice(beforeLen) ?? []) eventLog.push({ type });
  }

  const session: PlaySession = {
    start(opts) {
      boot(opts?.seed ?? seed, opts?.archetypeId ?? archetypeId);
    },
    listActions: () => (state ? listMethodActions(state) : []),
    act(actionId) {
      if (!state) {
        eventLog.push({ type: 'act', methodId: actionId });
        return;
      }
      // Player spark is the single source of truth: seed the target's runtime spark, write back on resolve.
      const parsed = parseMethodAction(actionId);
      const ip = parsed ? interactionRt?.people.get(parsed.personId) : undefined;
      if (ip) ip.spark = state.player.spark;
      const logLen = eventLog.length;
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
      if (ip && eventLog.slice(logLen).some((e) => e.type === 'interaction')) {
        state.player.spark = ip.spark;
      }
      maybeOpenSuccession(state, eventLog, successionOpen);
    },
    tick() {
      if (!state) return;
      tickN += 1;
      state.day += 1;
      const beforeLen = state.bus?.lastIds?.length ?? 0;
      tickPackets(state);
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
    lastResolve: () => (lastResolveVal ? { ...lastResolveVal } : undefined),
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
      interactionCompat: opts.interactionCompat,
    });
  }
  return null;
}
