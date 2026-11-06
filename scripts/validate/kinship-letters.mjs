export function validateKinshipLetters(data, ctx) {
  const { req, people, links } = ctx;
  const kinEdges = data['kinship.json']?.edges || [];
  req(kinEdges.length >= 6, 'kinship.json needs authored edges (>=6)');
  for (const e of kinEdges) {
    req(people.has(e.fromPersonId), `kinship ${e.id}: fromPerson missing`);
    req(people.has(e.toPersonId), `kinship ${e.id}: toPerson missing`);
    for (const lid of e.townPath || []) req(links.has(lid), `kinship ${e.id}: link ${lid} missing`);
    req(typeof e.weight === 'number' && e.weight > 0 && e.weight <= 1, `kinship ${e.id}: weight`);
  }
  const letterTpls = data['letters.json']?.templates || [];
  req(letterTpls.length >= 5, 'letters.json needs >=5 templates');
  const packetTypes = new Set(letterTpls.map((x) => x.packetType));
  req(packetTypes.has('proof_packet') && packetTypes.has('relapse_pressure'), 'letters need proof_packet and relapse_pressure templates');
  const cross = kinEdges.filter((e) => e.crossGap);
  req(cross.length >= 1, 'need >=1 crossGap kinship edge for lore systems');
}
