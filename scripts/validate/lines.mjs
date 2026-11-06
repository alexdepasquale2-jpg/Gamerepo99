export function validateLines(data, ctx) {
  const { req, people, methods, marks } = ctx;
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
      req(Array.isArray(arr) && arr.length > 0 && arr.every((s) => typeof s === 'string' && s.trim()), `lines.json ${a.id} needs refusal lines for hook ${hid}`);
    }
  }
}
