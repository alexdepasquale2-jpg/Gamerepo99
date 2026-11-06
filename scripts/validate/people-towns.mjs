export function validatePeopleTowns(data, ctx) {
  const { req, people, towns, wounds, proofs } = ctx;
  const siteIds = new Set();
  for (const t of data['towns.json']?.towns || []) {
    for (const s of t.sites || []) {
      req(!siteIds.has(s.id), `dup site ${s.id}`);
      siteIds.add(s.id);
      if (s.personId) {
        req(people.has(s.personId), `site ${s.id} person missing`);
        const person = data['people.json'].people.find((x) => x.id === s.personId);
        if (person) {
          req(person.siteId === s.id, `site/person mismatch ${s.id}`);
          req(person.townId === t.id, `site/person town mismatch ${s.id}`);
        }
      }
    }
  }
  for (const p of data['people.json']?.people || []) {
    req(towns.has(p.townId) && siteIds.has(p.siteId) && wounds.has(p.woundId), `people ${p.id} bad refs`);
    if (p.proofId) req(proofs.has(p.proofId), `people ${p.id} proof missing`);
  }
  for (const town of data['towns.json']?.towns || []) {
    if (town.playable === false || town.abstract) continue;
    req(typeof town.gapAxis === 'number', `town ${town.id}: gapAxis required`);
    req(typeof town.connection === 'number', `town ${town.id}: connection required`);
    req(typeof town.standing === 'number', `town ${town.id}: standing required`);
  }
  const civic = (data['people.json']?.people || []).filter((p) => (p.tags || []).includes('civic_voice'));
  req(civic.length >= 2, 'need >=2 civic_voice people for representation');
  return { siteIds };
}
