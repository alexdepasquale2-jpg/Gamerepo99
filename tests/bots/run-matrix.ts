import {
  connectBotSession,
  type BotSession,
} from './bot-session';
import { createStylePolicy, type StyleId } from './style-policy';
import {
  detectStuck,
  detectBoredom,
  methodDominance,
  type TickTrace,
  type RunSummary,
  type Thresholds,
} from './metrics';
import defaultThresholds from './thresholds.json';

export const ARCHETYPES = ['marrow', 'ivy_quill', 'basilisk_brood'] as const;
export type ArchetypeId = (typeof ARCHETYPES)[number];

export const STYLES: StyleId[] = ['savage', 'kind', 'mixed'];

export type CellStatus = 'OK' | 'API_PENDING' | 'ERROR';

export type MatrixCell = {
  archetypeId: ArchetypeId;
  style: StyleId;
  seed: number;
  status: CellStatus;
  traces: TickTrace[];
  stuck: boolean;
  bored: boolean;
  dominance: ReturnType<typeof methodDominance>;
  summary: RunSummary;
  error?: string;
};

export type MatrixResult = {
  status: 'OK' | 'API_PENDING';
  cells: MatrixCell[];
};

function meaningfulChoiceCount(actions: { id: string; family?: string }[]): number {
  return actions.filter((a) => a.family !== 'noop').length;
}

export function runOne(opts: {
  session: BotSession;
  archetypeId: string;
  style: StyleId;
  seed: number;
  maxTicks: number;
  thresholds: Thresholds;
}): MatrixCell {
  const { session, archetypeId, style, seed, maxTicks, thresholds } = opts;
  const policy = createStylePolicy(style);
  const rng = mulberry32(seed);
  session.start({ seed, archetypeId });
  const traces: TickTrace[] = [];

  for (let i = 0; i < maxTicks; i++) {
    const snap = session.snapshot();
    if (snap.burnedOut) {
      traces.push({
        tick: snap.tick,
        fingerprint: snap.fingerprint,
        actionCount: 0,
        meaningfulChoices: 0,
        burnedOut: true,
        hollowCount: snap.hollowCount,
        reignitedCount: snap.reignitedCount,
      });
      break;
    }
    const actions = session.listActions();
    const pick = policy.pick(actions, rng);
    if (pick) session.act(pick);
    session.tick();
    const after = session.snapshot();
    traces.push({
      tick: after.tick,
      fingerprint: after.fingerprint,
      actionCount: actions.length,
      meaningfulChoices: meaningfulChoiceCount(actions),
      methodId: pick ?? undefined,
      burnedOut: after.burnedOut,
      hollowCount: after.hollowCount,
      reignitedCount: after.reignitedCount,
    });
    if (after.burnedOut) break;
  }

  const last = traces[traces.length - 1];
  const summary: RunSummary = {
    burnedOut: last?.burnedOut ?? false,
    hollowCount: last?.hollowCount ?? 0,
    reignitedCount: last?.reignitedCount ?? 0,
  };

  return {
    archetypeId: archetypeId as ArchetypeId,
    style,
    seed,
    status: 'OK',
    traces,
    stuck: detectStuck(traces, thresholds),
    bored: detectBoredom(traces, thresholds),
    dominance: methodDominance(traces, thresholds),
    summary,
  };
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export async function runMatrix(opts?: {
  seeds?: number[];
  maxTicks?: number;
  thresholds?: Thresholds;
}): Promise<MatrixResult> {
  const thresholds = opts?.thresholds ?? (defaultThresholds as Thresholds);
  const seeds = opts?.seeds ?? thresholds.defaultSeeds ?? [1, 2, 3];
  const maxTicks = opts?.maxTicks ?? thresholds.maxTicksPerRun ?? 200;
  const session = await connectBotSession();

  const cells: MatrixCell[] = [];
  for (const archetypeId of ARCHETYPES) {
    for (const style of STYLES) {
      for (const seed of seeds) {
        if (!session) {
          cells.push({
            archetypeId,
            style,
            seed,
            status: 'API_PENDING',
            traces: [],
            stuck: false,
            bored: false,
            dominance: { maxPickRate: 0, dominantMethodId: null, breached: false },
            summary: { burnedOut: false, hollowCount: 0, reignitedCount: 0 },
          });
          continue;
        }
        try {
          cells.push(
            runOne({ session, archetypeId, style, seed, maxTicks, thresholds }),
          );
        } catch (err) {
          cells.push({
            archetypeId,
            style,
            seed,
            status: 'ERROR',
            traces: [],
            stuck: false,
            bored: false,
            dominance: { maxPickRate: 0, dominantMethodId: null, breached: false },
            summary: { burnedOut: false, hollowCount: 0, reignitedCount: 0 },
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  return {
    status: session ? 'OK' : 'API_PENDING',
    cells,
  };
}
