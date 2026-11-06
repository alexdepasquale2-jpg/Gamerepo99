/** M4 Task A: dawn stock + despair LOD tables. */

export function validateEconomyLod(data, ctx) {
  const { req, ids, towns } = ctx;
  const lod = data['economy-lod.json'];
  const dawn = data['dawn-stock.json'];
  req(!!lod, 'economy-lod.json missing');
  req(!!dawn, 'dawn-stock.json missing');
  if (!lod || !dawn) return;

  const ecoRes = ids(data['economy-resources.json']?.resources);
  req(ecoRes.size > 0, 'economy-resources required for LOD');

  // --- despair LOD ---
  const d = lod.despair;
  req(!!d, 'economy-lod.despair missing');
  req(d.onStarve === 0.05, `despair.onStarve must be 0.05 got ${d.onStarve}`);
  req(d.onRouteBroken === 0.05, `despair.onRouteBroken must be 0.05 got ${d.onRouteBroken}`);
  req(d.maxAddPerDawn === 0.05, `despair.maxAddPerDawn must be 0.05 got ${d.maxAddPerDawn}`);
  req(d.starveWhenFoodBelow === 1, 'despair.starveWhenFoodBelow must be 1');
  req(d.foodResourceId === 'food_grain', 'despair.foodResourceId must be food_grain');
  req(ecoRes.has(d.foodResourceId), `unknown food resource ${d.foodResourceId}`);
  req(d.maxAddPerDawn <= 0.05, 'despair maxAddPerDawn must be ≤ 0.05');
  req(lod.optIn?.ashfordDefault === false, 'Ashford economyOptIn default must be false');
  req(lod.optIn?.whenFalse === 'noop', 'optIn.whenFalse must be noop');
  req(lod.tick === 'dawn', 'LOD tick must be dawn');
  req(lod.juice?.deliver === 'stock.deliver', 'juice.deliver');
  req(lod.juice?.starve === 'stock.starve', 'juice.starve');
  req(!!lod.flow?.formula, 'flow.formula required');

  // --- dawn stock ---
  req(dawn.foodResourceId === 'food_grain', 'dawn-stock.foodResourceId');
  req(ecoRes.has(dawn.foodResourceId), 'dawn-stock food resource');
  req(dawn.deliverJuice === 'stock.deliver', 'dawn-stock.deliverJuice');
  req(dawn.starveJuice === 'stock.starve', 'dawn-stock.starveJuice');
  const seeds = dawn.seedStockByTown || {};
  req(Object.keys(seeds).length >= 3, 'dawn-stock needs ≥3 town seeds (ashford/lowmere/city_reach)');
  for (const [tid, stock] of Object.entries(seeds)) {
    req(towns.has(tid), `dawn-stock seed unknown town ${tid}`);
    req(stock && typeof stock === 'object', `dawn-stock ${tid} stock object`);
    for (const [rid, qty] of Object.entries(stock || {})) {
      req(ecoRes.has(rid), `dawn-stock ${tid} unknown resource ${rid}`);
      req(typeof qty === 'number' && qty >= 0, `dawn-stock ${tid}.${rid} qty`);
    }
    req(
      typeof stock.food_grain === 'number',
      `dawn-stock ${tid} must seed food_grain`,
    );
  }
  req(!!seeds.ashford, 'dawn-stock must seed ashford');
  req(!!seeds.lowmere, 'dawn-stock must seed lowmere');
  req(!!seeds.city_reach, 'dawn-stock must seed city_reach');

  // Towns that declare stock must use known resources; Ashford opt-in false
  for (const t of data['towns.json']?.towns || []) {
    if (t.id === 'ashford') {
      req(t.economyOptIn === false, 'ashford.economyOptIn must be false');
    }
    if (t.stock) {
      for (const rid of Object.keys(t.stock)) {
        req(ecoRes.has(rid), `town ${t.id} stock unknown resource ${rid}`);
      }
    }
  }

  // Facilities + routes still present for Forge LOD
  req((data['facilities.json']?.facilities || []).length >= 1, 'facilities required for LOD produce');
  req((data['routes.json']?.routes || []).some((r) => r.receiveShare), 'routes need receiveShare for LOD flow');
}
