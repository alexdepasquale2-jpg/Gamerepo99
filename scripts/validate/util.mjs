/** Shared validate helpers. */
export const createBag = () => {
  const errors = [];
  const warnings = [];
  const req = (c, m) => {
    if (!c) errors.push(m);
  };
  const ids = (arr, key = 'id') => new Set((arr || []).map((x) => x[key]));
  return { errors, warnings, req, ids };
};

export function assertHookList(req, hooks, hookById, list, ctx, expectKind) {
  for (const hid of list || []) {
    req(hooks.has(hid), `UNKNOWN HOOK ${hid} referenced by ${ctx}`);
    if (expectKind && hookById[hid]) {
      req(
        hookById[hid].kind === expectKind,
        `${ctx}: hook ${hid} kind want ${expectKind} got ${hookById[hid].kind}`
      );
    }
  }
}

/** Allowed effect scaleBy scalars; mirrors scalarOf in src/sim/effects.ts. */
export const SCALE_BY_KEYS = new Set(['town.despair', 'player.notoriety', 'player.visibleWealth']);

export function assertScaleBy(req, effects, ctx) {
  for (const e of effects || []) {
    if (e.scaleBy !== undefined) req(SCALE_BY_KEYS.has(e.scaleBy), `${ctx}: effect ${e.id} unknown scaleBy ${e.scaleBy}`);
  }
}
