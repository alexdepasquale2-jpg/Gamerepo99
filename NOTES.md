# NOTES
- `npm run balance` rewrites docs/qa/reports/_m7-balance-matrix.json (generatedAt); discard unless intended.
- Saves: one path, `saveState`/`loadState` in src/sim/save.ts (v2). interactionRt is outside SimState: rebuild with interactionRuntimeFromPeople after load.
- Any doctrine act or letter now creates state.legacy (delta log), so tickLegacyDawn runs in every such run.
- guard_caravan accept/fulfil rows need a Lowmere `doctrine_voice`/`leader`; world-gen has none (leon_march missing).
- ash_hoard needs coin in a stash; carried coin alone no longer counts.
