export function validateLinksEventsProofs(data, ctx) {
  const { req, people, towns, archetypes, wounds, marks, methods, events, proofs, links } = ctx;
  for (const pr of data['proofs.json']?.proofs || []) {
    if (pr.sourcePersonId) req(people.has(pr.sourcePersonId), `proof ${pr.id} person`);
    if (pr.sourceArchetypeId) req(archetypes.has(pr.sourceArchetypeId), `proof ${pr.id} archetype`);
    req(pr.sourcePersonId || pr.sourceArchetypeId || pr.sourceProtagonistId, `proof ${pr.id} needs source`);
    for (const w of pr.affinityWounds || []) req(wounds.has(w), `proof ${pr.id} wound`);
  }
  for (const L of data['links.json']?.links || []) {
    req(towns.has(L.fromTownId) && towns.has(L.toTownId), `link ${L.id} towns`);
    if (L.requiresPersonBurning) req(people.has(L.requiresPersonBurning), `link ${L.id} person`);
    if (L.earlyUnlock?.eventId) req(events.has(L.earlyUnlock.eventId), `link ${L.id} event`);
    if (L.id === 'den_lowmere_fear_road') {
      req(L.earlyUnlock?.status === 'decided' && L.earlyUnlock?.costly === true, 'fear-road must stay decided costly');
    }
  }
  const tuning = data['events.json']?.tuning;
  if (tuning) {
    for (const k of ['minDay', 'chancePerDawn', 'minGapDays', 'maxActive', 'biasWeight', 'playerTownWeight', 'relapseFlamePerDawn']) {
      if (tuning[k] !== undefined) req(typeof tuning[k] === 'number' && tuning[k] >= 0, `events tuning ${k} must be a number >= 0`);
    }
    if (typeof tuning.chancePerDawn === 'number') req(tuning.chancePerDawn <= 1, 'events tuning chancePerDawn must be <= 1');
  }
  for (const ev of data['events.json']?.events || []) {
    for (const k of ['say', 'news', 'newsHere']) if (ev[k] !== undefined) req(typeof ev[k] === 'string' && ev[k].length > 0, `event ${ev.id} ${k} must be a line`);
    for (const tid of ev.townBias || []) req(towns.has(tid), `event ${ev.id} town ${tid}`);
    for (const fx of ev.effects || []) {
      if (fx.markId) req(marks.has(fx.markId), `event mark`);
      if (fx.methodId) req(methods.has(fx.methodId), `event method`);
    }
  }
}
