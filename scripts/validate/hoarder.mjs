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

  const patrons = data['patrons.json']?.patrons || [];
  req(patrons.length >= 1, 'patrons need >=1 polity');
  const doctrineIds = new Set((data['doctrines.json']?.doctrines || []).map((d) => d.id));
  for (const p of patrons) {
    req(doctrineIds.has(p.doctrineId), `patron ${p.id}: doctrine missing`);
    req(towns.has(p.homeTownId), `patron ${p.id}: homeTown missing`);
    req(Array.isArray(p.deals) && p.deals.length >= 1, `patron ${p.id}: deals`);
  }
}
