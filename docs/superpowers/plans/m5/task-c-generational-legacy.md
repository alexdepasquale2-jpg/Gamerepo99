# Task C: Generational legacy and async world files

> Part of [M5 Depth](./index.md). Spec: DESIGN.md §2.6 (generational play, LOCKED copy); async-legacy §4-8b; hoarder-notoriety §7 (neglect imprint).

**Files:**
- Modify: `src/sim/succession.ts` (heir selection from bonds; apply `legacy` hooks; keep `lockedSuccessionUi()` copy unchanged), `src/sim/save.ts` (`version`, `imprint`), `src/sim/hooks.ts` if a `on_burnout_or_death` trigger needs wiring
- Create: `src/sim/legacy/heir.ts` (score bonds, pick heir), `src/sim/legacy/imprint.ts` (`buildImprint`, `assembleFromImprint`), `src/sim/legacy/world-file.ts` (`exportWorld`, `importWorld`, migrations), `src/sim/legacy/delta-log.ts`, `src/sim/legacy/index.ts`
- Reuse: `src/sim/letters-scale.ts` (`enqueueLetter` for rumor memory packet / legend letters), `src/sim/social/unspoken.ts` (`encodeUnspokenForState` for reputation echoes)
- Data (read): `hooks/legacy.json` (`legacy_ember_standard` +15 `successor.sparkStart`, `legacy_reputation_echo` fear -0.05 / trust +0.08, `legacy_rumor_packet` `vitality_echo`, `apply_inherited_dependence`, `legacy_hoard_imprint`), `people/archetypes.json` succession (screenCopy, buttons, `minBond`, dependence mul 0.5), `people/traits.json` (`inherited_dependence`)
- Tests: `tests/sim/legacy/{heir,imprint,world-file,succession-m5}.test.ts`

**Interfaces:**

```ts
export function pickHeir(state: SimState): { personId: string; score: number } | null;
export function buildImprint(state: SimState): ProtagonistImprint;          // spec §4
export function exportWorld(state: SimState): HearthWorldFile;               // format 'hearthfall.world', version 1
export function importWorld(file: unknown): { state: SimState; legends: string[] } | { error: string };
export function assembleFromImprint(imprint: ProtagonistImprint): Inhabitant;  // tags legacy_player, legend_candidate
```

Sim side only. "Carry it on" / "Let it rest" are the existing `lockedSuccessionUi()` buttons; this task provides the functions the M6 screen calls. Copy: "Your fire went out. Someone remembers it."

## Tests first

1. `pickHeir` takes the top bond by `scoreBondEvent` with dependence x0.5, excludes high resentment, requires `minBond`; ties break by sorted personId (deterministic).
2. Burnout + "Carry it on": heir gets `sparkStart +15` (legacy_ember_standard), uses their own traits/refusals.
3. Reputation echoes applied to `townsTouched` (fear) and `townsWhereGenuineGrowth` (trust) per legacy.json scopes.
4. Rumor memory: a `vitality_echo` packet is enqueued via `letters-scale`; unspoken residue carried via `encodeUnspokenForState`; same seed => same packets.
5. Dependence-path heir gets `inherited_dependence`; decays on the three spec conditions.
6. "Let it rest" ends the run, records ending; hoard state (Task A `detectEnding`) adds flag `hoard_legacy` / ending `ash_hoard` to imprint; no shaming branch, copy unchanged.
7. `exportWorld` writes `{format, version:1, seed, contentHash, contentPackIds, deltas, imprint}`; `contentHash` stable across runs.
8. Round trip: export -> `importWorld` -> replay deltas on seed with per-day RNG reset => identical world dump hash.
9. Migrations: `version < CURRENT` runs pure `migrations[v]` in order; unknown delta `t` skipped only if `compatible:true`, else refused with message; missing content pack refused (degraded mode deferred).
10. Imported imprint yields a legend/NPC/grave: NPC `methodWeights` = `methodTendencies`; grave from `grave` delta; legend rumor from `legendSeed` via lines templates `{legacyName}`.
11. Legacy NPC acts in LOD under a budget cap, using method resolve; no `archetypeId ===`; tendencies map to hooks via data tables.
12. Evidence check 3: burnout -> heir continues; export/import shows legend present.

## Acceptance

- Gate green plus evidence script check 3.
- Files are zero-cost JSON; no network, no server, no co-op. Former PCs surface through people (inspect lines, gossip, graves, letters), no popups.

## Out of scope

Succession screen, file picker, share sheet, QR (M6); curated legacy packs and depth tables (M7); hosted index (M8, Niblet+Alex clearance).

## Risks / open questions

- Async spec's `ProtagonistImprint` has no `flags`, yet §8b/hoarder §7 add `flags: ['hoard_legacy']` and `ending`. Schema extension needs agreement.
- DESIGN.md says "burnout/death"; death has no sim trigger today (only burnout in `succession.ts`). Confirm scope.
- `legacy_hoard_imprint` already exists in legacy.json; confirm its threshold vs `hoardLegacyCoinMin`.
- Delta log capture points (which events emit `WorldDelta`) are undefined; propose hooking the event bus. Log size growth is a perf question for M7.
- Heir selection uses top bonds; spec does not say what happens with zero eligible bonds (propose: Let it rest only).
