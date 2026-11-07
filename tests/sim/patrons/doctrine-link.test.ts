import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { actMethod } from '../../../src/sim/play-session/play-session-act';
import { advanceToDawn } from '../../../src/sim/scenario/scenario-advance';
import { ensureHoard } from '../../../src/sim/hoard';
import { ensureDoctrines } from '../../../src/sim/doctrine-tick';

const run = (seed: number) => {
  const b = bootPlayState(seed, 'marrow');
  const s = b.state;
  s.player.townId = 'ashford';
  ensureHoard(s).notoriety = 0.5;
  const pid = Object.keys(s.people).sort().find((id) => s.people[id]!.townId === 'ashford' && s.people[id]!.tags?.includes('doctrine_voice'))!;
  for (const id of ['patron_accept_mill_deny', 'patron_accept_mill_tithe', 'patron_pay_mill_tithe']) {
    s.player.spark = 100;
    actMethod(s, `${id}@${pid}`, [], undefined, { interactionCompat: b.interactionRt });
  }
  for (let i = 0; i < 12; i++) advanceToDawn(s);
  return JSON.stringify({ d: ensureDoctrines(s).doctrine_mill_bread, n: s.hoard!.notoriety, p: s.patronDeals, c: s.player.coin });
};

describe('patron deals shift doctrine + notoriety deterministically', () => {
  it('same seed => identical result; deals recorded', () => {
    const a = run(21);
    expect(a).toBe(run(21));
    const o = JSON.parse(a);
    expect(Object.keys(o.p).length).toBe(2);
    expect(o.n).toBeGreaterThan(0);
  });
  it('no Math.random / archetypeId === in patrons', () => {
    for (const f of readdirSync('src/sim/patrons')) {
      expect(readFileSync(`src/sim/patrons/${f}`, 'utf8')).not.toMatch(/Math\.random|archetypeId ===/);
    }
  });
});
