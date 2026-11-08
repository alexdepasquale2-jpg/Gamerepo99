/**
 * Saves survive updates (K8). Loads every fixture in game/scripts/save-fixtures through the same path the
 * game uses (save slots -> parseAndValidateSave -> loadState), then saves and loads it again, and checks that
 * newer saves are refused politely and unknown optional fields ride along.
 *
 * Run: npm run game:check-saves
 * Regenerate the fixtures from a booted session: npm run game:check-saves -- --write
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addItem, inventoryOf } from '../src/sim/goods/inventory';
import { dropItem } from '../src/sim/goods/item-use';
import { TILE_PX } from '../src/sim/map/constants';
import { rescalePoint } from '../src/sim/map/tile-edits';
import { placeSettlementsBase } from '../src/sim/map/world-layout';
import { createPlaySession } from '../src/sim/play-session/play-session';
import type { PlaySession } from '../src/sim/play-session/play-session-types';
import { loadState, parseAndValidateSave, SAVE_VERSION, saveState, serializeSave, type SaveBlob } from '../src/sim/save';
import type { SimState } from '../src/sim/types/runtime';
import { createSaveSlots, type StorageLike } from '../src/ui/save-slots';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'save-fixtures');
const SEED = 42;
const DAYS = 3;

const memoryStore = (): StorageLike => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

function bootSession(): { session: PlaySession; state: SimState } {
  const session = createPlaySession({ mode: 'play', seed: SEED, archetypeId: 'marrow' }) as PlaySession;
  session.start({ seed: SEED, archetypeId: 'marrow' });
  for (let i = 0; i < DAYS; i++) session.tick();
  return { session, state: session.getState()! };
}

/**
 * v1..v4 example blobs, from one booted session. v2 is the v3 blob with a ground item on the old map scale;
 * v3 is the v4 blob without the civic registry (sim.civic), which v4 added.
 */
function writeFixtures(): void {
  const { session, state } = bootSession();
  const v1: SaveBlob = { version: 1, seed: SEED, tick: state.day, npcs: [], coin: (inventoryOf(state).coin ?? 0) + 7 };

  const itemId = 'bread';
  const settlements = session.getWorld()?.settlements ?? [];
  const base = placeSettlementsBase(settlements, SEED)[0]!;
  const old = { x: (base.q + 2) * TILE_PX, y: (base.r + 1) * TILE_PX };
  addItem(state, itemId, 1);
  dropItem(state, itemId, old);
  // v4: the same item where the 40x world puts it now; v3 is that without the civic registry.
  const v4 = saveState(state);
  for (const g of (v4.sim!.groundItems as { x: number; y: number }[]) ?? []) Object.assign(g, rescalePoint(settlements, SEED, g.x, g.y));
  const { civic: _civic, ...v3sim } = v4.sim!;
  const v3: SaveBlob = { ...v4, version: 3, sim: v3sim };
  const v2 = { ...v3, version: 2, sim: { ...v3sim, groundItems: saveState(state).sim!.groundItems } };

  for (const [name, blob] of [['v1', v1], ['v2', v2], ['v3', v3], ['v4', v4]] as const) {
    writeFileSync(join(DIR, `${name}.json`), serializeSave(blob as SaveBlob) + '\n');
    console.log(`wrote save-fixtures/${name}.json (version ${blob.version}, day ${blob.tick})`);
  }
}

type Row = { file: string; ok: boolean; note: string };

function checkFixture(file: string): Row {
  const raw = readFileSync(join(DIR, file), 'utf8');
  const parsed = parseAndValidateSave(raw);
  if (!parsed.ok) return { file, ok: false, note: `refused: ${parsed.error}` };
  // The ui path: through a save slot and back, then loadState.
  const slots = createSaveSlots(memoryStore(), () => '2026-01-01T00:00:00.000Z');
  const w = slots.write(1, parsed.blob, { town: 'fixture' });
  if (!w.ok) return { file, ok: false, note: `slot write failed: ${w.error}` };
  const r = slots.read(1);
  if (!r.ok) return { file, ok: false, note: `slot read failed: ${r.error}` };
  const from = r.blob.version;
  const state = loadState(r.blob);
  const problems: string[] = [];
  if (!state.player || !Object.keys(state.people ?? {}).length || !Object.keys(state.towns ?? {}).length) problems.push('no player/people/towns');
  if (r.blob.tick > 0 && state.day !== r.blob.tick) problems.push(`day ${state.day} != ${r.blob.tick}`);
  const coin = inventoryOf(state).coin ?? 0;
  if (from === 1 && typeof r.blob.coin === 'number' && coin !== r.blob.coin) problems.push(`coin ${coin} != ${r.blob.coin}`);
  // Saved again, it is current and loads to the same day and coin.
  const again = saveState(state);
  if (again.version !== SAVE_VERSION) problems.push(`resaved as ${again.version}`);
  const back = loadState(JSON.parse(serializeSave(again)) as SaveBlob);
  if (back.day !== state.day || (inventoryOf(back).coin ?? 0) !== coin) problems.push('round trip changed day or coin');
  const ground = (state.groundItems ?? []).map((g) => `${g.itemId}@${Math.round(g.x / TILE_PX)},${Math.round(g.y / TILE_PX)}`);
  const note = `v${from} -> v${SAVE_VERSION}: day ${state.day}, coin ${coin}, ${Object.keys(state.people).length} people, ${Object.keys(state.towns).length} towns, ground [${ground.join(' ') || 'none'}]`;
  return { file, ok: problems.length === 0, note: problems.length ? `${note}; ${problems.join('; ')}` : note };
}

/** v2 and v3 fixtures hold the same ground item: after migration both must sit in the same place. */
function checkRescale(): Row {
  const pos = (f: string) => {
    const p = parseAndValidateSave(readFileSync(join(DIR, f), 'utf8'));
    return p.ok ? (loadState(p.blob).groundItems ?? []).map((g) => [g.x, g.y].join(',')).join(' ') : `refused: ${p.error}`;
  };
  const a = pos('v2.json'), b = pos('v3.json');
  return { file: 'v2 vs v3', ok: a !== '' && a === b, note: a === b ? `ground items migrate to the v3 place (${a})` : `v2 gives ${a || 'none'}, v3 has ${b || 'none'}` };
}

/**
 * v3 -> v4 builds the civic registry: a v3 company (here one laid into the v3 fixture by hand) comes back as
 * a working site run by its owner, so no old company stops for want of a manager. v4 keeps its registry.
 */
function checkCivicMigration(): Row {
  const v3 = JSON.parse(readFileSync(join(DIR, 'v3.json'), 'utf8')) as SaveBlob;
  const sim = v3.sim as Record<string, any>;
  const owner = Object.keys(sim.people).sort().find((id) => !sim.people[id].tags?.length && sim.people[id].townId)!;
  const townId = sim.people[owner].townId;
  sim.build = { plans: [{ id: 'plan900', ownerId: owner, townId, kind: 'mill', claimId: 'claim901', stage: 'done', have: {}, laborDone: 99, startDay: 1, stalledDays: 0, doneDay: 2 }],
    claims: [{ id: 'claim901', planId: 'plan900', ownerId: owner, townId, dx: 7, dy: 0, w: 2, h: 2, kind: 'mill', status: 'built' }], next: 902 };
  sim.companies = { list: [{ id: 'co1', planId: 'plan900', name: 'Old Mill', ownerId: owner, townId, kind: 'mill', workers: [], coin: 30, founded: 2, revenue: 0, unpaid: {} }], next: 2, purse: {} };
  const state = loadState(v3) as SimState & { civic?: { sites: Record<string, { managerId?: string; status: string; source: { ref: string } }> } };
  const site = state.civic?.sites.site_plan900;
  const v4 = parseAndValidateSave(readFileSync(join(DIR, 'v4.json'), 'utf8'));
  const kept = v4.ok && !!(loadState(v4.blob) as { civic?: unknown }).civic;
  const ok = site?.managerId === owner && site.status === 'working' && site.source.ref === 'co1' && kept;
  return { file: 'v3 -> v4 civic', ok, note: ok ? `a v3 company becomes a working site run by its owner (${owner}); v4 keeps its registry` : `site ${JSON.stringify(site)}, v4 registry kept: ${kept}` };
}

function checkNewerRefused(): Row {
  const v3 = JSON.parse(readFileSync(join(DIR, 'v3.json'), 'utf8')) as SaveBlob;
  const p = parseAndValidateSave(JSON.stringify({ ...v3, version: SAVE_VERSION + 1 }));
  let threw = false;
  try {
    loadState({ ...v3, version: SAVE_VERSION + 1 });
  } catch {
    threw = true;
  }
  return { file: `v${SAVE_VERSION + 1} (newer)`, ok: !p.ok && threw, note: p.ok ? 'was accepted' : `refused politely: "${p.error}"` };
}

/** A field this build does not know (a parallel branch's new optional SimState field) loads and saves untouched. */
function checkUnknownField(): Row {
  const v3 = JSON.parse(readFileSync(join(DIR, 'v3.json'), 'utf8')) as SaveBlob;
  const field = { day: 1, notes: ['kept'] };
  const state = loadState({ ...v3, sim: { ...v3.sim, futureField: field } });
  const kept = JSON.stringify(saveState(state).sim?.futureField) === JSON.stringify(field);
  return { file: 'unknown field', ok: kept, note: kept ? 'an optional field from a newer build loads and saves as it was' : 'was dropped' };
}

if (process.argv.includes('--write')) writeFixtures();

const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
const rows: Row[] = [];
for (const f of files) {
  try {
    rows.push(checkFixture(f));
  } catch (e) {
    rows.push({ file: f, ok: false, note: `threw: ${(e as Error).message}` });
  }
}
for (const check of [checkRescale, checkCivicMigration, checkNewerRefused, checkUnknownField]) {
  try {
    rows.push(check());
  } catch (e) {
    rows.push({ file: check.name, ok: false, note: `threw: ${(e as Error).message}` });
  }
}
for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.file.padEnd(16)} ${r.note}`);
const failed = rows.filter((r) => !r.ok).length;
console.log(failed ? `check-saves: ${failed} failed` : `check-saves: ok (${files.length} fixtures, save version ${SAVE_VERSION})`);
process.exit(failed ? 1 : 0);
