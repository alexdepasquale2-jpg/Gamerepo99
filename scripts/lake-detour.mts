import { generateWorld } from '../src/sim/gen/world';
import { createNavigator } from '../src/sim/map/nav';
import { createTerrainAccess } from '../src/sim/map/terrain-access';
import { layoutWorld } from '../src/sim/map/world-layout';
import { riverRow } from '../src/sim/map/terrain';

const seeds = (process.env.SEEDS ?? '7,11,23,101,42').split(',').map(Number);
let all: number[] = [], unreach = 0, total = 0; const extras: number[] = []; const worst: string[] = [];
for (const seed of seeds) {
  const world = generateWorld({ seed, peopleCount: 8 });
  const layout = layoutWorld(world, seed);
  const terrain = createTerrainAccess(layout, seed);
  const nav = createNavigator(terrain);
  const qs = layout.settlements.map((s) => s.q), rs = layout.settlements.map((s) => s.r);
  const q0 = Math.min(...qs) - 30, q1 = Math.max(...qs) + 30, r0 = Math.min(...rs) - 30, r1 = Math.max(...rs) + 30;
  let n = 0, seedRatios: number[] = [], seedUn = 0;
  for (let r = r0; r <= r1; r += 2) {
    for (let q = q0; q <= q1; q++) {
      if (terrain.biome(q, r) === 'water' || !terrain.passable(q, r)) continue;
      let e = q + 1;
      while (e <= q1 && terrain.biome(e, r) === 'water' && Math.abs(r - riverRow(seed, e)) > 5) e++;
      const run = e - q - 1;
      if (run >= 4 && run <= 30 && e <= q1 && terrain.biome(e, r) !== 'water') {
        total++; n++;
        const p = nav.findPath({ q, r }, { q: e, r }, 30000);
        if (!p) { unreach++; seedUn++; } else { const ratio = p.length / (e - q + 1); all.push(ratio); seedRatios.push(ratio); extras.push(p.length - (e - q + 1)); if (p.length - (e - q + 1) > 25) worst.push(`${seed}@${q},${r} run ${run} path ${p.length}`); }
        q = e;
      }
    }
  }
  seedRatios.sort((a, b) => a - b);
  console.log(`seed ${seed}: crossings sampled ${n}, unreachable ${seedUn}, median ratio ${seedRatios[Math.floor(seedRatios.length / 2)]?.toFixed(2)}, p90 ${seedRatios[Math.floor(seedRatios.length * 0.9)]?.toFixed(2)}`);
}
all.sort((a, b) => a - b);
console.log(`ALL: ${total} pairs, unreachable ${unreach}, median ${all[Math.floor(all.length / 2)]?.toFixed(2)}, p90 ${all[Math.floor(all.length * 0.9)]?.toFixed(2)}, mean ${(all.reduce((s, x) => s + x, 0) / all.length).toFixed(2)}`);

extras.sort((a, b) => a - b);
console.log('extra tiles: median', extras[Math.floor(extras.length/2)], 'p90', extras[Math.floor(extras.length*0.9)], 'max', extras[extras.length-1], 'n>25:', worst.length);
console.log(worst.slice(0,8).join('\n'));
