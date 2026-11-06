/**
 * M3 interaction re-gate — HOLD prep evidence probe.
 *
 * Boots a live bot session via the same feature-detect path as the playthrough
 * matrix (connectBotSession + BOT_PLAY_SESSION_OPTS), runs a short act/tick
 * loop, and reports an event-type histogram plus whether spark.spend appears.
 *
 * Does not touch run-matrix.ts or run-playthrough-matrix.mts.
 *
 * Run: npx vite-node scripts/m3-interaction-evidence.mts
 * Out: docs/qa/reports/_m3-interaction-evidence.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  connectBotSession,
  BOT_PLAY_SESSION_OPTS,
  type BotAction,
  type BotEvent,
} from '../tests/bots/bot-session.ts';

const SEED = 42;
const ARCHETYPE_ID = 'marrow';
const MAX_TICKS = 20;

type PickFamily = 'inspire' | 'advance' | 'travel' | 'other';

function familyOf(id: string): PickFamily {
  if (id.startsWith('inspire@')) return 'inspire';
  if (id.startsWith('advance:')) return 'advance';
  if (id.startsWith('travel:')) return 'travel';
  return 'other';
}

function isNoop(a: BotAction): boolean {
  return a.family === 'noop';
}

/**
 * Pick order:
 *  1. inspire@ at least once (interactionCompat → talk_gentle)
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
  return actions.find((a) => !isNoop(a))?.id ?? null;
}

const dest = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../docs/qa/reports/_m3-interaction-evidence.json',
);

function writeReport(payload: unknown): void {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(payload, null, 2));
  console.log(`wrote ${dest}`);
}

async function main(): Promise<number> {
  const session = await connectBotSession();
  if (!session) {
    console.log(
      JSON.stringify(
        {
          status: 'API_PENDING',
          ok: false,
          note: 'connectBotSession() returned null — no matching play-session export in src/sim/index.ts',
          botPlaySessionOpts: BOT_PLAY_SESSION_OPTS,
        },
        null,
        2,
      ),
    );
    return 1;
  }

  session.start({ seed: SEED, archetypeId: ARCHETYPE_ID });

  const actLog: string[] = [];
  const picks: Record<PickFamily, number> = { inspire: 0, advance: 0, travel: 0, other: 0 };
  const done = new Set<PickFamily>();
  let ticksRun = 0;
  let stopReason = 'maxTicks';

  for (let i = 0; i < MAX_TICKS; i++) {
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

  const events: BotEvent[] = session.events();
  const histogram: Record<string, number> = {};
  for (const e of events) histogram[e.type] = (histogram[e.type] ?? 0) + 1;

  const sparkSpendCount = events.filter((e) => e.type === 'spark.spend').length;
  const interactionCount = events.filter(
    (e) => e.type === 'interaction' || e.methodId === 'talk_gentle',
  ).length;

  const refusalTypes = Object.keys(histogram).filter((t) => t.startsWith('refusal.'));
  const notableTypes = {
    interaction: events.some((e) => e.type === 'interaction'),
    talkGentleViaMethodId: events.some((e) => e.methodId === 'talk_gentle'),
    siteKindle: 'site.kindle' in histogram,
    markApplied: 'mark.applied' in histogram,
    packetEmit: 'packet.emit' in histogram,
    refusalCoalFlicker: 'refusal.coal_flicker' in histogram,
    anyRefusal: refusalTypes.length > 0,
    refusalTypes,
  };

  const snap = session.snapshot();
  const snapshot = {
    spark: snap.spark,
    burnedOut: snap.burnedOut,
    hollowCount: snap.hollowCount,
    reignitedCount: snap.reignitedCount,
    tick: snap.tick,
  };

  const notes: string[] = [];
  if (sparkSpendCount > 0) {
    notes.push('spark.spend present — unexpected under interaction success path');
  }
  if (picks.inspire === 0) notes.push('no inspire@ action was listed/acted');
  if (interactionCount === 0) notes.push('no interaction / talk_gentle events observed');

  const summary = {
    status: 'OK',
    ok: sparkSpendCount === 0,
    seed: SEED,
    archetypeId: ARCHETYPE_ID,
    maxTicks: MAX_TICKS,
    ticksRun,
    stopReason,
    eventCount: events.length,
    histogram,
    sparkSpendCount,
    interactionCount,
    notableTypes,
    picks,
    snapshot,
    notes,
  };

  console.log(JSON.stringify(summary, null, 2));

  writeReport({
    generatedAt: new Date().toISOString(),
    ...summary,
    botPlaySessionOpts: BOT_PLAY_SESSION_OPTS,
    actLog,
  });

  return 0;
}

try {
  process.exit(await main());
} catch (err) {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(JSON.stringify({ status: 'ERROR', ok: false, error: message }, null, 2));
  process.exit(2);
}
