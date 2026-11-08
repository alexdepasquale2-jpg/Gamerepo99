import { assertHookList } from './util.mjs';

export function validateArchetypes(data, ctx) {
  const { req, ids, hooks, hookById } = ctx;
  const embodiment = ids(data['traits.json']?.embodiment);
  const perception = ids(data['traits.json']?.perception);
  const methodMods = ids(data['traits.json']?.methodModifiers);
  const sparkProfiles = ids(data['traits.json']?.sparkProfiles);
  const archetypes = ids(data['archetypes.json']?.archetypes);
  const towns = ids(data['towns.json']?.towns);
  const proofs = ids(data['proofs.json']?.proofs);
  const m2 = [];
  for (const a of data['archetypes.json']?.archetypes || []) {
    req(embodiment.has(a.embodimentTraitId), `archetype ${a.id}: unknown embodiment ${a.embodimentTraitId}`);
    req(perception.has(a.perceptionTraitId), `archetype ${a.id}: unknown perception ${a.perceptionTraitId}`);
    req(methodMods.has(a.methodModifierId), `archetype ${a.id}: unknown methodModifier ${a.methodModifierId}`);
    req(sparkProfiles.has(a.sparkProfileId), `archetype ${a.id}: unknown sparkProfile ${a.sparkProfileId}`);
    assertHookList(req, hooks, hookById, a.personalCostHookIds, `archetype ${a.id} personalCost`, 'personal_cost');
    assertHookList(req, hooks, hookById, a.refusalHookIds, `archetype ${a.id} refusal`, 'refusal');
    assertHookList(req, hooks, hookById, a.legacyHookIds, `archetype ${a.id} legacy`, 'legacy');
    req(towns.has(a.startingTownId), `archetype ${a.id}: startingTown missing`);
    if (a.defaultProofId) req(proofs.has(a.defaultProofId), `archetype ${a.id}: defaultProof missing`);
    if (a.m2Playable) m2.push(a.id);
    const sp = (data['traits.json'].sparkProfiles || []).find((s) => s.id === a.sparkProfileId);
    if (sp) {
      assertHookList(req, hooks, hookById, sp.recoveryHookIds, `sparkProfile ${sp.id} recovery`, 'spark_recovery');
      if (sp.homeTownId) req(towns.has(sp.homeTownId), `sparkProfile ${sp.id}: homeTown missing`);
      if (sp.homeSiteId) {
        const sites = new Set((data['towns.json'].towns || []).flatMap((t) => (t.sites || []).map((s) => s.id)));
        req(sites.has(sp.homeSiteId), `sparkProfile ${sp.id}: homeSite missing`);
      }
    }
  }
  req(m2.length >= 3, `M2 needs at least 3 playable archetypes (have ${m2.length})`);
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
  return { archetypes, m2, towns, proofs };
}
