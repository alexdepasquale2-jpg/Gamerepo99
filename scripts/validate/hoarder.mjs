export function validateHoarder(data, ctx) {
  const { req, ids, towns, hooks } = ctx;
  const ecoRes = ids(data['economy-resources.json']?.resources);
  req(ecoRes.has('coin'), 'economy-resources must include coin (optional M2 meter)');
  req(typeof data['player.json']?.defaults?.coin === 'number', 'player.defaults.coin optional meter required (number)');

  const noto = data['notoriety.json'];
  req(!!noto?.attractors && noto.attractors.length >= 7, 'notoriety attractors need full cast (>=7)');
  req(!!noto?.hoardLegacy?.endingId, 'notoriety.hoardLegacy.endingId required');
  req(hooks.has('cost_notoriety_heat'), 'cost_notoriety_heat hook required');
  req(hooks.has('cost_stash_unguarded_decay'), 'cost_stash_unguarded_decay hook required');
  req(hooks.has('legacy_hoard_imprint'), 'legacy_hoard_imprint hook required');

  const stashSites = data['stash-sites.json']?.sites || [];
  req(stashSites.length >= 2, 'stash-sites need >=2');
  const siteIds = new Set(
    (data['towns.json']?.towns || []).flatMap((tn) => (tn.sites || []).map((x) => x.id))
  );
  for (const s of stashSites) {
    req(towns.has(s.townId), `stash ${s.id}: town missing`);
    if (s.siteId) req(siteIds.has(s.siteId), `stash ${s.id}: site missing`);
  }

  const stashActs = data['stash-sites.json']?.acts || [];
  for (const id of ['stash_hide', 'stash_guard_hire', 'stash_withdraw']) {
    req(stashActs.some((a) => a.id === id), `stash-sites act ${id} missing`);
  }
  req(typeof stashActs.find((a) => a.id === 'stash_hide')?.amount === 'number', 'stash_hide.amount number required');
  req(typeof stashActs.find((a) => a.id === 'stash_guard_hire')?.coinCost === 'number', 'stash_guard_hire.coinCost number required');
  req(typeof noto?.fade === 'number' && noto.fade >= 0 && noto.fade <= 1, 'notoriety.fade in [0,1]');
  req(typeof noto?.despair?.mul === 'number' && noto.despair.dampenAbove < noto.despair.collapseAbove, 'notoriety.despair dampenAbove<collapseAbove + mul');
  req(typeof noto?.attractorRollScale === 'number' && typeof noto?.roadWeightScale === 'number', 'notoriety roll/road scales required');
  req(Array.isArray(noto?.leverage?.tagsAny) && typeof noto.leverage.discount === 'number', 'notoriety.leverage required');
  req(typeof noto?.hoardLegacy?.peakCoinMin === 'number', 'notoriety.hoardLegacy.peakCoinMin required');
  const attractorIds = new Set((noto?.attractors || []).map((a) => a.id));
  for (const t of data['road-encounters.json']?.tables || []) {
    for (const e of t.entries || []) {
      if (e.attractorId) req(attractorIds.has(e.attractorId), `road entry ${e.id}: unknown attractor ${e.attractorId}`);
    }
  }
  const actIds = new Set(stashActs.map((a) => a.id));
  for (const it of data['interactions.json']?.interactions || []) {
    if (it.stashAct !== undefined) req(actIds.has(it.stashAct), `interaction ${it.id}: unknown stashAct ${it.stashAct}`);
    if (it.coinGain !== undefined) req(typeof it.coinGain === 'number' && it.coinGain > 0, `interaction ${it.id}: coinGain > 0`);
  }

  const patrons = data['patrons.json']?.patrons || [];
  req(patrons.length >= 1, 'patrons need >=1 polity');
  const doctrineIds = new Set((data['doctrines.json']?.doctrines || []).map((d) => d.id));
  for (const p of patrons) {
    req(doctrineIds.has(p.doctrineId), `patron ${p.id}: doctrine missing`);
    req(towns.has(p.homeTownId), `patron ${p.id}: homeTown missing`);
    req(Array.isArray(p.deals) && p.deals.length >= 1, `patron ${p.id}: deals`);
  }
}
