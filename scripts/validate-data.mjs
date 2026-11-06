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

const loadHooksDir = () => {
  const hooksDir = join(dataDir, 'hooks');
  const index = JSON.parse(readFileSync(join(hooksDir, 'index.json'), 'utf8'));
  const hooks = [];
  for (const name of index.files || []) {
    const part = JSON.parse(readFileSync(join(hooksDir, name), 'utf8'));
    hooks.push(...(part.hooks || []));
  }
  return {
    version: index.version,
    description: index.description,
    hooks,
  };
};

const loadAll = () => {
  const files = {};
  for (const name of readdirSync(dataDir).filter((f) => f.endsWith('.json'))) {
    try {
      files[name] = JSON.parse(readFileSync(join(dataDir, name), 'utf8'));
    } catch (e) {
      errors.push(`PARSE ${name}: ${e.message}`);
    }
  }
  try {
    files['hooks.json'] = loadHooksDir();
  } catch (e) {
    errors.push(`PARSE hooks/: ${e.message}`);
  }
  if (readdirSync(dataDir).includes('hooks.json')) {
    errors.push('hooks.json must be removed — use src/data/hooks/ split by category');
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
  'ripples.json',
  'lines.json',
  'kinship.json',
  'letters.json'
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


// lines.json + people.json writing pass: voice/wound/tell + every method line + marks + archetype refusals
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
// people.json mirrors voice/wound/tell
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
// archetype refusal lines for all m2 playable archetypes
const archRefusals = data['lines.json']?.archetypeRefusals || {};
const m2Arch = (data['archetypes.json']?.archetypes || []).filter((a) => a.m2Playable);
for (const a of m2Arch) {
  const block = archRefusals[a.id];
  req(!!block, `lines.json archetypeRefusals missing ${a.id}`);
  for (const hid of a.refusalHookIds || []) {
    const arr = block?.[hid];
    req(Array.isArray(arr) && arr.length > 0 && arr.every((s) => typeof s === 'string' && s.trim()), `lines.json ${a.id} needs refusal lines for hook ${hid}`);
  }
}


// kinship edges + letters templates (M3 stubs)
const kinEdges = data['kinship.json']?.edges || [];
req(kinEdges.length >= 6, 'kinship.json needs authored edges (>=6)');
for (const e of kinEdges) {
  req(people.has(e.fromPersonId), `kinship ${e.id}: fromPerson missing`);
  req(people.has(e.toPersonId), `kinship ${e.id}: toPerson missing`);
  for (const lid of e.townPath || []) req(links.has(lid), `kinship ${e.id}: link ${lid} missing`);
  req(typeof e.weight === 'number' && e.weight > 0 && e.weight <= 1, `kinship ${e.id}: weight`);
}
const letterTpls = data['letters.json']?.templates || [];
req(letterTpls.length >= 5, 'letters.json needs >=5 templates');
const packetTypes = new Set(letterTpls.map((x) => x.packetType));
req(packetTypes.has('proof_packet') && packetTypes.has('relapse_pressure'), 'letters need proof_packet and relapse_pressure templates');


// founding lore gap axis (optional-safe defaults enforced on playable towns)
for (const town of data['towns.json']?.towns || []) {
  if (town.playable === false || town.abstract) continue;
  req(typeof town.gapAxis === 'number', `town ${town.id}: gapAxis required`);
  req(typeof town.connection === 'number', `town ${town.id}: connection required`);
  req(typeof town.standing === 'number', `town ${town.id}: standing required`);
}
const civic = (data['people.json']?.people || []).filter((p) => (p.tags || []).includes('civic_voice'));
req(civic.length >= 2, 'need >=2 civic_voice people for representation');
const cross = (data['kinship.json']?.edges || []).filter((e) => e.crossGap);
req(cross.length >= 1, 'need >=1 crossGap kinship edge for lore systems');

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
