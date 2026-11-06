/** Blessings and Burdens (06): unspoken classes, come-to-pass outcomes, tuning caps. */

const KINDS = new Set([
  'favor',
  'promise',
  'stand',
  'gift',
  'work',
  'betrayal',
  'shame',
  'introduce',
  'reignite',
]);
const LEANINGS = new Set(['blessing', 'burden', 'mixed']);
const CARRIERS = new Set(['kin', 'trade', 'friendship', 'influential', 'same_town']);
const OUTCOME_KINDS = new Set(['blessing', 'burden']);

function in01(n) {
  return typeof n === 'number' && n >= 0 && n <= 1;
}

export function validateUnspoken(data, ctx) {
  const { req, ids, marks } = ctx;
  const classesFile = data['unspoken-classes.json'];
  const outcomesFile = data['come-to-pass-outcomes.json'];
  const tuningFile = data['blessings-burdens-tuning.json'];
  req(!!classesFile, 'unspoken-classes.json missing');
  req(!!outcomesFile, 'come-to-pass-outcomes.json missing');
  req(!!tuningFile, 'blessings-burdens-tuning.json missing');
  if (!classesFile || !outcomesFile || !tuningFile) return;

  const classes = classesFile.classes || [];
  const outcomes = outcomesFile.outcomes || [];
  const interactionIds = ids(data['interactions.json']?.interactions);
  const fragmentIds = ids(data['line-fragments.json']?.fragments);
  const markIds = marks || ids(data['marks.json']?.marks);
  const circumstance = new Set(tuningFile.circumstanceTags || []);

  req(classes.length >= 12, `unspoken classes need ≥12 got ${classes.length}`);
  req(classes.length <= 40, `unspoken classes too many (${classes.length})`);

  const classIds = new Set();
  let blessingLean = 0;
  let burdenLean = 0;
  for (const c of classes) {
    req(typeof c.id === 'string' && c.id.startsWith('unspoken_'), `class id must be unspoken_*: ${c.id}`);
    req(!classIds.has(c.id), `DUP unspoken class ${c.id}`);
    classIds.add(c.id);
    req(KINDS.has(c.kind), `class ${c.id}: bad kind ${c.kind}`);
    req(LEANINGS.has(c.leaning), `class ${c.id}: bad leaning ${c.leaning}`);
    if (c.leaning === 'blessing') blessingLean++;
    if (c.leaning === 'burden') burdenLean++;

    req(in01(c.baseWeight) && c.baseWeight > 0, `class ${c.id}: baseWeight`);
    req(
      typeof c.halfLifeDays === 'number' && c.halfLifeDays >= 1 && c.halfLifeDays <= 30,
      `class ${c.id}: halfLifeDays 1..30`,
    );

    const enc = c.encodeFrom || {};
    const hasIds = Array.isArray(enc.interactionIds) && enc.interactionIds.length > 0;
    const hasTags = Array.isArray(enc.tagsAny) && enc.tagsAny.length > 0;
    const hasReignite = enc.requireReignite === true;
    req(hasIds || hasTags || hasReignite, `class ${c.id}: encodeFrom needs interactionIds, tagsAny, or requireReignite`);
    for (const iid of enc.interactionIds || []) {
      req(interactionIds.has(iid), `class ${c.id}: unknown interactionId ${iid}`);
    }

    const ctp = c.comeToPass || {};
    req(in01(ctp.minWeight), `class ${c.id}: comeToPass.minWeight`);
    req(in01(ctp.baseP) && ctp.baseP >= 0.02 && ctp.baseP <= 0.85, `class ${c.id}: comeToPass.baseP`);
    req(
      Array.isArray(ctp.blessingOutcomeIds) && ctp.blessingOutcomeIds.length >= 1,
      `class ${c.id}: blessingOutcomeIds`,
    );
    req(
      Array.isArray(ctp.burdenOutcomeIds) && ctp.burdenOutcomeIds.length >= 1,
      `class ${c.id}: burdenOutcomeIds`,
    );
    if (ctp.mixedBias !== undefined) {
      req(typeof ctp.mixedBias === 'number' && Math.abs(ctp.mixedBias) <= 0.5, `class ${c.id}: mixedBias`);
    }
    for (const t of ctp.requireTagsAny || []) {
      req(circumstance.has(t), `class ${c.id}: unknown circumstance tag ${t}`);
    }

    const dep = c.deposit || {};
    req(typeof dep.onSourcePerson === 'number' && dep.onSourcePerson >= 0, `class ${c.id}: deposit.onSourcePerson`);
    req(typeof dep.onPathEdges === 'number' && dep.onPathEdges >= 0, `class ${c.id}: deposit.onPathEdges`);
    if (dep.onPlaceTown !== undefined) {
      req(typeof dep.onPlaceTown === 'number' && dep.onPlaceTown >= 0, `class ${c.id}: deposit.onPlaceTown`);
    }
  }
  req(blessingLean >= 4, `need ≥4 blessing-leaning classes got ${blessingLean}`);
  req(burdenLean >= 4, `need ≥4 burden-leaning classes got ${burdenLean}`);

  const outcomeIds = new Set();
  let blessCount = 0;
  let burdenCount = 0;
  for (const o of outcomes) {
    req(typeof o.id === 'string' && o.id.length > 0, 'outcome id required');
    req(!outcomeIds.has(o.id), `DUP come-to-pass outcome ${o.id}`);
    outcomeIds.add(o.id);
    req(OUTCOME_KINDS.has(o.kind), `outcome ${o.id}: kind must be blessing|burden`);
    if (o.kind === 'blessing') blessCount++;
    else burdenCount++;
    req(CARRIERS.has(o.carrierPrefer), `outcome ${o.id}: carrierPrefer ${o.carrierPrefer}`);
    req(Array.isArray(o.fragmentIds) && o.fragmentIds.length >= 1, `outcome ${o.id}: fragmentIds`);
    for (const fid of o.fragmentIds) {
      req(fragmentIds.has(fid), `outcome ${o.id}: unknown fragment ${fid}`);
    }
    const fx = o.effects || {};
    if (fx.despair !== undefined) {
      req(typeof fx.despair === 'number' && Math.abs(fx.despair) <= 0.02, `outcome ${o.id}: despair |Δ| ≤ 0.02`);
    }
    if (fx.flame01 !== undefined) req(typeof fx.flame01 === 'number', `outcome ${o.id}: flame01`);
    if (fx.trust !== undefined) req(typeof fx.trust === 'number', `outcome ${o.id}: trust`);
    if (fx.edgeWeightDelta !== undefined) {
      req(typeof fx.edgeWeightDelta === 'number', `outcome ${o.id}: edgeWeightDelta`);
    }
    if (fx.letterOrRumor !== undefined) {
      req(fx.letterOrRumor === 'letter' || fx.letterOrRumor === 'rumor', `outcome ${o.id}: letterOrRumor`);
    }
    for (const m of fx.marksAdd || []) {
      req(markIds.has(m.markId), `outcome ${o.id}: unknown mark ${m.markId}`);
    }
    // Sign sanity: blessings shouldn't add resentment; burdens shouldn't add genuine_growth
    if (o.kind === 'blessing') {
      for (const m of fx.marksAdd || []) {
        req(m.markId !== 'resentment', `blessing ${o.id}: must not add resentment`);
      }
      if (fx.despair !== undefined) req(fx.despair <= 0, `blessing ${o.id}: despair should not rise`);
    }
    if (o.kind === 'burden') {
      for (const m of fx.marksAdd || []) {
        req(m.markId !== 'genuine_growth', `burden ${o.id}: must not add genuine_growth`);
      }
      if (fx.despair !== undefined) req(fx.despair >= 0, `burden ${o.id}: despair should not fall`);
    }
  }
  req(blessCount >= 5, `need ≥5 blessing outcomes got ${blessCount}`);
  req(burdenCount >= 5, `need ≥5 burden outcomes got ${burdenCount}`);

  for (const c of classes) {
    for (const oid of c.comeToPass.blessingOutcomeIds || []) {
      req(outcomeIds.has(oid), `class ${c.id}: unknown blessing outcome ${oid}`);
      const o = outcomes.find((x) => x.id === oid);
      if (o) req(o.kind === 'blessing', `class ${c.id}: ${oid} must be kind blessing`);
    }
    for (const oid of c.comeToPass.burdenOutcomeIds || []) {
      req(outcomeIds.has(oid), `class ${c.id}: unknown burden outcome ${oid}`);
      const o = outcomes.find((x) => x.id === oid);
      if (o) req(o.kind === 'burden', `class ${c.id}: ${oid} must be kind burden`);
    }
  }

  // Tuning caps (authored BlessingsBurdensTuning bounds)
  const caps = tuningFile.caps || {};
  req(caps.pBiasMax === 0.15, `tuning.caps.pBiasMax must be 0.15 got ${caps.pBiasMax}`);
  req(caps.blessingBiasMax === 0.1, `tuning.caps.blessingBiasMax must be 0.10 got ${caps.blessingBiasMax}`);
  req(caps.pBiasPerSample === 0.02, 'tuning.caps.pBiasPerSample must be 0.02');
  req(caps.blessingBiasPerWitness === 0.02, 'tuning.caps.blessingBiasPerWitness must be 0.02');
  const rt = tuningFile.runtime || {};
  req(rt.epsilon === 0.02, 'tuning.runtime.epsilon must be 0.02');
  req(rt.maxActivePerSource === 5, 'tuning.runtime.maxActivePerSource must be 5');
  req(rt.falloffDefault === 0.55, 'tuning.runtime.falloffDefault must match social-propagation 0.55');
  req(rt.maxDepositHops === 3, 'tuning.runtime.maxDepositHops must be 3');
  req(
    Array.isArray(rt.comeToPassPClamp) && rt.comeToPassPClamp[0] === 0.02 && rt.comeToPassPClamp[1] === 0.85,
    'tuning.runtime.comeToPassPClamp',
  );
  req(
    Array.isArray(rt.blessingPClamp) && rt.blessingPClamp[0] === 0.15 && rt.blessingPClamp[1] === 0.85,
    'tuning.runtime.blessingPClamp',
  );
  req(circumstance.size >= 4, 'tuning.circumstanceTags need ≥4');
  for (const iid of tuningFile.comeToPassAlsoOnInteractionIds || []) {
    req(interactionIds.has(iid), `tuning comeToPassAlsoOnInteractionIds unknown ${iid}`);
  }
}
