/**
 * Offline bake: src/data/people/social-web.json + social-centrality.json.
 * Usage: npm run bake:social [-- <seed>]   (vite-node; never called at runtime)
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bakeSocialWeb, DEFAULT_SOCIAL_SEED } from '../src/sim/social/bake/social-bake';

const seed = Number(process.argv[2] ?? DEFAULT_SOCIAL_SEED);
const { web, centrality } = bakeSocialWeb(seed);
const dir = join(process.cwd(), 'src', 'data', 'people');

/** One row per line keeps files diffable and < 400 lines. */
function compact(head: Record<string, unknown>, key: string, rows: unknown[]): string {
  const lines = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  const body = rows.map((r, i) => `    ${JSON.stringify(r)}${i < rows.length - 1 ? ',' : ''}`);
  return ['{', ...lines, `  ${JSON.stringify(key)}: [`, ...body, '  ]', '}', ''].join('\n');
}

const { edges, ...webHead } = web;
writeFileSync(
  join(dir, 'social-web.json'),
  compact({ ...webHead, spec: 'docs/superpowers/specs/2026-11-06-social-graph/03-worldgen.md', bake: 'npm run bake:social' }, 'edges', edges),
);
const { rows, ...cHead } = centrality;
writeFileSync(
  join(dir, 'social-centrality.json'),
  compact({ ...cHead, spec: 'docs/superpowers/specs/2026-11-06-social-graph/01-model.md', bake: 'npm run bake:social' }, 'rows', rows),
);
console.log(`baked seed ${seed}: ${edges.length} edges, mean hops ${web.meanHops}, ${rows.filter((r) => r.influential).length} influential`);
