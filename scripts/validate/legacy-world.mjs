export function validateLegacyWorld(data, ctx) {
  const { req, ids, hooks, methods } = ctx;
  const t = data['legacy-world.json'];
  req(!!t, 'legacy-world.json required');
  if (!t) return;
  req(t.format === 'hearthfall.world', 'legacy-world.format must be hearthfall.world');
  req(Array.isArray(t.contentPackIds) && t.contentPackIds.length >= 1, 'legacy-world.contentPackIds required');
  const archIds = ids(data['archetypes.json']?.archetypes);
  req(archIds.has(t.defaultImportArchetypeId), 'legacy-world.defaultImportArchetypeId unknown');
  for (const a of [...Object.values(t.heirArchetypeByWound || {}), ...(t.heirArchetypeFallbacks || [])]) {
    req(archIds.has(a), `legacy-world heir archetype unknown: ${a}`);
  }
  req((t.heirArchetypeFallbacks || []).length >= 1, 'legacy-world.heirArchetypeFallbacks needs >=1');
  const wounds = ids(data['wounds.json']?.wounds);
  for (const w of Object.keys(t.heirArchetypeByWound || {})) req(wounds.has(w), `legacy-world wound unknown: ${w}`);
  const events = new Set((data['archetypes.json']?.succession?.bondAccumulators || []).map((a) => a.event));
  for (const r of t.bondEventMap || []) {
    req(events.has(r.event), `legacy-world bond event not in succession.bondAccumulators: ${r.event}`);
    req(['reignited', 'flameUp'].includes(r.when), `legacy-world bond row bad when: ${r.when}`);
    for (const m of r.methodIds || []) req(methods.has(m), `legacy-world bond method unknown: ${m}`);
  }
  for (const [m, hs] of Object.entries(t.tendencyHooks?.byMethod || {})) {
    req(methods.has(m), `legacy-world tendency method unknown: ${m}`);
    for (const h of hs) req(hooks.has(h), `legacy-world tendency hook unknown: ${h}`);
  }
  for (const m of Object.keys(t.npcLod?.methodFlameDelta || {})) req(methods.has(m), `legacy-world npcLod method unknown: ${m}`);
  req(typeof t.npcLod?.actsPerDawn === 'number' && t.npcLod.actsPerDawn >= 0, 'legacy-world.npcLod.actsPerDawn number');
  req(typeof t.npcLod?.maxNpcs === 'number' && t.npcLod.maxNpcs >= 0, 'legacy-world.npcLod.maxNpcs number');
  for (const k of ['legendLines', 'graveLines', 'inspectLines']) {
    req(Array.isArray(t[k]) && t[k].length >= 1 && t[k].every((l) => l.includes('{legacyName}')), `legacy-world.${k} need {legacyName}`);
  }
  const arr = t.arrival;
  req(!!arr, 'legacy-world.arrival copy required (world file import screen)');
  if (arr) {
    for (const k of ['heard', 'countMany', 'verbOne', 'verbMany', 'somewhere', 'none', 'legend', 'who', 'lineage', 'ordinalMany', 'deeds', 'noDeeds', 'grave', 'rekindled', 'closeTo']) {
      req(typeof arr[k] === 'string' && arr[k].length > 0, `legacy-world.arrival.${k} string required`);
    }
    for (const k of ['counts', 'ordinals']) req(Array.isArray(arr[k]) && arr[k].length >= 1, `legacy-world.arrival.${k} needs >=1`);
    for (const m of Object.keys(arr.methodDeeds || {})) req(methods.has(m), `legacy-world.arrival.methodDeeds method unknown: ${m}`);
  }
  const copy = data['archetypes.json']?.succession?.ui;
  req(t.ui?.screenCopy === copy?.screenCopy && t.ui?.continue === copy?.buttons?.continue && t.ui?.quit === copy?.buttons?.quit, 'legacy-world.ui copy must match locked succession copy');
}
