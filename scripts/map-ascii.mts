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
