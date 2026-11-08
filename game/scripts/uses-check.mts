/**
 * Every thing has at least two uses (items, nodes, animals), each with a supply and a demand.
 * The rule lives in game/src/sim/contrib/uses-check.ts. Run: npx vite-node game/scripts/uses-check.mts
 * (add --table to print what each thing is for).
 */
import { checkUses } from '../src/sim/contrib/uses-check';

const r = checkUses();
if (process.argv.includes('--table')) {
  for (const row of r.rows) console.log(`${row.kind.padEnd(5)} ${row.id.padEnd(13)} uses: ${row.uses.join('; ')}  |  from: ${row.supplies.join('; ')}`);
}
for (const e of r.errors) console.error(`uses-check: ${e}`);
console.log(r.ok ? `uses-check: ok (${r.rows.length} things, each with 2+ uses and a supply)` : `uses-check: ${r.errors.length} error(s)`);
process.exit(r.ok ? 0 : 1);
