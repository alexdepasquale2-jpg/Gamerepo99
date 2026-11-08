/**
 * Data coverage for world, items, crafting, goods and crops: every row of those files must be USED in play,
 * not just parsed. A headless session is driven through the same entry points the game uses (session.act /
 * listVerbs on thing targets, pickUp/putDown, workAt, the shop's settle, wait), and every row's code path
 * calls noteUse (game/src/sim/data-use-world.ts). Any row never noted is printed and the run fails.
 *
 * Setup only stocks the satchel by writing state.inventory directly (never addItem), so "got" in the
 * report means a real path minted the item. The world's ladder chunks are dressed here as the stamp source
 * dresses them for the scene, so farms sow their crops. Art rows (data/art/overworld-assets.json) are
 * drawn by the browser and checked in the Playwright pass, not here.
 *
 * Seeds 42, 7 and 99 are played 32 days each (a crop's year is 16), one tracker across all three.
 *
 * Run: npx vite-node --config game/vite.config.ts game/scripts/coverage-world.mts [--seed N] [--verbose]
 */
import itemsJson from '../src/data/items/items.json';
import recipesJson from '../src/data/items/recipes.json';
import propsJson from '../src/data/world/props.json';
import faunaJson from '../src/data/world/fauna.json';
import nodesJson from '../src/data/world/resource-nodes.json';
import landJson from '../src/data/world/land-acts.json';
import carryJson from '../src/data/items/carry.json';
import shopsJson from '../src/data/items/shops.json';
import jobsJson from '../src/data/items/jobs.json';
import buildingsJson from '../src/data/items/buildings.json';
import cropsJson from '../src/data/economy/crops.json';
import settlementsJson from '../src/data/art/settlements.json';
import { createPlaySession } from '../src/sim/play-session/play-session';
import { usedIds } from '../src/sim/data-use-world';
import { inventoryOf } from '../src/sim/goods/inventory';
import { placeNodes } from '../src/sim/goods/nodes';
import { facilityPlaces } from '../src/sim/economy/facilities';
import { layoutWorld } from '../src/sim/map/world-layout';
import { buildRoads, createStampRasterSource } from '../src/sim/map/stamp-raster';
import { createTerrainAccess } from '../src/sim/map/terrain-access';
import { landActOn, type LandView } from '../src/sim/land-acts';
import { listPiles } from '../src/sim/carry';
import { settle, shopStock, type ShopRef } from '../src/sim/goods/shop';
import { visitorOf } from '../src/sim/visitors';
import { stakePlan, PLAYER_OWNER } from '../src/sim/economy/build-plans';
import { CHUNK_SIZE } from '../src/sim/map/constants';
import { townBuildings } from '../src/sim/map/interiors';
import { siteInTown } from '../src/sim/hoard/state';
import { graveId } from '../src/sim/contrib/graves';
import type { Target } from '../src/sim/play-session/targets';
import type { SimState } from '../src/sim/types/runtime';

const args = process.argv.slice(2);
/** Several districts, so kinds one seed lacks (a lumber camp, a farm on a wood's edge) are met in another. */
const SEEDS = args.includes('--seed') ? [Number(args[args.indexOf('--seed') + 1])] : [42, 7, 99];
const DAYS = 32;
const VERBOSE = args.includes('--verbose');
const log = (...a: unknown[]) => { if (VERBOSE) console.log(...a); };

type Row = { id: string; verbs?: { id: string }[] };
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

// ---------- what must be noted ----------
const ITEMS = (itemsJson as unknown as { items: Row[] }).items;
const PROPS = (propsJson as unknown as { props: { type: string; linger?: string; verbs: { id: string }[] }[]; lingerTags: Record<string, unknown> });
const FAUNA = (faunaJson as unknown as { fauna: Row[] }).fauna;
const NODES = (nodesJson as unknown as { kinds: Row[] }).kinds;
const CROPS = cropsJson as unknown as { crops: { id: string }[]; stages: { id: string }[] };
const CARRY = carryJson as unknown as { loads: { itemId: string }[]; facilityPiles: Record<string, string[]>; townPiles: string[] };
const expected: Record<string, string[]> = {
  items: ids(ITEMS),
  'items.use': ids(ITEMS),
  'items.verbs': ITEMS.flatMap((i) => (i.verbs ?? []).map((v) => `${i.id}.${v.id}`)),
  recipes: ids((recipesJson as { recipes: { id: string }[] }).recipes),
  stations: Object.keys((recipesJson as { stations: Record<string, unknown> }).stations),
  props: PROPS.props.filter((p) => p.verbs.length).map((p) => p.type),
  'props.verbs': PROPS.props.flatMap((p) => p.verbs.map((v) => `${p.type}.${v.id}`)),
  'props.linger': Object.keys(PROPS.lingerTags),
  fauna: ids(FAUNA),
  'fauna.verbs': FAUNA.flatMap((f) => (f.verbs ?? []).map((v) => `${f.id}.${v.id}`)),
  'resource-nodes': ids(NODES),
  'resource-nodes.verbs': NODES.flatMap((n) => (n.verbs ?? []).map((v) => `${n.id}.${v.id}`)),
  'land-acts': ids((landJson as { acts: { id: string }[] }).acts),
  crops: ids(CROPS.crops),
  'crops.stage': CROPS.crops.flatMap((c) => CROPS.stages.map((s) => `${c.id}.${s.id}`)),
  'crops.harvest': ids(CROPS.crops),
  carry: CARRY.loads.map((l) => l.itemId),
  'carry.facilityPiles': Object.entries(CARRY.facilityPiles).flatMap(([k, items]) => items.map((i) => `${k}.${i}`)),
  'carry.townPiles': CARRY.townPiles,
  shops: Object.keys((shopsJson as { kinds: Record<string, unknown> }).kinds),
  jobs: ids((jobsJson as { jobs: { id: string }[] }).jobs),
  buildings: ids((buildingsJson as { buildings: { id: string }[] }).buildings),
  'settlements.palettes': settlementsJson.palettes.map((_, i) => String(i)),
  'settlements.rules': Object.keys(settlementsJson.rules),
};

// ---------- the session ----------
function runSeed(SEED: number): void {
const session = createPlaySession({ mode: 'play', seed: SEED });
session.start({ seed: SEED });
const st = (): SimState => session.getState()!;
const world = session.getWorld()!;
const layout = layoutWorld(world, SEED);
const roads = buildRoads(layout);
const terrain = createTerrainAccess(layout, SEED, roads, () => st().tileEdits);
const view: LandView = { ...terrain };
const home = st().player.townId ?? layout.settlements[0]!.id;
const homeAt = layout.settlements.find((t) => t.id === home) ?? layout.settlements[0]!;

/** Stock the satchel for setup only: written straight to the inventory, so it is never counted as "got". */
function stock(id: string, n: number): void {
  const inv = inventoryOf(st());
  inv[id] = Math.max(inv[id] ?? 0, n);
  if (id === 'coin') st().player.coin = inv.coin;
}
const used = () => new Set(usedIds());
const has = (file: string, id: string) => used().has(`${file}:${id}`);
const actAll = (t: Target, prefix?: string): void => {
  for (const v of session.listVerbs(t)) {
    if (prefix && !v.id.startsWith(prefix)) continue;
    const out = session.act(v.id, t);
    log(`  ${v.id} -> ${out?.ok ? 'ok' : 'no'} ${out?.line ?? ''}`);
  }
};
/** Keep the walker on their feet (setup: spark is not a data row), so a long day of uses never burns them out. */
const rested = () => { st().player.spark = 40; };
// Every town's doors, as the world paints and enters them (settlement plan rules and wall palettes).
for (const t of layout.settlements) townBuildings(t);

// Farms in the chunks round every town are dressed, as the stamp source does for the scene (sows the crops).
const source = createStampRasterSource(world, SEED, () => st().tileEdits);
const crops = new Map<string, { q: number; r: number }>();
// The whole district, nearest towns first, until every crop is found (a wood-edge farm of roots is rare).
const qs = layout.settlements.map((t) => t.q), rs = layout.settlements.map((t) => t.r), PAD = 200;
scan: for (let cy = Math.floor((Math.min(...rs) - PAD) / CHUNK_SIZE); cy <= Math.floor((Math.max(...rs) + PAD) / CHUNK_SIZE); cy++) {
  for (let cx = Math.floor((Math.min(...qs) - PAD) / CHUNK_SIZE); cx <= Math.floor((Math.max(...qs) + PAD) / CHUNK_SIZE); cx++) {
    for (const p of source.getChunk({ cx, cy }).props) if (p.type === 'field' && !crops.has(p.state)) crops.set(p.state, { q: p.position.x, r: p.position.y });
    if (CROPS.crops.every((c) => crops.has(c.id))) break scan;
  }
}
log('crops sown:', [...crops.keys()].join(', '));

const nodes = placeNodes(SEED, layout.settlements, layout.routes);
const tileTarget = (q: number, r: number): Target => ({ kind: 'tile', id: `${q},${r}`, data: { q, r, act: landActOn(view, q, r)?.id, from: { q, r: r + 1 }, facing: { dx: 0, dy: -1 }, view, towns: layout.settlements.map((t) => ({ id: t.id, q: t.q, r: t.r })) } });
/** Tiles near home whose ground allows each land act, nearest first; a worked tile is used up, so each day takes fresh ones. */
const landAll = new Map<string, { q: number; r: number }[]>();
const seen = new Set<string>();
for (let d = 4; d < 400 && [...landAll.values()].filter((l) => l.length >= DAYS * 2).length < 3; d++) for (let a = 0; a < 128; a++) {
  const q = Math.round(homeAt.q + Math.cos((a / 128) * Math.PI * 2) * d), r = Math.round(homeAt.r + Math.sin((a / 128) * Math.PI * 2) * d);
  if (seen.has(`${q},${r}`)) continue;
  seen.add(`${q},${r}`);
  const act = landActOn(view, q, r);
  if (act) (landAll.get(act.id) ?? landAll.set(act.id, []).get(act.id)!).push({ q, r });
}
let landTiles = new Map<string, { q: number; r: number }>();

function dayOfWork(day: number): void {
  // Wild props, each verb with what it needs in the satchel (and a held item on it, for the item verbs).
  // The wild gives a little spark a day in all: every other day is spent sitting at one kind of place, the rest using things.
  const n = PROPS.props.length, sitTag = Object.keys(PROPS.lingerTags)[(day >> 1) % Object.keys(PROPS.lingerTags).length];
  const sitAt = PROPS.props.find((p) => p.linger === sitTag);
  if (sitAt && day % 2 === 0) { rested(); session.linger(`prop:${sitAt.type}@${day},${day}`, 120); }
  for (let i = 0; i < n; i++) {
    const p = PROPS.props[(i + day) % n]!;
    const crop = [...crops.keys()][day % Math.max(1, crops.size)];
    const t: Target = { kind: 'prop', id: `${p.type}@${day},${day}`, data: { type: p.type, ...(p.type === 'field' && crop ? { crop } : {}) } };
    for (const n of ['wood', 'fish', 'bread', 'timber', 'rope', 'grain', 'berries']) stock(n, 2);
    rested();
    actAll(t, 'prop.');
  }
  // Every crop's field, today (stages turn with the days).
  for (const [crop, at] of crops) { rested(); actAll({ kind: 'prop', id: `field@${at.q},${at.r}`, data: { type: 'field', crop } }, 'prop.glean'); }
  // Animals.
  for (const f of FAUNA) { rested(); actAll({ kind: 'fauna', id: `${f.id}#${day}`, data: { kindId: f.id } }, 'fauna.'); }
  // Resource nodes: gather and their own verbs.
  for (const k of NODES) {
    const n = nodes.find((x) => x.kindId === k.id);
    if (!n) continue;
    for (const id of ['timber', 'tools', 'rope', 'wood']) stock(id, 2);
    rested();
    actAll({ kind: 'node', id: n.id, data: n });
  }
  // Craft every recipe at a station that makes it.
  const stations: Target[] = [{ kind: 'hearth', id: home }, ...facilityPlaces(st()).map((f) => ({ kind: 'facility' as const, id: f.id }))];
  for (const r of (recipesJson as { recipes: { id: string; in: Record<string, number>; tool?: string[] }[] }).recipes) {
    for (const [id, n] of Object.entries(r.in)) stock(id, n);
    if (r.tool) stock(r.tool[0]!, 1);
    for (const t of stations) { const out = session.act(`craft.make.${r.id}@${t.kind}:${t.id}`, t); if (out?.ok) break; }
  }
  // Land acts on real ground near home, with the tools to do them (two fresh tiles per act a day: one by hand, one by the held tool).
  landTiles = new Map([...landAll].map(([id, l]) => [id, l[(day * 2) % l.length]!]));
  for (const [, at] of landTiles) { stock('mallet', 1); stock('axe', 1); stock('stone', 3); stock('timber', 1); actAll(tileTarget(at.q, at.r), 'land.'); }
  // Item verbs: each item held over each kind of target it can be used on.
  const people = Object.keys(st().people).filter((id) => id !== st().player.id && st().people[id]!.townId === home).sort();
  const targets: Target[] = [
    { kind: 'hearth', id: home }, { kind: 'board', id: home }, { kind: 'signpost', id: home },
    ...nodes.slice(0, 40).map((n) => ({ kind: 'node' as const, id: n.id, data: n })),
    ...FAUNA.map((f) => ({ kind: 'fauna' as const, id: `${f.id}#i${day}`, data: { kindId: f.id } })),
    { kind: 'prop', id: `shrine@${day},1`, data: { type: 'shrine' } },
    ...[...landAll.values()].map((l) => l[(day * 2 + 1) % l.length]!).map((at) => tileTarget(at.q, at.r)),
    ...(siteInTown(st(), home) ? [{ kind: 'chest' as const, id: siteInTown(st(), home)!.id }] : []),
    ...(st().legacy?.graves ?? []).map((g) => ({ kind: 'grave' as const, id: graveId(g) })),
    ...(st().build?.claims ?? []).filter((c) => c.townId === home).map((c) => ({ kind: 'plot' as const, id: c.id })),
    ...(st().caravans ?? []).map((c) => ({ kind: 'wagon' as const, id: c.id })),
    ...people.map((id) => ({ kind: 'person' as const, id })),
  ];
  for (const item of ITEMS) {
    for (const v of item.verbs ?? []) {
      if (has('items.verbs', `${item.id}.${v.id}`)) continue;
      stock(item.id, 3); stock('coin', 20);
      for (const base of targets) {
        const t = { ...base, data: { ...(base.data as object | undefined), heldItem: item.id } };
        const id = session.listVerbs(t).find((x) => x.id.startsWith(`use.${item.id}.${v.id}@`))?.id;
        if (id && session.act(id, t)?.ok) break;
      }
    }
  }
  // Carry: lift each pile there is, then set it down at the hearth.
  for (const p of listPiles(st())) {
    if (p.load <= 0 || has('carry', p.itemId) && (p.source !== 'facility' || has('carry.facilityPiles', `${facilityPlaces(st()).find((f) => f.id === p.ref)?.kind}.${p.itemId}`)) && (p.source !== 'town' || has('carry.townPiles', p.itemId))) continue;
    if (session.pickUp(p.key).ok) session.putDown(`hearth:${p.townId ?? home}`);
    if (session.carrying()) session.dropCarried({ x: 0, y: 0 });
  }
  // Shops: a stall, each keeper, and any pedlar about; buy one of the first thing they have.
  stock('coin', 40);
  const refs: ShopRef[] = [{ kind: 'stall', id: home }];
  for (const id of Object.keys(st().people).sort()) {
    const v = visitorOf(st(), id);
    if (v?.kind === 'pedlar') refs.push({ kind: 'pedlar', id });
    else if (!v && id !== st().player.id) refs.push({ kind: 'keeper', id });
  }
  for (const ref of refs) {
    const view = shopStock(st(), ref);
    const line = view.theirs.find((l) => l.count > 0 && l.price > 0);
    if (line) settle(st(), ref, { buy: { [line.itemId]: 1 }, sell: {} });
  }
  // Help at every work spot round the district until the day's cap, so each trade's lead shares their yield.
  for (const t of Object.keys(st().towns ?? {}).sort()) for (const task of session.tasksNear(t)) {
    for (let k = 0; k < 6; k++) if (!session.workAt(task.id, 1).ok) break;
  }
}

// The player stakes one build of each kind at home, so every building is raised at least once.
for (const b of (buildingsJson as { buildings: { id: string }[] }).buildings) {
  try { stakePlan(st(), PLAYER_OWNER, home, b.id); } catch (e) { log(`stake ${b.id}: ${(e as Error).message}`); }
}

for (let day = 0; day < DAYS; day++) {
  dayOfWork(day);
  // The player's own builds are fed what they lack, as bringing it would.
  for (const plan of st().build?.plans ?? []) if (plan.ownerId === PLAYER_OWNER && plan.stage === 'gathering') {
    for (const [k, q] of Object.entries((buildingsJson as { buildings: { id: string; cost: Record<string, number> }[] }).buildings.find((b) => b.id === plan.kind)?.cost ?? {})) plan.have[k] = Math.max(plan.have[k] ?? 0, q);
  }
  session.wait(1);
}
log(`seed ${SEED}: day ${st().day}, spark ${st().player.spark}, burned out ${session.snapshot().burnedOut}`);
}

for (const seed of SEEDS) runSeed(seed);

// ---------- report ----------
const got = new Set(usedIds());
const missing: string[] = [];
for (const [file, list] of Object.entries(expected)) for (const id of list) if (!got.has(`${file}:${id}`)) missing.push(`${file}:${id}`);
const total = Object.values(expected).reduce((a, l) => a + l.length, 0);
for (const [file, list] of Object.entries(expected)) {
  const miss = list.filter((id) => !got.has(`${file}:${id}`));
  console.log(`${file.padEnd(22)} ${String(list.length - miss.length).padStart(3)}/${String(list.length).padEnd(3)} ${miss.length ? `missing: ${miss.join(', ')}` : 'ok'}`);
}
console.log(missing.length ? `coverage-world: ${missing.length} of ${total} rows never used` : `coverage-world: ok (all ${total} rows used in play, seeds ${SEEDS.join(', ')})`);
process.exit(missing.length ? 1 : 0);
