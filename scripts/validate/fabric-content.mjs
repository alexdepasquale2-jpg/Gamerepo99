const AXES = new Set([
  'spark_low', 'spark_high', 'trust_low', 'trust_high',
  'mark_grief', 'mark_shame', 'mark_dependence', 'mark_hollowness', 'mark_resentment',
  'doctrine_follower', 'doctrine_skeptic', 'notoriety_high', 'kin_strain',
]);

function evalFixture(rule, fixture) {
  const id = rule.id;
  if (id === 'rule_no_cheerful_grief') {
    const wound = fixture.person?.woundId;
    const tags = fixture.lineTags || [];
    const bad = wound === 'grief' && tags.some((t) => t === 'mood:cheerful' || t === 'mood:chipper');
    return !bad;
  }
  if (id === 'rule_no_doctrine_rise_after_expose') {
    const exposed = (fixture.events || []).includes('doctrine.exposed');
    const st = fixture.stats?.['doctrine.followerCount'];
    if (!exposed || !st) return true;
    return !(st.after > st.before);
  }
  if (id === 'rule_no_dead_speak') {
    const dead = (fixture.person?.flags || []).includes('dead') || fixture.person?.alive === false;
    const act = fixture.action === 'speak_or_meet' || fixture.action === 'speak';
    return !(dead && act);
  }
  if (id === 'rule_no_contradict_memory') {
    const mem = fixture.memory || [];
    const tags = fixture.lineTags || [];
    if (mem.includes('mark:hollowness') && tags.includes('mood:naive_hope')) return false;
    if (mem.includes('mark:dependence') && tags.includes('mood:chipper')) return false;
    return true;
  }
  if (id === 'rule_voice_vector_bounds') {
    const v = fixture.vector;
    if (!v) return true; // rule only applies when a vector is present
    for (const k of ['warmth', 'bite', 'piety', 'secrecy', 'weariness']) {
      const n = v[k];
      if (typeof n !== 'number' || n < 0 || n > 1) return false;
    }
    return true;
  }
  if (id === 'rule_no_shamed_child_calls_kind') {
    const child = (fixture.person?.tags || []).includes('child');
    const shamed = (fixture.events || []).includes('shame_resolved');
    const kind = (fixture.lineTags || []).includes('mood:calls_protagonist_kind');
    return !(child && shamed && kind);
  }
  if (id === 'rule_no_trust_after_betrayal') {
    const day = fixture.day;
    const trust = fixture.trust;
    const events = fixture.events || [];
    const betrayal = events.find((e) => (typeof e === 'object' ? e.id === 'betrayal' : e === 'betrayal'));
    if (!betrayal || typeof trust !== 'number') return true;
    const bday = typeof betrayal === 'object' ? betrayal.day : day;
    if (day - bday <= 1 && trust > 0.7) return false;
    return true;
  }
  if (id === 'rule_history_order') {
    const applied = fixture.historyApplied || [];
    const tags = new Set(fixture.historyTags || []);
    // miracle yeast requires mill_fire tag or prior loss beat
    if (applied.includes('hb_miracle_yeast') && !tags.has('mill_fire') && !applied.includes('hb_loss_mill_fire')) {
      return false;
    }
    return true;
  }
  return true;
}

export function validateFabricContent(data, ctx) {
  const { req, people, methods } = ctx;
  const frags = data['line-fragments.json']?.fragments || [];
  const anchors = data['voice-anchors.json']?.anchors || [];
  const history = data['history-tables.json'];
  const assertions = data['assertions.json'];

  req(frags.length >= 200, `line-fragments too thin for Fabric B/C (have ${frags.length})`);
  req(anchors.length >= 12, 'voice-anchors need authored people + generics');
  req(!!history?.historyBeats && history.historyBeats.length >= 15, 'history beats library too thin');
  req(!!assertions?.cases && assertions.cases.length >= 12, 'assertions need ≥12 cases');

  const methodIds = [...methods];
  const perPerson = {};
  const perAxis = {};
  for (const f of frags) {
    const tags = f.tags || [];
    const personTag = tags.find((t) => String(t).startsWith('person:'));
    if (personTag) {
      const pid = String(personTag).slice(7);
      perPerson[pid] = (perPerson[pid] || 0) + 1;
    }
    for (const t of tags) {
      if (String(t).startsWith('axis:')) {
        const axis = String(t).slice(5);
        perAxis[axis] = (perAxis[axis] || 0) + 1;
        if (!AXES.has(axis) && !['lonely', 'mark_fear', 'mark_exhaustion'].includes(axis)) {
          // allow lonely as mood axis alias but warn via req soft — still count
        }
      }
    }
    req(['alone', 'opener', 'middle', 'closer'].includes(f.slot), `fragment ${f.id} bad slot`);
    req(typeof f.text === 'string' && f.text.trim().length > 0, `fragment ${f.id} empty text`);
  }

  for (const pid of people) {
    req((perPerson[pid] || 0) >= 20, `person ${pid} needs richer fragment set (≥20), have ${perPerson[pid] || 0}`);
    for (const mid of methodIds) {
      const hasAlone = frags.some(
        (f) =>
          f.slot === 'alone' &&
          (f.tags || []).includes(`person:${pid}`) &&
          (f.tags || []).includes(`method:${mid}`),
      );
      req(hasAlone, `missing alone fragment ${pid} ${mid}`);
      for (const slot of ['opener', 'middle', 'closer']) {
        const has = frags.some(
          (f) =>
            f.slot === slot &&
            (f.tags || []).includes(`person:${pid}`) &&
            (f.tags || []).includes(`method:${mid}`),
        );
        req(has, `missing ${slot} fragment ${pid} ${mid}`);
      }
    }
  }

  for (const axis of AXES) {
    req((perAxis[axis] || 0) >= 5, `axis ${axis} under-covered (${perAxis[axis] || 0})`);
  }

  // authored anchors have vectors in bounds
  for (const a of anchors) {
    if (!a.vector) continue;
    for (const k of ['warmth', 'bite', 'piety', 'secrecy', 'weariness']) {
      const n = a.vector[k];
      req(typeof n === 'number' && n >= 0 && n <= 1, `anchor ${a.id} vector.${k} out of bounds`);
    }
  }

  // history chain fields
  const beatIds = new Set((history.historyBeats || []).map((b) => b.id));
  for (const b of history.historyBeats || []) {
    req(!!b.kind && !!b.summary, `history beat ${b.id} needs kind+summary`);
    for (const c of b.chainsFrom || []) req(beatIds.has(c), `beat ${b.id} chainsFrom unknown ${c}`);
  }

  // assertion fixtures
  const rulesById = Object.fromEntries((assertions.rules || []).map((r) => [r.id, r]));
  let failCases = 0;
  let passCases = 0;
  for (const c of assertions.cases || []) {
    req(typeof c.expectPass === 'boolean', `assertion case ${c.id} needs expectPass`);
    req(c.fixture && typeof c.fixture === 'object', `assertion case ${c.id} needs fixture`);
    if (c.expectPass) passCases += 1;
    else {
      failCases += 1;
      req(!!c.violatesRuleId && rulesById[c.violatesRuleId], `fail case ${c.id} needs valid violatesRuleId`);
      const rule = rulesById[c.violatesRuleId];
      const ok = evalFixture(rule, c.fixture);
      req(ok === false, `fail fixture ${c.id} did not violate ${c.violatesRuleId}`);
    }
    if (c.expectPass && c.violatesRuleId) {
      const rule = rulesById[c.violatesRuleId];
      if (rule) {
        const ok = evalFixture(rule, c.fixture);
        req(ok === true, `pass fixture ${c.id} unexpectedly violates ${c.violatesRuleId}`);
      }
    }
    if (c.expectPass && !c.violatesRuleId) {
      // run all rules — all should pass
      for (const rule of assertions.rules || []) {
        const ok = evalFixture(rule, c.fixture);
        req(ok === true, `pass fixture ${c.id} violates ${rule.id}`);
      }
    }
  }
  req(failCases >= 8, `need ≥8 failing assertion fixtures (have ${failCases})`);
  req(passCases >= 8, `need ≥8 passing assertion fixtures (have ${passCases})`);

  console.log(
    `FABRIC_CONTENT fragments=${frags.length} anchors=${anchors.length} beats=${(history.historyBeats || []).length} assertionCases=${(assertions.cases || []).length} (fail=${failCases} pass=${passCases})`,
  );
  console.log(
    'FABRIC_CONTENT perPerson=' +
      Object.entries(perPerson)
        .map(([k, v]) => `${k}:${v}`)
        .join(','),
  );
  console.log(
    'FABRIC_CONTENT perAxis=' +
      Object.entries(perAxis)
        .map(([k, v]) => `${k}:${v}`)
        .join(','),
  );
}
