#!/usr/bin/env node
/**
 * Hearthfall: The Last Spark — data validator
 * Fails on unknown hook/trait refs from archetypes.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src', 'data');
const errors = [];
const warnings = [];

const loadAll = () => {
  const files = {};
  for (const name of readdirSync(dataDir).filter((f) => f.endsWith('.json'))) {
    try {
      files[name] = JSON.parse(readFileSync(join(dataDir, name), 'utf8'));
    } catch (e) {
      errors.push(`PARSE ${name}: ${e.message}`);
    }
  }
  return files;
};

const ids = (arr, key = 'id') => new Set((arr || []).map((x) => x[key]));
const req = (c, m) => {
  if (!c) errors.push(m);
};

const data = loadAll();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

req(!data['protagonist.json'], 'protagonist.json must be removed (use archetypes.json)');

const required = [
  'archetypes.json',
  'traits.json',
  'hooks.json',
  'player.json',
  'methods.json',
  'wounds.json',
  'marks.json',
  'people.json',
  'towns.json',
  'links.json',
  'events.json',
  'proofs.json',
  'time.json',
  'ripples.json'
];
for (const f of required) req(!!data[f], `missing ${f}`);

const hooks = ids(data['hooks.json']?.hooks);
const hookById = Object.fromEntries((data['hooks.json']?.hooks || []).map((h) => [h.id, h]));
const embodiment = ids(data['traits.json']?.embodiment);
const perception = ids(data['traits.json']?.perception);
const methodMods = ids(data['traits.json']?.methodModifiers);
const sparkProfiles = ids(data['traits.json']?.sparkProfiles);
const archetypes = ids(data['archetypes.json']?.archetypes);
const methods = ids(data['methods.json']?.methods);
const wounds = ids(data['wounds.json']?.wounds);
const marks = ids(data['marks.json']?.marks);
const people = ids(data['people.json']?.people);
const towns = ids(data['towns.json']?.towns);
const events = ids(data['events.json']?.events);
const proofs = ids(data['proofs.json']?.proofs);
const links = ids(data['links.json']?.links);

const knownHookKinds = new Set(['spark_recovery', 'personal_cost', 'refusal', 'legacy']);
for (const h of data['hooks.json']?.hooks || []) {
  req(knownHookKinds.has(h.kind), `hooks ${h.id}: unknown kind ${h.kind}`);
  if (h.kind === 'refusal') {
    req(h.stillShowsInMenu === true, `refusal ${h.id}: stillShowsInMenu must be true`);
    if (h.methodId) req(methods.has(h.methodId), `refusal ${h.id}: methodId missing`);
  }
}

function assertHookList(list, ctx, expectKind) {
  for (const hid of list || []) {
    req(hooks.has(hid), `UNKNOWN HOOK ${hid} referenced by ${ctx}`);
    if (expectKind && hookById[hid]) {
      req(hookById[hid].kind === expectKind, `${ctx}: hook ${hid} kind want ${expectKind} got ${hookById[hid].kind}`);
    }
  }
}

// Archetypes compose only known traits/hooks
const m2 = [];
for (const a of data['archetypes.json']?.archetypes || []) {
  req(embodiment.has(a.embodimentTraitId), `archetype ${a.id}: unknown embodiment ${a.embodimentTraitId}`);
  req(perception.has(a.perceptionTraitId), `archetype ${a.id}: unknown perception ${a.perceptionTraitId}`);
  req(methodMods.has(a.methodModifierId), `archetype ${a.id}: unknown methodModifier ${a.methodModifierId}`);
  req(sparkProfiles.has(a.sparkProfileId), `archetype ${a.id}: unknown sparkProfile ${a.sparkProfileId}`);
  assertHookList(a.personalCostHookIds, `archetype ${a.id} personalCost`, 'personal_cost');
  assertHookList(a.refusalHookIds, `archetype ${a.id} refusal`, 'refusal');
  assertHookList(a.legacyHookIds, `archetype ${a.id} legacy`, 'legacy');
  req(towns.has(a.startingTownId), `archetype ${a.id}: startingTown missing`);
  if (a.defaultProofId) req(proofs.has(a.defaultProofId), `archetype ${a.id}: defaultProof missing`);
  if (a.m2Playable) m2.push(a.id);

  const sp = (data['traits.json'].sparkProfiles || []).find((s) => s.id === a.sparkProfileId);
  if (sp) {
    assertHookList(sp.recoveryHookIds, `sparkProfile ${sp.id} recovery`, 'spark_recovery');
    if (sp.homeTownId) req(towns.has(sp.homeTownId), `sparkProfile ${sp.id}: homeTown missing`);
    if (sp.homeSiteId) {
      const sites = new Set((data['towns.json'].towns || []).flatMap((t) => (t.sites || []).map((s) => s.id)));
      req(sites.has(sp.homeSiteId), `sparkProfile ${sp.id}: homeSite missing`);
    }
  }
}

req(m2.length === 3, `M2 needs exactly 3 playable archetypes (have ${m2.length})`);
for (const id of data['player.json']?.m2ArchetypeIds || []) {
  req(archetypes.has(id), `player.m2ArchetypeIds unknown ${id}`);
  const a = data['archetypes.json'].archetypes.find((x) => x.id === id);
  req(a?.m2Playable, `player lists non-m2Playable ${id}`);
}
req(!!data['player.json']?.forgeRule, 'player.json must state forgeRule against special-cases');
req(data['archetypes.json']?.status === 'LOCKED', 'archetypes.json status must be LOCKED');
req(data['player.json']?.designStatus === 'LOCKED', 'player.json designStatus must be LOCKED');

const succ = data['archetypes.json']?.succession;
req(succ?.dependenceWeightMul === 0.5, 'dependenceWeightMul must remain 0.5');
req(succ?.defaultChoice === 'continue', 'succession defaultChoice must be continue');
req(succ?.ui?.screenCopy === 'Your fire went out. Someone remembers it.', 'succession screen copy mismatch');
req(succ?.ui?.buttons?.continue === 'Carry it on', 'continue button label mismatch');
req(succ?.ui?.buttons?.quit === 'Let it rest', 'quit button label mismatch');
req(succ?.ui?.quitNeverShamed === true, 'quitNeverShamed must be true');
req(succ?.dependenceSuccessorFlagId === 'inherited_dependence', 'dependenceSuccessorFlagId required');

const statusTraits = ids(data['traits.json']?.statusTraits);
req(statusTraits.has('inherited_dependence'), 'statusTrait inherited_dependence missing');
const inh = (data['traits.json']?.statusTraits || []).find((s) => s.id === 'inherited_dependence');
req(inh?.decay, 'inherited_dependence needs decay');
assertHookList(inh?.whileActiveHookIds, 'inherited_dependence whileActive', 'personal_cost');
if (inh?.decay?.onResolveHookId) assertHookList([inh.decay.onResolveHookId], 'inherited_dependence resolve', 'legacy');
assertHookList(['apply_inherited_dependence'], 'succession apply flag', 'legacy');


// method mods cover all methods
for (const mm of data['traits.json']?.methodModifiers || []) {
  for (const mid of methods) {
    req(mm.byMethod?.[mid], `methodModifiers ${mm.id}: missing method ${mid}`);
  }
}

// methods matrix + refusal hooks exist
for (const m of data['methods.json']?.methods || []) {
  for (const wid of wounds) {
    req(typeof m.effectiveness?.[wid] === 'number', `methods ${m.id}: missing wound ${wid}`);
  }
  assertHookList(m.refusalHookIds, `method ${m.id} refusalHookIds`, 'refusal');
  if (m.ui) {
    req(m.ui.disableWhenRefused !== true, `method ${m.id}: disableWhenRefused forbidden`);
    req(m.ui.hideWhenRefused !== true, `method ${m.id}: hideWhenRefused forbidden`);
  }
}

req(
  (data['hooks.json'].hooks || []).some((h) => h.id === 'refusal_shame_child'),
  'refusal_shame_child required'
);
req(
  (data['hooks.json'].hooks || []).some((h) => h.id === 'cost_loneliness_tax'),
  'cost_loneliness_tax must remain as generic hook instance'
);

// people / towns / sites
const siteIds = new Set();
for (const t of data['towns.json']?.towns || []) {
  for (const s of t.sites || []) {
    req(!siteIds.has(s.id), `dup site ${s.id}`);
    siteIds.add(s.id);
    if (s.personId) {
      req(people.has(s.personId), `site ${s.id} person missing`);
      const person = data['people.json'].people.find((x) => x.id === s.personId);
      if (person) {
        req(person.siteId === s.id, `site/person mismatch ${s.id}`);
        req(person.townId === t.id, `site/person town mismatch ${s.id}`);
      }
    }
  }
}
for (const p of data['people.json']?.people || []) {
  req(towns.has(p.townId) && siteIds.has(p.siteId) && wounds.has(p.woundId), `people ${p.id} bad refs`);
  if (p.proofId) req(proofs.has(p.proofId), `people ${p.id} proof missing`);
}

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

for (const ev of data['events.json']?.events || []) {
  for (const tid of ev.townBias || []) req(towns.has(tid), `event ${ev.id} town ${tid}`);
  for (const fx of ev.effects || []) {
    if (fx.markId) req(marks.has(fx.markId), `event mark`);
    if (fx.methodId) req(methods.has(fx.methodId), `event method`);
  }
}

if (data['wounds.json']?.backfireMarkId) req(marks.has(data['wounds.json'].backfireMarkId), 'backfire mark');

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

// Brood multi-body expressible in data
const broodBody = (data['traits.json'].embodiment || []).find((e) => e.id === 'body_basilisk_brood');
req(broodBody?.mode === 'multi' && broodBody?.bodySlots >= 2, 'brood embodiment must be multi-slot');
req(broodBody?.activeBodiesMax >= 1, 'brood activeBodiesMax required');

console.log('Files:', Object.keys(data).sort().join(', '));
console.log(
  'Counts:',
  `archetypes=${archetypes.size}`,
  `m2=[${m2.join(',')}]`,
  `hooks=${hooks.size}`,
  `people=${people.size}`,
  `methods=${methods.size}`,
  `links=${links.size}`
);
if (warnings.length) console.log('Warnings:\n ' + warnings.join('\n '));
if (errors.length) {
  console.error('FAILED:\n ' + errors.join('\n '));
  process.exit(1);
}
console.log('OK — protagonist system data valid (no unknown hooks).');
