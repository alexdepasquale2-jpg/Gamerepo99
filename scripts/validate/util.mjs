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
