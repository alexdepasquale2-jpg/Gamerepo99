import { assertHookList } from './util.mjs';

export function validateHooks(data, { req, ids }) {
  const hooks = ids(data['hooks.json']?.hooks);
  const hookById = Object.fromEntries((data['hooks.json']?.hooks || []).map((h) => [h.id, h]));
  const methods = ids(data['methods.json']?.methods);
  const knownHookKinds = new Set(['spark_recovery', 'personal_cost', 'refusal', 'legacy']);
  for (const h of data['hooks.json']?.hooks || []) {
    req(knownHookKinds.has(h.kind), `hooks ${h.id}: unknown kind ${h.kind}`);
    if (h.kind === 'refusal') {
      req(h.stillShowsInMenu === true, `refusal ${h.id}: stillShowsInMenu must be true`);
      if (h.methodId) req(methods.has(h.methodId), `refusal ${h.id}: methodId missing`);
    }
  }
  req((data['hooks.json'].hooks || []).some((h) => h.id === 'refusal_shame_child'), 'refusal_shame_child required');
  req((data['hooks.json'].hooks || []).some((h) => h.id === 'cost_loneliness_tax'), 'cost_loneliness_tax must remain as generic hook instance');
  req(hooks.has('cost_town_despair'), 'cost_town_despair hook required');
  req(hooks.has('cost_road_labor'), 'cost_road_labor hook required');
  return { hooks, hookById };
}
