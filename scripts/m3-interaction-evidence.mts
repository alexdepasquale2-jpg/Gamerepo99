/**
 * M3 interaction evidence probe (Probe harness).
 *
 * Modes (CLI `--mode kindle|packet|refusal|all`, also `--mode=x`; default `all`):
 *  - kindle  — connectBotSession + BOT_PLAY_SESSION_OPTS short inspire/advance/travel
 *              loop (seed 42 marrow, 20 ticks). Kindle / mark / interaction evidence.
 *  - packet  — public createPlaySession seed 11 marrow; inspire@ a person on a kin edge
 *              whose towns differ (mirrors tests/sim/ripple-play.test.ts); tick×5;
 *              requires packet.emit or packet.deliver.
 *  - refusal — public createPlaySession seed 42 marrow; resolveScenarioPerson
 *              (anchor jonah_pike / child / fear) then shame@target (mirrors
 *              tests/sim/interaction/interaction-play-session.test.ts); requires
 *              refusal.coal_flicker and no spark.spend.
 *  - all     — all three; requires packet + refusal coverage and spark.spend 0.
 *
 * Does not touch run-matrix.ts or run-playthrough-matrix.mts.
 *
 * Run:  npx vite-node scripts/m3-interaction-evidence.mts --mode all
 * Out:  docs/qa/reports/_m3-interaction-evidence.json
 * Exit: 0 ok · 1 not ok · 2 crash / bad CLI
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  connectBotSession,
  BOT_PLAY_SESSION_OPTS,
  type BotAction,
} from '../tests/bots/bot-session.ts';
import {
  createPlaySession,
  generateWorld,
  resolveScenarioPerson,
  type PlaySession,
} from '../src/sim/index.ts';
import { loadData } from '../src/sim/load-data.ts';
import { peopleFromWorld } from '../src/sim/play-session/play-session-boot.ts';

type Mode = 'kindle' | 'packet' | 'refusal';
type CliMode = Mode | 'all';
const MODES: readonly Mode[] = ['kindle', 'packet', 'refusal'];

type Ev = { type: string; methodId?: string };

type ModeResult = {
  status: 'OK' | 'API_PENDING';
  ok: boolean;
  histogram: Record<string, number>;
  sparkSpendCount: number;
  notes: string[];
  actLog: string[];
  [extra: string]: unknown;
};

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

function parseMode(argv: string[]): CliMode {
  let raw: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--mode') {
      raw = argv[i + 1];
      if (raw === undefined) throw new UsageError('--mode requires a value');
      i++;
    } else if (a.startsWith('--mode=')) {
      raw = a.slice('--mode='.length);
    }
  }
  if (raw === undefined) return 'all';
  if (raw === 'all' || (MODES as readonly string[]).includes(raw)) return raw as CliMode;
  throw new UsageError(`unknown --mode "${raw}" (expected kindle|packet|refusal|all)`);
}

// ---------------------------------------------------------------------------
// Shared helpers

function histogramOf(events: Ev[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const e of events) h[e.type] = (h[e.type] ?? 0) + 1;
  return h;
}

function sparkSpendOf(events: Ev[]): number {
  return events.filter((e) => e.type === 'spark.spend').length;
}

function snapshotExtras(s: { snapshot(): { spark: number; burnedOut: boolean; hollowCount: number; reignitedCount: number; tick: number } }) {
  const snap = s.snapshot();
  return {
    spark: snap.spark,
    burnedOut: snap.burnedOut,
    hollowCount: snap.hollowCount,
    reignitedCount: snap.reignitedCount,
    tick: snap.tick,
  };
}

function bootPlay(seed: number, archetypeId: string): PlaySession | null {
  const s = createPlaySession({ mode: 'play', seed, archetypeId });
  if (!s || !('listActions' in s) || !('lastResolve' in s)) return null;
  const play = s as PlaySession;
  play.start();
  return play;
}

function apiPending(note: string, extra: Record<string, unknown> = {}): ModeResult {
  return {
    status: 'API_PENDING',
    ok: false,
    histogram: {},
    sparkSpendCount: 0,
    notes: [note],
    actLog: [],
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// kindle — bot-session short loop (original probe)

const KINDLE_SEED = 42;
const KINDLE_ARCHETYPE = 'marrow';
const KINDLE_MAX_TICKS = 20;

type PickFamily = 'inspire' | 'advance' | 'travel' | 'other';

function familyOf(id: string): PickFamily {
  if (id.startsWith('inspire@')) return 'inspire';
  if (id.startsWith('advance:')) return 'advance';
  if (id.startsWith('travel:')) return 'travel';
  return 'other';
}

/**
 * Pick order:
 *  1. inspire@ at least once (interaction → talk_gentle)
 *  2. one advance:* (rest) and one travel:* each, once, if listed
 *  3. fallback: inspire@ → advance: → travel: → first non-noop
 */
function chooseAction(actions: BotAction[], done: Set<PickFamily>): string | null {
  const find = (prefix: string) => actions.find((a) => a.id.startsWith(prefix));
  const inspire = find('inspire@');
  const advance = find('advance:');
  const travel = find('travel:');

  if (!done.has('inspire') && inspire) return inspire.id;
  if (!done.has('advance') && advance) return advance.id;
  if (!done.has('travel') && travel) return travel.id;

  if (inspire) return inspire.id;
  if (advance) return advance.id;
  if (travel) return travel.id;
  return actions.find((a) => a.family !== 'noop')?.id ?? null;
}

async function runKindle(): Promise<ModeResult> {
  const session = await connectBotSession();
  if (!session) {
    return apiPending(
      'connectBotSession() returned null — no matching play-session export in src/sim/index.ts',
      { botPlaySessionOpts: BOT_PLAY_SESSION_OPTS },
    );
  }

  session.start({ seed: KINDLE_SEED, archetypeId: KINDLE_ARCHETYPE });

  const actLog: string[] = [];
  const picks: Record<PickFamily, number> = { inspire: 0, advance: 0, travel: 0, other: 0 };
  const done = new Set<PickFamily>();
  let ticksRun = 0;
  let stopReason = 'maxTicks';

  for (let i = 0; i < KINDLE_MAX_TICKS; i++) {
    if (session.snapshot().burnedOut) {
      stopReason = 'burnedOut';
      break;
    }
    const id = chooseAction(session.listActions(), done);
    if (id) {
      const fam = familyOf(id);
      session.act(id);
      actLog.push(id);
      picks[fam] += 1;
      done.add(fam);
    } else {
      actLog.push('(none)');
    }
    session.tick();
    ticksRun += 1;
  }
  if (stopReason === 'maxTicks' && session.snapshot().burnedOut) stopReason = 'burnedOut';

  const events: Ev[] = session.events();
  const histogram = histogramOf(events);
  const sparkSpendCount = sparkSpendOf(events);
  const interactionEvents = histogram['interaction'] ?? 0;
  const talkGentleViaMethodId = events.some((e) => e.methodId === 'talk_gentle');

  const notes: string[] = [];
  if (sparkSpendCount > 0) notes.push('spark.spend present — unexpected under interaction success path');
  if (picks.inspire === 0) notes.push('no inspire@ action was listed/acted');
  if (interactionEvents === 0 && !talkGentleViaMethodId) {
    notes.push('no interaction / talk_gentle events observed');
  }

  return {
    status: 'OK',
    ok: sparkSpendCount === 0 && picks.inspire > 0 && (interactionEvents > 0 || talkGentleViaMethodId),
    histogram,
    sparkSpendCount,
    notes,
    actLog,
    seed: KINDLE_SEED,
    archetypeId: KINDLE_ARCHETYPE,
    maxTicks: KINDLE_MAX_TICKS,
    ticksRun,
    stopReason,
    eventCount: events.length,
    interactionEvents,
    talkGentleViaMethodId,
    picks,
    snapshot: snapshotExtras(session),
    botPlaySessionOpts: BOT_PLAY_SESSION_OPTS,
  };
}

// ---------------------------------------------------------------------------
// packet — cross-town ripple (mirrors tests/sim/ripple-play.test.ts)

const PACKET_SEED = 11;
const PACKET_ARCHETYPE = 'marrow';
const PACKET_TICKS = 5;

/** Prefer a person on a Fabric kin edge whose towns differ (after boot town assign). */
function findPersonWithKin(seed: number): { personId: string; crossTown: boolean; kinTo?: string } {
  const w = generateWorld({ seed, includeAnchors: true });
  const people = peopleFromWorld(w, loadData());
  for (const e of w.kinEdges ?? []) {
    const a = people[e.from];
    const b = people[e.to];
    if (a?.townId && b?.townId && a.townId !== b.townId) {
      return { personId: e.from, crossTown: true, kinTo: e.to };
    }
  }
  const fallback = (w.kinEdges ?? [])[0];
  if (!fallback) throw new Error(`no kin edges on seed ${seed}`);
  return { personId: fallback.from, crossTown: false, kinTo: fallback.to };
}

function runPacket(): ModeResult {
  const play = bootPlay(PACKET_SEED, PACKET_ARCHETYPE);
  if (!play) return apiPending('createPlaySession({ mode: "play" }) did not return a PlaySession');

  const target = findPersonWithKin(PACKET_SEED);
  const actionId = `inspire@${target.personId}`;
  const listed = play.listActions().some((a) => a.id === actionId);
  const sparkBefore = play.snapshot().spark;

  const actLog = [actionId];
  play.act(actionId);
  const lastResolve = play.lastResolve() ?? null;
  for (let i = 0; i < PACKET_TICKS; i++) {
    play.tick();
    actLog.push('(tick)');
  }

  const events: Ev[] = play.events();
  const histogram = histogramOf(events);
  const sparkSpendCount = sparkSpendOf(events);
  const packetEmit = (histogram['packet.emit'] ?? 0) > 0;
  const packetDeliver = (histogram['packet.deliver'] ?? 0) > 0;

  const notes: string[] = [];
  if (!target.crossTown) notes.push('no cross-town kin edge found; used first kin edge (fallback)');
  if (!listed) notes.push(`${actionId} not in listActions() at boot — acted anyway (test parity)`);
  if (!packetEmit && !packetDeliver) notes.push('no packet.emit / packet.deliver within 5 ticks');
  if (sparkSpendCount > 0) notes.push('spark.spend present — unexpected under interaction path');

  return {
    status: 'OK',
    ok: (packetEmit || packetDeliver) && sparkSpendCount === 0,
    histogram,
    sparkSpendCount,
    notes,
    actLog,
    seed: PACKET_SEED,
    archetypeId: PACKET_ARCHETYPE,
    ticks: PACKET_TICKS,
    target: { ...target, actionId, listedAtBoot: listed },
    packetEmit,
    packetDeliver,
    lastResolve,
    sparkBefore,
    snapshot: snapshotExtras(play),
  };
}

// ---------------------------------------------------------------------------
// refusal — coal flicker on a child (mirrors interaction-play-session.test.ts)

const REFUSAL_SEED = 42;
const REFUSAL_ARCHETYPE = 'marrow';
const REFUSAL_QUERY = { preferAnchorId: 'jonah_pike', tagsAny: ['child'], woundId: 'fear' };
const REFUSAL_FALLBACK_ID = 'jonah_pike';

function runRefusal(): ModeResult {
  const play = bootPlay(REFUSAL_SEED, REFUSAL_ARCHETYPE);
  if (!play) return apiPending('createPlaySession({ mode: "play" }) did not return a PlaySession');

  const resolved = resolveScenarioPerson(play, REFUSAL_QUERY);
  const personId = resolved ?? REFUSAL_FALLBACK_ID;
  const actionId = `shame@${personId}`;
  const sparkBefore = play.snapshot().spark;

  play.act(actionId);
  const lastResolve = play.lastResolve() ?? null;
  const sparkAfter = play.snapshot().spark;

  const events: Ev[] = play.events();
  const histogram = histogramOf(events);
  const sparkSpendCount = sparkSpendOf(events);
  const refusalCoalFlicker = (histogram['refusal.coal_flicker'] ?? 0) > 0;
  const refusalTypes = Object.keys(histogram).filter((t) => t.startsWith('refusal.'));

  const notes: string[] = [];
  if (!resolved) notes.push(`resolveScenarioPerson found no match; fell back to ${REFUSAL_FALLBACK_ID}`);
  if (!refusalCoalFlicker) notes.push('no refusal.coal_flicker on shame@ child path');
  if (sparkSpendCount > 0) notes.push('spark.spend present on refusal path — must be 0');
  if (lastResolve && lastResolve.kind !== 'refused') {
    notes.push(`lastResolve.kind=${lastResolve.kind} (expected refused)`);
  }

  return {
    status: 'OK',
    ok: refusalCoalFlicker && sparkSpendCount === 0,
    histogram,
    sparkSpendCount,
    notes,
    actLog: [actionId],
    seed: REFUSAL_SEED,
    archetypeId: REFUSAL_ARCHETYPE,
    query: REFUSAL_QUERY,
    target: { personId, resolvedViaQuery: resolved !== undefined, actionId },
    refusalCoalFlicker,
    refusalTypes,
    lastResolve,
    sparkBefore,
    sparkAfter,
  };
}

// ---------------------------------------------------------------------------
// Main

const dest = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../docs/qa/reports/_m3-interaction-evidence.json',
);

async function main(): Promise<number> {
  const mode = parseMode(process.argv.slice(2));
  const toRun: Mode[] = mode === 'all' ? [...MODES] : [mode];

  const modes: Partial<Record<Mode, ModeResult>> = {};
  for (const m of toRun) {
    if (m === 'kindle') modes.kindle = await runKindle();
    else if (m === 'packet') modes.packet = runPacket();
    else modes.refusal = runRefusal();
  }

  const ran = Object.values(modes) as ModeResult[];
  const has = (type: string) => ran.some((r) => (r.histogram[type] ?? 0) > 0);
  const coverage = {
    packetEmit: has('packet.emit'),
    packetDeliver: has('packet.deliver'),
    refusalCoalFlicker: has('refusal.coal_flicker'),
    sparkSpendCount: ran.reduce((n, r) => n + r.sparkSpendCount, 0),
    siteKindle: has('site.kindle'),
    markApplied: has('mark.applied'),
    interaction: has('interaction'),
  };

  const ok =
    coverage.sparkSpendCount === 0 &&
    ran.every((r) => r.ok) &&
    (!modes.packet || coverage.packetEmit || coverage.packetDeliver) &&
    (!modes.refusal || coverage.refusalCoalFlicker);

  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    JSON.stringify({ generatedAt: new Date().toISOString(), mode, ok, modes, coverage }, null, 2) + '\n',
  );
  console.error(`wrote ${dest}`);

  const perMode = toRun.map((m) => `${m}=${modes[m]!.ok ? 'ok' : modes[m]!.status === 'OK' ? 'FAIL' : modes[m]!.status}`);
  console.log(
    `m3-evidence mode=${mode} ok=${ok} [${perMode.join(' ')}] ` +
      `packetEmit=${coverage.packetEmit} packetDeliver=${coverage.packetDeliver} ` +
      `refusalCoalFlicker=${coverage.refusalCoalFlicker} sparkSpend=${coverage.sparkSpendCount} ` +
      `siteKindle=${coverage.siteKindle} markApplied=${coverage.markApplied} interaction=${coverage.interaction}`,
  );

  return ok ? 0 : 1;
}

try {
  process.exit(await main());
} catch (err) {
  if (err instanceof UsageError) {
    console.error(`usage: npx vite-node scripts/m3-interaction-evidence.mts [--mode kindle|packet|refusal|all] — ${err.message}`);
    process.exit(2);
  }
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(JSON.stringify({ status: 'ERROR', ok: false, error: message }, null, 2));
  process.exit(2);
}
