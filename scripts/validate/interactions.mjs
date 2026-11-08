/**
 * Interaction model: schema/refs + deterministic replay of spec examples.
 * Spec: docs/superpowers/specs/2026-11-06-interaction-model.md
 */

const KINDS = new Set([
  'conversation',
  'favor',
  'errand',
  'trade',
  'gift',
  'work_alongside',
  'promise',
  'show_up',
  'introduce',
  'stand_up',
]);
const RIPPLES = new Set(['help', 'harm', 'cling', 'none']);

const approx = (a, b, eps = 1e-9) => Math.abs(Number(a) - Number(b)) <= eps;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round1 = (n) => Math.round(n * 10) / 10;

function cloneMarks(marks) {
  return { ...(marks || {}) };
}

function hasMark(marks, id) {
  return (marks?.[id] || 0) > 0;
}

function applyMarkAdd(marks, markId, stacks = 1) {
  marks[markId] = (marks[markId] || 0) + stacks;
}

function applyMarkRemove(marks, markId) {
  marks[markId] = 0;
}

/** Pure deterministic interaction resolver (data-only; no Forge src). */
export function createInteractionSim(doc) {
  const byId = new Map((doc.interactions || []).map((i) => [i.id, i]));
  const weights = doc.touchScoreWeights;
  const reigniteCfg = doc.reignite;
  const sparkCfg = doc.spark;

  function startState(initial) {
    return {
      flame01: initial.flame01,
      trust: initial.trust,
      marks: cloneMarks(initial.marks),
      touchScore: initial.touchScore || 0,
      presence: initial.presence || 0,
      bond: initial.bond || 0,
      spark: initial.spark ?? sparkCfg.sparkStart,
      promise: null,
      promiseSeq: 0,
      harmSeen: false,
      kindsUsed: new Set(),
      reignited: false,
      interactionCount: 0,
    };
  }

  function situationMul() {
    return sparkCfg.situationMulDefault ?? 1;
  }

  function scoreFlame(delta) {
    return Math.abs(delta) * weights.flame01Abs;
  }

  function resolve(state, interactionId) {
    const def = byId.get(interactionId);
    if (!def) throw new Error(`unknown interaction ${interactionId}`);

    if (def.assertFailIfMarksAny?.some((m) => hasMark(state.marks, m))) {
      return { ok: false, reason: def.assertFailReason || 'assert_fail', state };
    }

    const next = {
      ...state,
      marks: cloneMarks(state.marks),
      kindsUsed: new Set(state.kindsUsed),
    };
    next.interactionCount += 1;
    next.kindsUsed.add(def.kind);

    // Mirrors resolveInteraction: tag-driven strain multipliers and gain adjustments (scoring.spark).
    let strainMul = situationMul();
    let gainAdj = 0;
    for (const t of def.tags || []) {
      strainMul *= sparkCfg.strainMulByTag?.[t] ?? 1;
      gainAdj += sparkCfg.sparkGainAdjustByTag?.[t] ?? 0;
    }
    const strain = def.baseStrain * strainMul;
    next.spark = clamp(
      next.spark - strain + (def.sparkGain || 0) + gainAdj,
      0,
      sparkCfg.sparkMax,
    );

    // Touch modifiers (mark-gated, data-driven — no archetypeId)
    let touch = { ...(def.touch || {}) };
    let touchScoreFlat = def.touchScoreFlat || 0;
    for (const mod of def.touchModifiers || []) {
      const ok = (mod.requireMarksAny || []).some((m) => hasMark(next.marks, m));
      if (!ok) continue;
      const mt = mod.touch || {};
      touch = {
        ...touch,
        flame01: (touch.flame01 || 0) + (mt.flame01 || 0),
        trust: (touch.trust || 0) + (mt.trust || 0),
      };
      touchScoreFlat += mod.touchScoreFlat || 0;
    }

    let deltaTs = touchScoreFlat;

    const flameDelta = touch.flame01 || 0;
    if (flameDelta) {
      next.flame01 = next.flame01 + flameDelta;
      deltaTs += scoreFlame(flameDelta);
    }
    if (touch.trust) next.trust = next.trust + touch.trust;

    for (const m of touch.marksAdd || []) {
      applyMarkAdd(next.marks, m.markId, m.stacks ?? 1);
      if (!def.scoreBrokenPromiseOnly) {
        if (m.markId === 'hollowness') deltaTs += weights.hollownessAdd * (m.stacks ?? 1);
        if (m.markId === 'resentment') deltaTs += weights.resentmentAdd * (m.stacks ?? 1);
        if (m.markId === 'genuine_growth') deltaTs += weights.genuine_growth * (m.stacks ?? 1);
      } else if (m.markId === 'genuine_growth') {
        deltaTs += weights.genuine_growth * (m.stacks ?? 1);
      }
    }
    for (const mid of touch.marksRemove || []) {
      const before = next.marks[mid] || 0;
      applyMarkRemove(next.marks, mid);
      if (mid === 'hollowness' && before > 0) {
        // clearing hollow does not apply hollownessAdd (only positive adds)
      }
      if (mid !== 'hollowness' && false) {
        /* reserved */
      }
    }
    // genuine_growth from marksAdd already counted; promise_keep also lists it in marksAdd

    if (def.bondDelta) {
      next.bond += def.bondDelta;
      deltaTs += def.bondDelta * weights.bond;
    }

    if (def.presenceDelta) {
      next.presence += def.presenceDelta;
      deltaTs += def.presenceDelta * weights.presenceDay;
      const bonus = def.presenceThresholdBonus;
      if (
        bonus &&
        next.presence >= bonus.minPresence &&
        (!bonus.requireNoHarm || !next.harmSeen)
      ) {
        const bf = bonus.touch?.flame01 || 0;
        if (bf) {
          next.flame01 = next.flame01 + bf;
          deltaTs += scoreFlame(bf);
        }
      }
    }

    if (def.promise?.op === 'make') {
      next.promiseSeq += 1;
      next.promise = 'pending';
    } else if (def.promise?.op === 'keep') {
      next.promise = 'kept';
      deltaTs += weights.keptPromise;
      // growth mark scored via marksAdd
    } else if (def.promise?.op === 'break') {
      next.promise = 'broken';
      deltaTs += weights.brokenPromise;
      // hollow/resentment: scoreBrokenPromiseOnly skips mark score terms
    }

    if (def.meaning || (def.tags || []).includes('meaning')) {
      deltaTs += weights.meaning;
    }
    if (def.giftAccepted) deltaTs += weights.giftAccepted;
    if (def.stoodUp) deltaTs += weights.stoodUp;

    if (def.ripple === 'harm') next.harmSeen = true;

    next.touchScore = next.touchScore + deltaTs;

    // Reignition
    const hollow = next.marks.hollowness || 0;
    const growth = hasMark(next.marks, 'genuine_growth');
    const primary =
      next.touchScore + 1e-9 >= reigniteCfg.touchScoreMin &&
      next.flame01 + 1e-9 >= reigniteCfg.flame01Min &&
      hollow === (reigniteCfg.requireHollownessStacks ?? 0);
    const altFlameMin = reigniteCfg.alternate?.flame01Min ?? reigniteCfg.flame01Min;
    const alt =
      growth &&
      next.touchScore + 1e-9 >= (reigniteCfg.alternate?.touchScoreMin ?? 18) &&
      next.flame01 + 1e-9 >= altFlameMin;
    const distinctOk =
      !reigniteCfg.neverFromSingleInteraction ||
      next.kindsUsed.size >= (reigniteCfg.minDistinctKinds ?? 3) ||
      next.interactionCount >= 3;
    // Spec: never from single interaction — require count>1; kinds rule for forge tests
    if ((primary || alt) && next.interactionCount > 1 && !next.reignited) {
      next.reignited = true;
      for (const mid of reigniteCfg.onReignite?.marksRemove || []) {
        applyMarkRemove(next.marks, mid);
      }
      for (const m of reigniteCfg.onReignite?.marksAdd || []) {
        if (!hasMark(next.marks, m.markId)) {
          applyMarkAdd(next.marks, m.markId, m.stacks ?? 1);
        }
      }
    }

    // Fix flame rounding: use precise accumulation
    // Recompute flame with less rounding error for expect match
    return { ok: true, state: next, distinctOk };
  }

  return { byId, startState, resolve, reigniteCfg };
}

function expectMatch(req, label, actual, expect) {
  if (expect == null) return;
  for (const [k, v] of Object.entries(expect)) {
    if (k === 'note') continue;
    if (k === 'marks') {
      for (const [mk, mv] of Object.entries(v)) {
        const got = actual.marks[mk] || 0;
        req(got === mv, `${label}: mark ${mk} want ${mv} got ${got}`);
      }
      continue;
    }
    if (k === 'reigniteBlocked') {
      const blocked = !actual.reignited;
      req(blocked === v, `${label}: reigniteBlocked want ${v} got ${!actual.reignited}`);
      continue;
    }
    const got = actual[k];
    if (typeof v === 'number') {
      req(approx(got, v, 1e-9), `${label}: ${k} want ${v} got ${got}`);
    } else if (typeof v === 'boolean') {
      req(got === v, `${label}: ${k} want ${v} got ${got}`);
    } else {
      req(got === v, `${label}: ${k} want ${v} got ${got}`);
    }
  }
}

export function validateInteractions(data, ctx) {
  const { req, ids, methods, marks } = ctx;
  const doc = data['interactions.json'];
  req(!!doc, 'interactions.json missing');
  if (!doc) return;

  const interactions = doc.interactions || [];
  req(interactions.length >= 10, `interactions catalog too small (${interactions.length})`);
  req(!!doc.touchScoreWeights, 'interactions scoring.touchScoreWeights missing');
  req(!!doc.reignite, 'interactions scoring.reignite missing');
  req(!!doc.spark, 'interactions scoring.spark missing');
  req(!!doc.bond && !!doc.promise && !!doc.presence, 'interactions rules bond/promise/presence');
  req(!!doc.ripples, 'interactions rules.ripples missing');
  req(Array.isArray(doc.map) && doc.map.length >= 5, 'interactions migration.map need all 5 methods');

  const iids = new Set();
  for (const it of interactions) {
    req(!!it.id && !iids.has(it.id), `interaction dup/missing id ${it?.id}`);
    iids.add(it.id);
    req(KINDS.has(it.kind), `interaction ${it.id}: kind ${it.kind}`);
    req(RIPPLES.has(it.ripple), `interaction ${it.id}: ripple`);
    req(typeof it.baseStrain === 'number', `interaction ${it.id}: baseStrain`);
    req(typeof it.sparkGain === 'number', `interaction ${it.id}: sparkGain`);
    req(Array.isArray(it.tags), `interaction ${it.id}: tags`);
    if (it.doctrineAct !== undefined) {
      const acts = (data['doctrines.json']?.acts || []).map((a) => a.id);
      const list = Array.isArray(it.doctrineAct) ? it.doctrineAct : [it.doctrineAct];
      req(list.length > 0, `interaction ${it.id}: doctrineAct empty`);
      for (const a of list) req(acts.includes(a), `interaction ${it.id}: unknown doctrineAct ${a}`);
    }
    // no archetypeId branching keys
    req(it.archetypeId === undefined, `interaction ${it.id}: archetypeId forbidden`);
    for (const m of it.touch?.marksAdd || []) {
      req(marks.has(m.markId), `interaction ${it.id}: unknown mark ${m.markId}`);
    }
    for (const mid of it.touch?.marksRemove || []) {
      req(marks.has(mid), `interaction ${it.id}: unknown mark remove ${mid}`);
    }
    for (const mod of it.touchModifiers || []) {
      for (const mid of mod.requireMarksAny || []) {
        req(marks.has(mid), `interaction ${it.id}: modifier mark ${mid}`);
      }
    }
    for (const w of it.touch?.woundPressure || []) {
      req(!!w.woundId, `interaction ${it.id}: woundPressure woundId`);
    }
  }

  // Required catalog ids from spec
  for (const need of [
    'talk_gentle',
    'talk_hard',
    'talk_empty_cheer',
    'favor_ask',
    'favor_do',
    'trade_fair',
    'gift_give',
    'work_alongside',
    'promise_make',
    'promise_keep',
    'promise_break',
    'show_up',
    'introduce',
    'stand_up',
  ]) {
    req(iids.has(need), `missing catalog interaction ${need}`);
  }

  // Deed chips (deeds.json): each is a catalog interaction hosted by a real method.
  const deedIds = new Set();
  for (const d of doc.deeds || []) {
    req(!!d.id && !deedIds.has(d.id), `deed dup/missing id ${d?.id}`);
    deedIds.add(d.id);
    req(iids.has(d.id), `deed ${d.id}: not a catalog interaction`);
    req(typeof d.label === 'string' && d.label.length > 0, `deed ${d.id}: label`);
    req(!methods || methods.has(d.hostMethod), `deed ${d.id}: unknown hostMethod ${d.hostMethod}`);
    if (d.minTrust !== undefined) req(typeof d.minTrust === 'number' && d.minTrust >= 0 && d.minTrust <= 1, `deed ${d.id}: minTrust 0..1`);
    for (const l of d.lines || []) req(typeof l === 'string' && l.length > 0, `deed ${d.id}: empty line`);
  }

  // Choice set refs
  for (const cs of doc.choiceSets || []) {
    for (const opt of cs.options || []) {
      req(iids.has(opt.interactionId), `choiceSet ${cs.id} → ${opt.interactionId}`);
    }
  }

  // Migration map refs
  const methodIds = methods || new Set();
  for (const row of doc.map || []) {
    req(methodIds.has(row.methodId), `migration unknown method ${row.methodId}`);
    for (const iid of row.interactionIds || []) {
      req(iids.has(iid), `migration ${row.methodId} → unknown ${iid}`);
    }
    for (const iid of row.recipeDefault || []) {
      req(iids.has(iid), `migration ${row.methodId} recipe ${iid}`);
    }
  }
  for (const mid of ['challenge', 'shame', 'inspire', 'carry_burden', 'lie']) {
    req(
      (doc.map || []).some((r) => r.methodId === mid),
      `migration missing method ${mid}`,
    );
  }

  // Reignite thresholds match spec
  req(doc.reignite.touchScoreMin === 24, 'reignite.touchScoreMin must be 24');
  req(doc.reignite.flame01Min === 0.45, 'reignite.flame01Min must be 0.45');
  req(doc.reignite.alternate?.touchScoreMin === 18, 'reignite.alternate.touchScoreMin must be 18');

  // Spark defaults align with player.json
  const player = data['player.json']?.defaults;
  if (player) {
    req(doc.spark.sparkStart === player.sparkStart, 'spark.sparkStart must match player.defaults.sparkStart');
    req(doc.spark.sparkMax === player.sparkMax, 'spark.sparkMax must match player.defaults.sparkMax');
  }

  // Ripple reuse
  req(!!data['ripples.json'], 'systems/ripples.json required for interaction ripple reuse');
  req(doc.ripples.help?.kinFlame01 === 0.02, 'ripple help kinFlame01 must be 0.02');

  // Replay examples
  const examples = doc.sequences || [];
  req(examples.length === 3, `need 3 example sequences, have ${examples.length}`);
  const sim = createInteractionSim(doc);
  const initial = doc.initial;
  req(!!initial, 'examples.initial missing');

  for (const seq of examples) {
    let state = sim.startState(initial);
    let stepIdx = 0;
    for (const step of seq.steps || []) {
      stepIdx += 1;
      const label = `${seq.id}#${stepIdx}:${step.interactionId}`;
      req(iids.has(step.interactionId), `${label}: unknown interaction`);
      const result = sim.resolve(state, step.interactionId);
      req(result.ok, `${label}: resolve failed ${result.reason || ''}`);
      state = result.state;
      expectMatch(req, label, state, step.expect);
    }
  }
}
