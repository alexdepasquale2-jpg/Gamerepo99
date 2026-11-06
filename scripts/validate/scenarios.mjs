export function validateScenarios(data, ctx) {
  const { req, ids, people, methods, marks, hooks, archetypes } = ctx;
  const scRoot = data['scenarios.json'];
  req(!!scRoot, 'scenarios.json missing');
  if (!scRoot) return;

  const scenarios = scRoot.scenarios || [];
  req(scenarios.length >= 6, 'scenarios need ≥6 (5 moments + first_10_minutes)');

  const kinds = scenarios.map((s) => s.kind);
  req(kinds.filter((k) => k === 'memorable_moment').length >= 5, 'need ≥5 memorable_moment scenarios');
  req(kinds.includes('first_10_minutes'), 'need first_10_minutes scenario');

  const m2 = new Set(
    (data['archetypes.json']?.archetypes || []).filter((a) => a.m2Playable).map((a) => a.id)
  );
  const markSet = marks;
  const methodSet = methods;
  const peopleSet = people;
  const hookSet = hooks;

  const seen = new Set();
  for (const sc of scenarios) {
    req(!!sc.id && !seen.has(sc.id), `scenario dup/missing id ${sc?.id}`);
    seen.add(sc.id);
    req(m2.has(sc.archetypeId), `scenario ${sc.id}: archetype ${sc.archetypeId} not m2Playable`);
    req(typeof sc.seed === 'number', `scenario ${sc.id}: seed number required`);
    req(Array.isArray(sc.steps) && sc.steps.length >= 1, `scenario ${sc.id}: steps`);
    req(sc.expect && typeof sc.expect === 'object', `scenario ${sc.id}: expect`);

    for (const step of sc.steps) {
      if (step.personId) req(peopleSet.has(step.personId), `scenario ${sc.id} step person ${step.personId}`);
      if (step.targetPersonId)
        req(peopleSet.has(step.targetPersonId), `scenario ${sc.id} step target ${step.targetPersonId}`);
      if (step.methodId) req(methodSet.has(step.methodId), `scenario ${sc.id} method ${step.methodId}`);
    }

    for (const ens of sc.setup?.ensure || []) {
      if (ens.personId) req(peopleSet.has(ens.personId), `scenario ${sc.id} ensure person ${ens.personId}`);
      for (const m of ens.marks || []) {
        if (typeof m === 'string') req(markSet.has(m), `scenario ${sc.id} ensure mark ${m}`);
      }
    }

    const pe = sc.expect?.people || {};
    for (const [pid, exp] of Object.entries(pe)) {
      req(peopleSet.has(pid), `scenario ${sc.id} expect person ${pid}`);
      if (exp.hasMark) req(markSet.has(exp.hasMark), `scenario ${sc.id} expect mark ${exp.hasMark}`);
      for (const m of exp.hasMarkAny || []) req(markSet.has(m), `scenario ${sc.id} expect markAny ${m}`);
    }

    if (sc.expect?.lines?.lastRefusalHookId) {
      req(hookSet.has(sc.expect.lines.lastRefusalHookId), `scenario ${sc.id} refusal hook`);
    }
    for (const hid of sc.expect?.hooksFiredAny || []) {
      req(hookSet.has(hid), `scenario ${sc.id} hook ${hid}`);
    }
    if (sc.expect?.menu?.stillContainsMethodId) {
      req(methodSet.has(sc.expect.menu.stillContainsMethodId), `scenario ${sc.id} menu method`);
    }
    for (const pid of sc.expect?.packets?.inboxNonEmptyForPersonAny || []) {
      req(peopleSet.has(pid), `scenario ${sc.id} packet person ${pid}`);
    }
  }

  // required moment ids from special bar
  for (const id of [
    'moment_warm_loaf_cold_hill',
    'moment_chalk_after_the_cut',
    'moment_nail_across_the_water',
    'moment_refusal_coal',
    'moment_mark_comes_back',
    'first_10_minutes_ashford_hook',
  ]) {
    req(seen.has(id), `required scenario missing: ${id}`);
  }
}
