# Task B: Kingdom patrons

> Part of [M5 Depth](./index.md). Spec: hoarder-notoriety §6 (patrons), §5 attractors `att_patron_demand`, `att_spy`, `att_betrayal`; doctrine-legitimacy design; M4 Task C.

**Files:**
- Create: `src/sim/patrons/deals.ts` (accept/tick obligations/break), `src/sim/patrons/doctrine-link.ts` (patron <-> doctrine meters), `src/sim/patrons/index.ts`
- Modify: `src/sim/doctrine-tick.ts` (expose a hook for patron-driven propaganda/perceived-delivery deltas; do not fork its formulas), `src/sim/scenario/scenario-advance.ts` (obligation ticks at dawn), `src/sim/types/runtime.ts` (`patronDeals`), `src/sim/save.ts`, `src/sim/load-data.ts`, `scripts/validate/` (patron -> `doctrines.json` id check)
- Data (read): `economy/patrons.json` (`patron_mill_trust` -> `doctrine_mill_bread`; `patron_strand_wardens`; deals with offer/obligation/`leverageOnBreak`/`betrayalRisk`), `economy/notoriety.json` (`gain_patron_deal` +0.1, attractors), doctrines table
- Tests: `tests/sim/patrons/{deals,doctrine-link}.test.ts`

**Interfaces:**

```ts
export function openDeals(state: SimState, patronId: string): string[];  // gated by openNotorietyMin
export function acceptDeal(state: SimState, patronId: string, dealId: string): { ok: boolean };
export function tickPatronDawn(state: SimState): { due: string[]; broken: string[]; betrayed: string[] };
export function breakDeal(state: SimState, dealId: string): void;        // fires leverageOnBreak
```

Deals are reached only through an interaction with a patron-voice person (act via `act()`), never a menu spend. Offer coin/goods/standing/travelSafeDays is the reward the interaction yields.

## Tests first

1. `openDeals` hidden below `openNotorietyMin` (0.35 for mill trust); visible at/above.
2. `acceptDeal` applies offer (coin, `standing`, `travelSafeDays`) and `gain_patron_deal` notoriety, deterministically.
3. Accepting a mill-trust deal raises patron doctrine `propaganda`/`perceivedDelivery` through the `doctrine-tick` link; `legitimacyOf` recomputed, not hand-set.
4. Obligation `tithe` due after `dueDays`: unmet => `leverageOnBreak` (notoriety +0.15, `doctrineExposureAdd` +0.1) fires once.
5. `deny_reignite` is soft: methods are never disabled; breaking it triggers `att_spy` spawn.
6. `betrayalRisk` rolled with `deriveRng(seed,'patron',day,dealId)`; risk scales up when patron legitimacy is low; same seed => same betrayal day.
7. `act_expose_lie` on a patron voice (existing doctrine act) raises exposure and sours open deals; collapse of the patron doctrine (`applyCollapse`) voids/weakens its deals.
8. Large polity deals shift notoriety AND doctrine meters in one run; two-run hash identical (evidence check 2).
9. Patron tick emits letters/rumors via `enqueueLetter` (word of a deal travels), capped by `MAX_PACKETS_PER_DAWN`.
10. Grep: no `archetypeId ===`, no `Math.random`; `patrons.json` doctrineId resolves (validator).

## Acceptance

- Gate green; `npx vite-node scripts/m5-depth-evidence.mts` check 2 passes.
- A deal produces observable change only through acts, letters and juice (a patron's tell, a rumor), never a popup or a resource button.
- No obligation hard-locks a method.

## Out of scope

Patron deal UI (M6); new patrons beyond data (only the two authored, M7 content); diplomacy between polities; war.

## Risks / open questions

- Hoarder spec §6 says "large polity", but both authored patrons are town-scale (`homeTownId`); no kingdom-scale polity data. Flag: author more or accept.
- Hoarder spec §8 says "patron obligation UI" in M5; assignment moves UI to M6. Sim-only here.
- How patron accept maps to a doctrine meter delta is unspecified (propaganda vs perceived delivery). Proposed: tithe paid -> real delivery; deny_reignite -> propaganda. Needs design sign-off.
- Doctrine collapse cascade already steals/charges `exposure` (M4 constants); avoid double counting with `doctrineExposureAdd`.
