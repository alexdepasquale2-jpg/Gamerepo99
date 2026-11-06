export function validateDynamism(data, ctx) {
  const { req, ids, people, methods } = ctx;
  const anchors = data['voice-anchors.json']?.anchors || [];
  const frags = data['line-fragments.json']?.fragments || [];
  const curves = data['reaction-curves.json']?.curves || [];
  const constraints = data['voice-constraints.json']?.constraints || [];

  req(anchors.length >= 1, 'voice-anchors need ≥1');
  req(frags.length >= 1, 'line-fragments need ≥1');
  req(curves.length >= 1, 'reaction-curves need ≥1');
  req(Array.isArray(constraints), 'voice-constraints.constraints array');

  const peopleSet = people;
  const methodSet = methods;
  for (const a of anchors) {
    if (a.personId) req(peopleSet.has(a.personId), `voice-anchor ${a.id}: person missing`);
    req(a.vector && typeof a.vector.warmth === 'number', `voice-anchor ${a.id}: vector.warmth`);
  }
  for (const f of frags) {
    req(typeof f.text === 'string' && f.text.trim(), `fragment ${f.id}: text`);
    req(['opener', 'middle', 'closer', 'alone'].includes(f.slot), `fragment ${f.id}: slot`);
    const methodTag = (f.tags || []).find((t) => t.startsWith('method:'));
    if (methodTag) {
      const mid = methodTag.slice('method:'.length);
      req(methodSet.has(mid), `fragment ${f.id}: unknown method ${mid}`);
    }
  }
  req(
    data['player.json']?.features?.bakedDynamismLines === false ||
      data['player.json']?.features?.bakedDynamismLines === true,
    'player.features.bakedDynamismLines must be boolean (default false)'
  );
  req(
    data['player.json']?.features?.bakedDynamismLines === false,
    'M2 default: player.features.bakedDynamismLines must be false (optional flag off)'
  );
}
