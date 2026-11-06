export function validateLines(data, ctx) {
  const { req, people, methods, marks } = ctx;
  const methodIds = [...methods];
  const markIds = [...marks];
  req(methodIds.length >= 5, 'expected at least 5 methods for line coverage');

  // people.json carries voice / wound / tell (no longer mirrored from lines.json)
  for (const person of data['people.json']?.people || []) {
    req(typeof person.voice === 'string' && person.voice.trim(), `people.json ${person.id}: voice required`);
    req(typeof person.woundLine === 'string' && person.woundLine.trim(), `people.json ${person.id}: woundLine required`);
    req(typeof person.tellGivenUp === 'string' && person.tellGivenUp.trim(), `people.json ${person.id}: tellGivenUp required`);
  }

  // Archetype refusal lines live on hooks (lineVoiceFrom: archetypeId)
  const hooks = data['hooks.json']?.hooks || [];
  const hookById = new Map(hooks.map((h) => [h.id, h]));
  for (const a of (data['archetypes.json']?.archetypes || []).filter((x) => x.m2Playable)) {
    for (const hid of a.refusalHookIds || []) {
      const hook = hookById.get(hid);
      req(!!hook, `archetype ${a.id} refusal hook ${hid} missing`);
      const bag = hook?.lines || {};
      const arr = bag[a.id] || bag.default;
      req(
        Array.isArray(arr) && arr.length > 0 && arr.every((s) => typeof s === 'string' && s.trim()),
        `hook ${hid} needs refusal lines for archetype ${a.id} (or default)`,
      );
    }
  }

  // Canonical dialogue = dialogue/fragments (virtual line-fragments.json)
  const frags = data['line-fragments.json']?.fragments || [];
  req(frags.length >= 1, 'line-fragments must be canonical dialogue source');
  req(
    data['line-fragments.json']?.canonical === true || data['line-fragments.json']?.replaces === 'lines.json',
    'line-fragments must be marked canonical (replaces lines.json)',
  );

  const aloneByKey = new Map(); // key -> [{id,text}]
  for (const f of frags) {
    if (f.slot !== 'alone') continue;
    const tags = f.tags || [];
    const personTag = tags.find((x) => String(x).startsWith('person:'));
    if (!personTag) continue;
    const pid = String(personTag).slice('person:'.length);
    const methodTag = tags.find((x) => String(x).startsWith('method:'));
    const markTag = tags.find((x) => String(x).startsWith('mark:'));
    if (methodTag) {
      const key = `method:${pid}:${String(methodTag).slice('method:'.length)}`;
      if (!aloneByKey.has(key)) aloneByKey.set(key, []);
      aloneByKey.get(key).push({ id: f.id, text: f.text });
    }
    if (markTag) {
      const key = `mark:${pid}:${String(markTag).slice('mark:'.length)}`;
      if (!aloneByKey.has(key)) aloneByKey.set(key, []);
      aloneByKey.get(key).push({ id: f.id, text: f.text });
    }
  }

  // Structural coverage: every authored person × method/mark has an alone fragment
  for (const pid of people) {
    for (const mid of methodIds) {
      req(
        (aloneByKey.get(`method:${pid}:${mid}`) || []).length > 0,
        `fragments missing alone method ${pid}.${mid}`,
      );
    }
    for (const mk of markIds) {
      req(
        (aloneByKey.get(`mark:${pid}:${mk}`) || []).length > 0,
        `fragments missing alone mark ${pid}.${mk}`,
      );
    }
  }

  // lines.json retired — fragments-only mode
  console.log('MIGRATION lines→fragments: lines.json absent — fragments-only mode');
}
