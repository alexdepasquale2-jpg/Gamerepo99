import { assertHookList } from './util.mjs';

export function validateMethods(data, ctx) {
  const { req, ids, hooks, hookById } = ctx;
  const methods = ids(data['methods.json']?.methods);
  const wounds = ids(data['wounds.json']?.wounds);
  const marks = ids(data['marks.json']?.marks);
  for (const m of data['methods.json']?.methods || []) {
    for (const wid of wounds) {
      req(typeof m.effectiveness?.[wid] === 'number', `methods ${m.id}: missing wound ${wid}`);
    }
    assertHookList(req, hooks, hookById, m.refusalHookIds, `method ${m.id} refusalHookIds`, 'refusal');
    if (m.ui) {
      req(m.ui.disableWhenRefused !== true, `method ${m.id}: disableWhenRefused forbidden`);
      req(m.ui.hideWhenRefused !== true, `method ${m.id}: hideWhenRefused forbidden`);
    }
  }
  if (data['wounds.json']?.backfireMarkId) req(marks.has(data['wounds.json'].backfireMarkId), 'backfire mark');
  return { methods, wounds, marks };
}
