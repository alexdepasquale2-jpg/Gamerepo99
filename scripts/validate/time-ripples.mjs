export function validateTimeRipples(data, ctx) {
  const { req, marks } = ctx;
  const ticksPerDay = data['time.json']?.ticksPerDay ?? 36;
  const covered = new Set();
  for (const ph of data['time.json']?.phases || []) {
    for (let t = ph.tickStart; t <= ph.tickEnd; t++) covered.add(t);
  }
  for (let t = 0; t < ticksPerDay; t++) req(covered.has(t), `tick ${t} uncovered`);
  for (const key of ['help', 'harm', 'cling']) {
    const b = data['ripples.json']?.[key];
    for (const mid of [...(b?.requireMarksAny || []), ...(b?.forbidMarksAny || [])]) {
      req(marks.has(mid), `ripples mark ${mid}`);
    }
  }
}
