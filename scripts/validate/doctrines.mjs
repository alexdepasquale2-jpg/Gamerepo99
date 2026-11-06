export function validateDoctrines(data, ctx) {
  const { req, towns, people, methods, hooks, doctrineIds: _ } = ctx;
  const doctrines = data['doctrines.json']?.doctrines || [];
  const doctrineIds = new Set(doctrines.map((d) => d.id));
  req(doctrineIds.has('doctrine_mill_bread'), 'Ashford optional doctrine_mill_bread required');
  const mill = doctrines.find((d) => d.id === 'doctrine_mill_bread');
  req(mill?.m2Optional === true, 'doctrine_mill_bread must be m2Optional');
  req(mill?.townId === 'ashford', 'mill doctrine town ashford');
  for (const d of doctrines) {
    req(towns.has(d.townId), `doctrine ${d.id}: town missing`);
    if (d.leaderPersonId) req(people.has(d.leaderPersonId), `doctrine ${d.id}: leader missing`);
    req(Array.isArray(d.goals) && d.goals.length >= 1, `doctrine ${d.id}: goals`);
    const s = d.start || {};
    for (const k of ['realDelivery', 'perceivedDelivery', 'propaganda', 'control', 'exposure', 'legitimacy']) {
      req(typeof s[k] === 'number', `doctrine ${d.id}: start.${k}`);
    }
  }
  const acts = data['doctrines.json']?.acts || [];
  req(acts.length >= 3, 'doctrine acts need expose/carry/voice');
  for (const a of acts) {
    for (const mid of a.methodIds || []) req(methods.has(mid), `doctrine act ${a.id}: method ${mid}`);
  }
  const ash = (data['towns.json']?.towns || []).find((x) => x.id === 'ashford');
  if (ash?.doctrineId) req(doctrineIds.has(ash.doctrineId), 'ashford.doctrineId unknown');
  if (hooks) req(hooks.has('cost_town_despair'), 'cost_town_despair hook required');
  return { doctrineIds };
}
