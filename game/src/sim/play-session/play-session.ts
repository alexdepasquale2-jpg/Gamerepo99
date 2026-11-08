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
import { activeDistrict, arrivalTown, catchUp, freezeBlob, noteLeft, realmOf, refId, settleFresh, summarize, trunkRoads, withCarried, worldFor } from '../realm';
import { deliverInbox, parkLeaving } from '../realm-away';
import { awayParts } from '../civic/lod-away';
import { CHRONICLE_TAG } from '../chronicle';
import { loadData, type DataTables } from '../load-data';
import { exportWorld } from '../legacy/world-file';
import { loadState, saveState } from '../save';
import { admitNewPeople, buildPlaySnapshot, interactionRuntimeFromPeople } from './play-session-boot';
import { actMethod, listMethodActions, listTargetVerbs } from './play-session-act';
import { bootPlayState } from './play-session-state';
import {
  listRoutesFrom,
  startTravel,
  type TravelRoute,
  type TravelSimState,
} from '../travel/travel';
import { roadViews, type JourneyResult } from '../travel/journey';
import { runDuskHooks } from '../scenario/scenario-advance';
import { fastForward, fullDay } from '../civic/clock';
import { firstTrust } from '../embodiment';
import { carryHistory } from '../history-voice';
import '../contrib';
import { beginMomentAct } from '../scenario/moments-live';
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
import { lingerAt } from '../linger';

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
  /**
   * `settle` runs once the district's economy is bound (its facilities, routes and hooks) but before the
   * presentation hears its bus: a thawed district's catch-up days are history, not news shouted on arrival.
   */
  function adopt(next: TravelSimState, settle?: (s: TravelSimState) => void): void {
    state = next;
    if (!settle) connectJuice();
    seed = next.seed;
    world = worldFor(seed, activeDistrict(next));
    bindWorldEconomy(next, world);
    if (settle) {
      settle(next);
      connectJuice();
    }
    // History is the seed's beats (regenerated), then what was lived (the chronicle loadState carried).
    next.history = [...carryHistory(world.history), ...(next.history ?? []).filter((h) => h.tags?.includes(CHRONICLE_TAG))];
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
    listActions: (personId) => {
      if (!state) return [];
      admitNewcomers();
      return listMethodActions(state, interactionRt as CompatRuntime | undefined, personId);
    },
    listVerbs: (target) => {
      if (!state) return [];
      if (target.kind === 'person') admitNewcomers();
      return listTargetVerbs(state, target, interactionRt);
    },
    act(actionId, target) {
      if (!state) {
        eventLog.push({ type: 'act', methodId: actionId });
        return undefined;
      }
      const settleMoments = beginMomentAct(state, actionId);
      admitNewcomers();
      const outcome = actMethod(
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
        { ...(interactionRt ? { interactionCompat: interactionRt } : {}), ...(target ? { target } : {}) },
      );
      const beforeMoments = state.bus?.lastIds?.length ?? 0;
      settleMoments(lastResolveVal);
      appendJuiceSince(beforeMoments);
      maybeOpenSuccession(state, eventLog, successionOpen);
      return outcome;
    },
    tick() {
      session.wait(1);
    },
    wait(days) {
      if (!state) return;
      const n = Math.max(1, Math.floor(days));
      tickN += n;
      const beforeLen = state.bus?.lastIds?.length ?? 0;
      const settleMoments = beginMomentAct(state, 'rest');
      // Rest is a real dusk then a real dawn: the evening's personal costs, then recovery and the world's day.
      // A fire that goes out in the night burns out before dawn can rekindle it. Waiting longer is one
      // evening, then the days pass on the clock (civic/clock: whole dawns, or the LOD stretch past ten).
      runDuskHooks(state);
      if (maybeOpenSuccession(state, eventLog, successionOpen)) {
        settleMoments();
        appendJuiceSince(beforeLen);
        eventLog.push({ type: 'tick' });
        return;
      }
      fastForward(state, n);
      settleMoments();
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
      session.journey(routeId);
    },
    roads: () => (state ? roadViews(state) : []),
    trunkRoads: () => (state ? trunkRoads(seed, activeDistrict(state)) : []),
    district: () => activeDistrict(state ?? undefined),
    journeyDistrict(to) {
      if (!state) return null;
      const road = trunkRoads(seed, activeDistrict(state)).find((r) => r.to.col === to.col && r.to.row === to.row);
      if (!road) return null;
      // The trunk road takes real days: the district you leave lives them before it freezes (the clock
      // runs them whole, or on the LOD day for a road longer than FULL_DAYS).
      fastForward(state, road.days);
      tickN += road.days;
      const townId = session.enterDistrict(to);
      return townId ? { ok: true, days: road.days, townId, name: road.name } : null;
    },
    enterDistrict(to) {
      if (!state) return null;
      const cur = state;
      const realm = realmOf(cur);
      const from = realm.active;
      if (from.col === to.col && from.row === to.row) return cur.player.townId ?? null;
      // Leave: mail and news for this district wait in its inbox; the district folds (whole if recent, a
      // summary always); the player's parts travel on.
      parkLeaving(cur, refId(from));
      noteLeft(realm, refId(from), { ...summarize(cur), ...awayParts(cur) }, { day: cur.day, blob: freezeBlob(saveState(cur), cur) });
      realm.active = to;
      const carried = saveState(cur);
      const toId = refId(to);
      const frozen = realm.frozen[toId];
      const archetype = cur.player.archetypeId ?? archetypeId;
      let next: TravelSimState;
      // The days it lived without you, run once it is bound (adopt): from when it froze, or from its summary.
      let since = cur.day;
      if (frozen) {
        next = loadState(withCarried(frozen.blob, carried), undefined, archetype) as TravelSimState;
        // It lived the days you were gone: the LOD day from when it froze (people, stock, despair, doctrines).
        since = frozen.day;
      } else {
        const fresh = bootPlayState(seed, archetype, undefined, to).state;
        next = loadState(withCarried(saveState(fresh), carried), undefined, archetype) as TravelSimState;
        const known = realm.summaries[toId];
        if (known) {
          for (const t of Object.values(next.towns ?? {}) as { despair: number }[]) t.despair = known.despair;
          // The away-tick (sim/realm-away) already drifted the summary up to lastTick; the LOD day runs the rest.
          since = known.lastTick ?? known.day;
        } else settleFresh(next, to);
      }
      delete realmOf(next).frozen[toId];
      adopt(next, (s) => catchUp(s, cur.day - since));
      const arrive = arrivalTown(world!, to, next.player.homeTownId);
      if (arrive) next.player.townId = arrive;
      // What waited for this district lands now: after adopt, so replies plan real roads (economy routes
      // are bound there) and the arrival's juice reaches the presentation.
      deliverInbox(next, toId);
      eventLog.push({ type: 'travel', methodId: `district:${toId}` });
      return next.player.townId ?? null;
    },
    journey(routeId, tradeId, plan) {
      if (!state) return null;
      const st = state;
      const beforeLen = st.bus?.lastIds?.length ?? 0;
      const nameOf = (id: string): string => world?.settlements?.find((t) => t.id === id)?.name ?? id;
      // Each road day is a real world day: the clock's whole dawn (no hearth dusk; the road does its own
      // spark). The road decides its days one at a time (encounters, stops), so they run whole.
      const runDay = (s: TravelSimState): void => fullDay(s);
      const settleMoments = beginMomentAct(st, `travel:${routeId}`);
      const res: JourneyResult = startTravel(st, routeId, { tradeId, runDay, nameOf, ...plan }).journey;
      settleMoments();
      if (!res.ok) return res;
      tickN += res.days;
      appendJuiceSince(beforeLen);
      maybeOpenSuccession(st, eventLog, successionOpen);
      eventLog.push({ type: 'travel', methodId: routeId });
      return res;
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
    // Sitting by a linger prop (world/linger.ts): seconds in, spark gained out (sim/linger.ts).
    linger(propKey, seconds) {
      if (!state) return 0;
      const beforeLen = state.bus?.lastIds?.length ?? 0;
      const { gain } = lingerAt(state, propKey, seconds);
      appendJuiceSince(beforeLen);
      return gain;
    },
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
