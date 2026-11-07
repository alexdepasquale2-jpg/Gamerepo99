# Task A: Hoarder path and notoriety

> Part of [M5 Depth](./index.md). Spec: hoarder-notoriety §4 (stash), §5 (notoriety), §7 (neglect); DESIGN.md pointer line 62.

**Files:**
- Create: `src/sim/hoard/stash.ts` (StashRuntime, decay, theft, guards), `src/sim/hoard/notoriety.ts` (meter, fade, heat, attractors), `src/sim/hoard/neglect.ts` (ending detection), `src/sim/hoard/index.ts`
- Modify: `src/sim/scenario/scenario-advance.ts` (dawn: decay, theft roll, notoriety fade, attractor roll), `src/sim/types/runtime.ts` (`player.coin`, `notoriety`, `stash`, `peakCoin`, `reigniteCount`), `src/sim/save.ts` (persist), `src/sim/load-data.ts` (load three tables), `scripts/validate/` (schema checks), `src/sim/index.ts`
- Modify: `src/sim/travel/*` encounter spawn weights consume attractors (`att_thief`, `att_rival_hoarder`, `att_copycat`)
- Data (read): `economy/stash-sites.json` (sites + acts `stash_hide|stash_guard_hire|stash_withdraw`), `economy/notoriety.json` (formulas, gains, losses, spread, attractors), `economy/economy-resources.json`
- Tests: `tests/sim/hoard/{stash,notoriety,neglect}.test.ts`

**Interfaces:**

```ts
export function tickStashDawn(state: SimState): { lost: string[]; stolen: string[] };
export function addNotoriety(state: SimState, gainId: string): void;      // from notoriety.json gains/losses
export function tickNotorietyDawn(state: SimState): { heat: number };      // fade lerp 0.01, heat formula
export function rollAttractors(state: SimState, ctx: 'dawn' | 'road'): string[]; // attractor ids
export function detectEnding(state: SimState): 'ash_hoard' | null;
```

## Tests first

1. `unguarded`/`decayLoss` match spec §4 on a 40-goods stash (floor, guard fraction).
2. `theftP` clamps to [0.02, 0.85]; rises with notoriety, falls with `hideDifficulty` and guards (table-driven).
3. Theft roll uses `deriveRng(seed, 'stash', day, siteId)`; same seed => same theft day; no `Math.random`.
4. Successful theft steals 0.1..0.4 * (1 - hide*0.5) and enqueues a rumor packet via `enqueueLetter`.
5. `stash_hide` / `stash_guard_hire` / `stash_withdraw` run through `act()`; each applies gains from `notoriety.json` (`gain_large_deposit` at >20).
6. Dawn fade: notoriety 0.5 -> lerp 0.01; `heat = n*(0.5+0.5*visibleWealth)`.
7. Attractors fire only at `>= minNotoriety`; weights from data; grep test: no `archetypeId ===`.
8. Heat spike emits ripple tag `notoriety`; kin copy diluted by `kinDilution` 0.5.
9. Dying town (high despair): theft and copycat odds lower until collapse (spec §7 row 2).
10. Neglect: 30 dawns with 0 reignites raises `town.despair` via existing LOD, never sets a lose flag; `detectEnding` returns `ash_hoard` when `reigniteCount===0 && peakCoin >= hoardLegacyCoinMin`.
11. Spark 0 / "Let it rest" with hoard state still routes to succession (Task C), no shame branch.
12. 30-dawn hoarder bot (scripted acts) ends cleanly with an ending; evidence-script check 1.

## Acceptance

- `npm run validate && npm test && npm run build` green; new schemas validate the three JSON tables.
- Deterministic across two runs; notoriety visibly changes encounter weights and theft odds (both edges: cheaper patron openers/intimidate discounts AND more danger).
- Coin is a meter only; no code path spends it as a button. Surfaces as inspect lines/gossip/juice (`stash.theft`, `notoriety.rise`), no popups.

## Out of scope

Stash/coin UI, art, audio (M6); balance tuning (M7); patron deals (Task B); succession/imprint writing (Task C, reads `detectEnding`).

## Risks / open questions

- `notoriety.json` has a `hoardLegacy` block; confirm it defines `hoardLegacyCoinMin` (spec leaves the value open).
- `visibleWealth` has no formula in the spec; propose `min(1, totalStashCoin/capacity)`, needs sign-off.
- Hoarder spec §7 says "Succession UI unchanged" yet lists an "optional branch copy"; DESIGN.md §2.6 locks the copy. Treated as no copy change (flag only).
- `stash_hide` lists methodIds `lie|carry_burden`; these gate which methods can host the act. Confirm they don't conflict with refusal hooks.
