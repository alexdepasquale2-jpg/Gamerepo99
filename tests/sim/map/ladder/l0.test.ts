import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../../../src/sim/gen/world';
import { layoutWorld } from '../../../../src/sim/map/world-layout';
import { buildL0 } from '../../../../src/sim/map/ladder/l0';
import { cellOf, glyphAt, toAscii } from '../../../../src/sim/map/ladder/grid';

const world = generateWorld({ seed: 42, includeAnchors: true, peopleCount: 60 });
const layout = layoutWorld(world, 42);

describe('L0 world grid', () => {
  it('is deterministic and matches the golden ASCII', () => {
    const a = toAscii(buildL0(layout, 42));
    expect(toAscii(buildL0(layout, 42))).toBe(a);
    expect(a).toMatchInlineSnapshot(`
      "TT^TTT.^
      TT#=~T.T
      .T====#T
      ..==#=,,
      TT===T,T
      ,T#=TT.~
      T,.,,.^."
    `);
  });

  it('marks every settlement as a town cell and covers them all', () => {
    const g = buildL0(layout, 42);
    expect(g.rows.every((r) => r.length === g.w)).toBe(true);
    for (const s of layout.settlements) {
      const c = cellOf(g, s.q, s.r);
      expect(glyphAt(g, c.x, c.y)).toBe('#');
    }
  });
});
