/** Print the L0 world grid as ASCII. Usage: npm run map:ascii -- [seed] */
import { generateWorld } from '../src/sim/gen/world';
import { layoutWorld } from '../src/sim/map/world-layout';
import { buildL0 } from '../src/sim/map/ladder/l0';
import { toAscii } from '../src/sim/map/ladder/grid';

const seed = Number(process.argv[2] ?? 42);
const world = generateWorld({ seed, includeAnchors: true, peopleCount: 60 });
const g = buildL0(layoutWorld(world, seed), seed);
console.log(`seed ${seed}  L0 ${g.w}x${g.h}  cell ${g.cellTiles} tiles  origin ${g.q0},${g.r0}`);
console.log(toAscii(g));

// Zoom: refine down the ladder around the first settlement.
import { createLadder, levelCell } from '../src/sim/map/ladder/refine';
import { ladderView } from '../src/sim/map/ladder/view';
const layout = layoutWorld(world, seed);
const ladder = createLadder(seed);
const s0 = layout.settlements[0]!;
for (const k of [1, 2, 3]) {
  const w = 48, h = 24, cell = levelCell(k);
  const v = ladderView(ladder, layout, seed, k, s0.q - (w / 2) * cell, s0.r - (h / 2) * cell, w, h);
  console.log(`\nL${k} (cell ${cell} tiles) around ${s0.id}`);
  console.log(toAscii(v));
}
