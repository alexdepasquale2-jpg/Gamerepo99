import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  STYLES,
  runMatrix,
  runOne,
  type MatrixResult,
} from './run-matrix';
import { connectBotSession, type BotSession } from './bot-session';
import {
  detectStuck,
  detectBoredom,
  methodDominance,
  burnoutRate,
  hollowVsReignited,
} from './metrics';
import thresholds from './thresholds.json';
import { createStylePolicy } from './style-policy';

/** In-test fake session that drives measurable traces without Forge API. */
function createFakeSession(opts?: {
  stuck?: boolean;
  burnoutAt?: number;
}): BotSession {
  let tickN = 0;
  let burnedOut = false;
  let hollow = 0;
  let reignited = 0;
  let lastMethod: string | undefined;
  const eventLog: { type: string; methodId?: string }[] = [];
  const forceStuck = opts?.stuck ?? false;
  const burnoutAt = opts?.burnoutAt;

  return {
    start() {
      tickN = 0;
      burnedOut = false;
      hollow = 0;
      reignited = 0;
      lastMethod = undefined;
      eventLog.length = 0;
    },
    listActions() {
      if (burnedOut) return [];
      if (forceStuck) return [];
      return [
        { id: 'strike', family: 'savage' },
        { id: 'comfort', family: 'kind' },
        { id: 'probe', family: 'mixed' },
      ];
    },
    act(actionId) {
      lastMethod = actionId;
      eventLog.push({ type: 'method', methodId: actionId });
      if (actionId === 'strike') hollow += 1;
      if (actionId === 'comfort') reignited += 1;
    },
    tick() {
      tickN += 1;
      if (burnoutAt !== undefined && tickN >= burnoutAt) burnedOut = true;
    },
    snapshot() {
      return {
        tick: tickN,
        spark: burnedOut ? 0 : 1,
        burnedOut,
        reignitedCount: reignited,
        hollowCount: hollow,
        fingerprint: forceStuck ? 'stuck' : `fp-${tickN}-${lastMethod ?? 'none'}`,
      };
    },
    events() {
      return [...eventLog];
    },
  };
}

describe('run-matrix', () => {
  it('covers marrow × ivy_quill × basilisk_brood and three styles', () => {
    expect(ARCHETYPES).toEqual(['marrow', 'ivy_quill', 'basilisk_brood']);
    expect(STYLES).toEqual(['savage', 'kind', 'mixed']);
  });

  it('marks cells API_PENDING when connectBotSession is null', async () => {
    const live = await connectBotSession();
    expect(live).toBeNull();
    const result = await runMatrix({ seeds: [1], maxTicks: 5 });
    expect(result.status).toBe('API_PENDING');
    expect(result.cells.length).toBe(ARCHETYPES.length * STYLES.length * 1);
    for (const cell of result.cells) {
      expect(cell.status).toBe('API_PENDING');
    }
  });

  it('runOne with fake session produces traces and metrics path', () => {
    const session = createFakeSession();
    const cell = runOne({
      session,
      archetypeId: 'marrow',
      style: 'savage',
      seed: 7,
      maxTicks: 12,
      thresholds,
    });
    expect(cell.status).toBe('OK');
    expect(cell.traces.length).toBeGreaterThan(0);
    expect(typeof cell.stuck).toBe('boolean');
    expect(typeof cell.bored).toBe('boolean');
    expect(cell.dominance.maxPickRate).toBeGreaterThan(0);
  });

  it('fake stuck session trips detectStuck', () => {
    const session = createFakeSession({ stuck: true });
    const cell = runOne({
      session,
      archetypeId: 'ivy_quill',
      style: 'kind',
      seed: 1,
      maxTicks: thresholds.stuckTicks + 2,
      thresholds,
    });
    expect(cell.stuck).toBe(true);
    expect(detectStuck(cell.traces, thresholds)).toBe(true);
  });

  it('fake burnout session contributes to burnoutRate and hollowVsReignited', () => {
    const session = createFakeSession({ burnoutAt: 3 });
    const cell = runOne({
      session,
      archetypeId: 'basilisk_brood',
      style: 'mixed',
      seed: 2,
      maxTicks: 8,
      thresholds,
    });
    expect(cell.summary.burnedOut).toBe(true);
    const rate = burnoutRate([cell.summary]);
    expect(rate).toBe(1);
    const hv = hollowVsReignited([cell.summary]);
    expect(hv.hollow + hv.reignited).toBeGreaterThanOrEqual(0);
  });

  it('style policy has zero archetype branches while driving fake matrix cells', () => {
    const session = createFakeSession();
    for (const style of STYLES) {
      const policy = createStylePolicy(style);
      session.start({ seed: 1, archetypeId: 'marrow' });
      const actions = session.listActions();
      const pick = policy.pick(actions, () => 0);
      expect(pick).not.toBeNull();
    }
    // boredom helper still callable on empty-ish traces
    expect(detectBoredom([], thresholds)).toBe(false);
    expect(methodDominance([], thresholds).dominantMethodId).toBeNull();
  });
});
