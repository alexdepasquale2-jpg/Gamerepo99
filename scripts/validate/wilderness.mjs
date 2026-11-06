export function validateWilderness(data, ctx) {
  const { req, ids, towns, links, people, hooks } = ctx;
  const biomes = ids(data['biomes.json']?.biomes);
  const ecoRes = ids(data['economy-resources.json']?.resources);
  const facilities = ids(data['facilities.json']?.facilities);
  const routeIds = ids(data['routes.json']?.routes);
  const encTables = new Set((data['road-encounters.json']?.tables || []).map((x) => x.id));
  for (const r of data['routes.json']?.routes || []) {
    req(towns.has(r.fromTownId) && towns.has(r.toTownId), `route ${r.id} towns`);
    if (r.linkId) req(links.has(r.linkId), `route ${r.id} link`);
    for (const b of r.biomeIds || []) req(biomes.has(b), `route ${r.id} biome ${b}`);
    for (const f of r.facilityIds || []) req(facilities.has(f), `route ${r.id} facility ${f}`);
    if (r.encounterTableId) req(encTables.has(r.encounterTableId), `route ${r.id} encounters`);
  }
  for (const f of data['facilities.json']?.facilities || []) {
    if (f.townId) req(towns.has(f.townId), `facility ${f.id} town`);
    if (f.routeId) req(routeIds.has(f.routeId), `facility ${f.id} route`);
    for (const o of [...(f.outputs || []), ...(f.inputs || [])]) req(ecoRes.has(o.resourceId), `facility ${f.id} resource`);
  }
  for (const tr of data['travel-trades.json']?.trades || []) {
    for (const rid of tr.routeIds || []) req(routeIds.has(rid), `trade ${tr.id} route`);
    if (tr.requiresPersonBurning) req(people.has(tr.requiresPersonBurning), `trade ${tr.id} person`);
  }
  req((data['travel-trades.json']?.trades || []).length >= 8, 'travel-trades need full cast');
  if (hooks) req(hooks.has('cost_road_labor'), 'cost_road_labor hook required');

  // Variety overnight: fauna / crops reference known biomes + resources when present
  for (const f of data['fauna.json']?.fauna || []) {
    for (const b of f.biomeIds || []) req(biomes.has(b), `fauna ${f.id} biome ${b}`);
  }
  for (const c of data['crops.json']?.crops || []) {
    for (const b of c.biomeIds || []) req(biomes.has(b), `crop ${c.id} biome ${b}`);
    if (c.resourceId) req(ecoRes.has(c.resourceId), `crop ${c.id} resource ${c.resourceId}`);
  }
}
