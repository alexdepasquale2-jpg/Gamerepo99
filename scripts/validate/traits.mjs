import { assertHookList } from './util.mjs';

export function validateTraits(data, ctx) {
  const { req, ids, hooks, hookById, methods } = ctx;
  const statusTraits = ids(data['traits.json']?.statusTraits);
  req(statusTraits.has('inherited_dependence'), 'statusTrait inherited_dependence missing');
  const inh = (data['traits.json']?.statusTraits || []).find((s) => s.id === 'inherited_dependence');
  req(inh?.decay, 'inherited_dependence needs decay');
  assertHookList(req, hooks, hookById, inh?.whileActiveHookIds, 'inherited_dependence whileActive', 'personal_cost');
  if (inh?.decay?.onResolveHookId) {
    assertHookList(req, hooks, hookById, [inh.decay.onResolveHookId], 'inherited_dependence resolve', 'legacy');
  }
  assertHookList(req, hooks, hookById, ['apply_inherited_dependence'], 'succession apply flag', 'legacy');
  for (const mm of data['traits.json']?.methodModifiers || []) {
    for (const mid of methods) {
      req(mm.byMethod?.[mid], `methodModifiers ${mm.id}: missing method ${mid}`);
    }
  }
  const broodBody = (data['traits.json'].embodiment || []).find((e) => e.id === 'body_basilisk_brood');
  req(broodBody?.mode === 'multi' && broodBody?.bodySlots >= 2, 'brood embodiment must be multi-slot');
  req(broodBody?.activeBodiesMax >= 1, 'brood activeBodiesMax required');
}
