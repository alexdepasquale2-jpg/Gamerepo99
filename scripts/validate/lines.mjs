export function validateLines(data, ctx) {
  const { req, people, methods, marks } = ctx;
  // Canonical dialogue = line-fragments; lines.json may be deprecated mirror.
  const linesPeople = data['lines.json']?.people || {};
  const methodIds = [...methods];
  const markIds = [...marks];
  req(methodIds.length >= 5, 'expected at least 5 methods for line coverage');
  for (const pid of people) {
    const L = linesPeople[pid];
    req(!!L, `lines.json missing person ${pid}`);
    if (!L) continue;
    req(!!L.voice && !!L.woundLine && !!L.tellGivenUp, `lines.json ${pid}: need voice, woundLine, tellGivenUp`);
    for (const mid of methodIds) {
      req(typeof L.methods?.[mid] === 'string' && L.methods[mid].trim().length > 0, `lines.json ${pid}: missing method line for ${mid}`);
    }
    for (const mk of markIds) {
      req(typeof L.marks?.[mk] === 'string' && L.marks[mk].trim().length > 0, `lines.json ${pid}: missing mark line for ${mk}`);
    }
  }
  for (const pid of Object.keys(linesPeople)) {
    req(people.has(pid), `lines.json unknown person ${pid}`);
  }
  for (const person of data['people.json']?.people || []) {
    req(typeof person.voice === 'string' && person.voice.trim(), `people.json ${person.id}: voice required`);
    req(typeof person.woundLine === 'string' && person.woundLine.trim(), `people.json ${person.id}: woundLine required`);
    req(typeof person.tellGivenUp === 'string' && person.tellGivenUp.trim(), `people.json ${person.id}: tellGivenUp required`);
    const L = linesPeople[person.id];
    if (L) {
      req(person.voice === L.voice, `people.json ${person.id}: voice must match lines.json`);
      req(person.woundLine === L.woundLine, `people.json ${person.id}: woundLine must match lines.json`);
      req(person.tellGivenUp === L.tellGivenUp, `people.json ${person.id}: tellGivenUp must match lines.json`);
    }
  }
  const archRefusals = data['lines.json']?.archetypeRefusals || {};
  for (const a of (data['archetypes.json']?.archetypes || []).filter((x) => x.m2Playable)) {
    const block = archRefusals[a.id];
    req(!!block, `lines.json archetypeRefusals missing ${a.id}`);
    for (const hid of a.refusalHookIds || []) {
      const arr = block?.[hid];
      req(
        Array.isArray(arr) && arr.length > 0 && arr.every((s) => typeof s === 'string' && s.trim()),
        `lines.json ${a.id} needs refusal lines for hook ${hid}`,
      );
    }
  }

  // --- lines.json → line-fragments migration check (Niblet: nothing lost) ---
  const frags = data['line-fragments.json']?.fragments || [];
  req(frags.length >= 1, 'line-fragments.json must be canonical dialogue source');

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

  let migTotal = 0;
  let migCovered = 0; // keyed + verbatim text
  let migKeyedOnly = 0; // keyed but text differs
  const migMissing = [];
  for (const pid of Object.keys(linesPeople)) {
    const L = linesPeople[pid] || {};
    for (const [mid, text] of Object.entries(L.methods || {})) {
      migTotal += 1;
      const hits = aloneByKey.get(`method:${pid}:${mid}`) || [];
      if (!hits.length) {
        migMissing.push(`method ${pid}.${mid}`);
        req(false, `MIGRATION: no fragment for lines.json method ${pid}.${mid}`);
      } else if (hits.some((h) => h.text === text)) {
        migCovered += 1;
      } else {
        migKeyedOnly += 1;
        req(false, `MIGRATION: fragment for ${pid}.${mid} exists but text differs from lines.json`);
      }
    }
    for (const [mk, text] of Object.entries(L.marks || {})) {
      migTotal += 1;
      const hits = aloneByKey.get(`mark:${pid}:${mk}`) || [];
      if (!hits.length) {
        migMissing.push(`mark ${pid}.${mk}`);
        req(false, `MIGRATION: no fragment for lines.json mark ${pid}.${mk}`);
      } else if (hits.some((h) => h.text === text)) {
        migCovered += 1;
      } else {
        migKeyedOnly += 1;
        req(false, `MIGRATION: fragment for mark ${pid}.${mk} exists but text differs from lines.json`);
      }
    }
  }

  const migOk = migMissing.length === 0 && migKeyedOnly === 0 && migCovered === migTotal;
  console.log(
    `MIGRATION lines→fragments: ${migCovered}/${migTotal} covered verbatim` +
      (migKeyedOnly ? `; ${migKeyedOnly} keyed-but-text-mismatch` : '') +
      (migMissing.length ? `; MISSING ${migMissing.length}` : '') +
      (migOk ? ' — OK (safe for Forge to delete lines.json)' : ' — NOT SAFE TO DELETE'),
  );
  req(migOk, `lines.json→fragments migration incomplete: ${migCovered}/${migTotal} verbatim`);

  if (data['lines.json']?.deprecated) {
    req(
      data['line-fragments.json']?.canonical === true || data['line-fragments.json']?.replaces === 'lines.json',
      'deprecated lines.json requires canonical line-fragments',
    );
  }
}
