/** Road-content tables: trades, density, workers, caravan schedules (Loom 2026-11-06). */

const LEANS = new Set(['good', 'mixed', 'bad']);
const MEANING = new Set(['meaning', 'exhaustion']);

export function validateRoadContent(data, ctx) {
  const { req, ids, people, towns } = ctx;
  const routeIds = ids(data['routes.json']?.routes);
  const biomes = ids(data['biomes.json']?.biomes);
  const ecoRes = ids(data['economy-resources.json']?.resources);
  const facilityKinds = new Set(
    (data['facilities.json']?.facilities || []).map((f) => f.kind).filter(Boolean),
  );
  const encTables = data['road-encounters.json']?.tables || [];

  const tradesDoc = data['travel-trades.json'];
  req(!!tradesDoc, 'travel-trades.json missing');
  const trades = tradesDoc?.trades || [];
  req(trades.length >= 11, `travel-trades need ≥11 (good+bad+pose); have ${trades.length}`);

  const tradeIds = new Set();
  let hasPose = false;
  let hasEscort = false;
  for (const tr of trades) {
    req(!!tr.id && !tradeIds.has(tr.id), `trade dup/missing id ${tr?.id}`);
    tradeIds.add(tr.id);
    req(LEANS.has(tr.lean), `trade ${tr.id}: lean`);
    req(typeof tr.baseSpark === 'number', `trade ${tr.id}: baseSpark`);
    req(typeof tr.baseCoin === 'number', `trade ${tr.id}: baseCoin`);
    req(typeof tr.speedMul === 'number', `trade ${tr.id}: speedMul`);
    req(typeof tr.trustBias === 'number', `trade ${tr.id}: trustBias`);
    req(Array.isArray(tr.tells) && tr.tells.length >= 1, `trade ${tr.id}: tells`);
    for (const rid of tr.routeIds || []) req(routeIds.has(rid), `trade ${tr.id} route ${rid}`);
    if (tr.requiresPersonBurning) req(people.has(tr.requiresPersonBurning), `trade ${tr.id} person`);
    if (tr.poseAs) hasPose = true;
    if (tr.role === 'escort' || tr.id === 'escort_watch') hasEscort = true;
  }
  req(tradeIds.has('false_guide'), 'missing false_guide trade');
  req(tradeIds.has('highwayman_as_carter'), 'missing highwayman_as_carter trade');
  req(hasPose, 'need ≥1 pose-as trade');
  req(hasEscort, 'missing escort trade');

  const density = data['encounter-density.json'];
  req(!!density, 'encounter-density.json missing');
  req(density.targetEncountersPerRealMinute === 0.35, 'density targetEncountersPerRealMinute must be 0.35');
  req(density.targetEncountersPerTravelDay === 0.44, 'density targetEncountersPerTravelDay must be 0.44');
  req(density.minQuietWeightShare >= 0.35, 'density minQuietWeightShare ≥ 0.35');
  req(density.cooldownTravelDays >= 1, 'density cooldownTravelDays ≥ 1');
  req(density.realMinutesPerTravelDay > 0, 'density realMinutesPerTravelDay');
  for (const [biome, mul] of Object.entries(density.biomeWeightMul || {})) {
    req(biomes.has(biome), `density biomeWeightMul unknown biome ${biome}`);
    req(typeof mul === 'number' && mul > 0, `density biome mul ${biome}`);
  }

  const minQuiet = density.minQuietWeightShare;
  for (const table of encTables) {
    const total = (table.entries || []).reduce((a, e) => a + Math.max(0, e.weight || 0), 0);
    req(total > 0, `encounter table ${table.id} empty`);
    const quiet = (table.entries || [])
      .filter((e) => e.quiet || (e.tags || []).includes('quiet'))
      .reduce((a, e) => a + Math.max(0, e.weight || 0), 0);
    const share = quiet / total;
    req(share + 1e-9 >= minQuiet, `encounter table ${table.id} quietShare ${share.toFixed(3)} < ${minQuiet}`);
  }

  const workers = data['facility-workers.json'];
  req(!!workers, 'facility-workers.json missing');
  const kinds = workers.byKind || [];
  req(kinds.length >= 3, 'facility-workers need ≥3 kinds');
  for (const block of kinds) {
    req(!!block.facilityKind, 'facility-workers block missing facilityKind');
    // farm may be ahead of facilities.json — allow or require known kinds except farm
    if (block.facilityKind !== 'farm') {
      req(
        facilityKinds.has(block.facilityKind),
        `facility-workers kind ${block.facilityKind} not in facilities.json`,
      );
    }
    req(Array.isArray(block.workers) && block.workers.length >= 1, `workers for ${block.facilityKind}`);
    for (const w of block.workers) {
      req(!!w.id && !!w.role, `worker missing id/role in ${block.facilityKind}`);
      req(typeof w.shiftHours === 'number', `worker ${w.id} shiftHours`);
      req(MEANING.has(w.meaningTag), `worker ${w.id} meaningTag`);
    }
  }

  const cav = data['caravan-schedules.json'];
  req(!!cav, 'caravan-schedules.json missing');
  const schedules = cav.schedules || [];
  req(schedules.length >= 3, 'caravan-schedules need ≥3');
  const cavIds = new Set();
  for (const s of schedules) {
    req(!!s.id && !cavIds.has(s.id), `caravan dup/missing ${s?.id}`);
    cavIds.add(s.id);
    req(routeIds.has(s.routeId), `caravan ${s.id} route ${s.routeId}`);
    req(ecoRes.has(s.cargoResourceId), `caravan ${s.id} cargo ${s.cargoResourceId}`);
    req(typeof s.periodDays === 'number' && s.periodDays >= 1, `caravan ${s.id} periodDays`);
    req(typeof s.qty === 'number' && s.qty >= 1, `caravan ${s.id} qty`);
    req(LEANS.has(s.lean) || s.lean === 'mixed', `caravan ${s.id} lean`);
    req(s.maxConcurrent === undefined || (Number.isInteger(s.maxConcurrent) && s.maxConcurrent >= 1), `caravan ${s.id} maxConcurrent`);
  }
}
