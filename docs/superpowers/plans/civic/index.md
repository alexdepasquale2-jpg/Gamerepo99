# Next pass: the living civic economy (sites, stores, staff, zoning, time)

Scope: `game/` (the v2 rebuild). v1 in `src/` is frozen and is not touched.

## Context

`game/` already runs a deterministic, NPC-run economy:
- town ledgers, carts, build plans on plots
- companies with wages, facility crews, households
- borders and a town-level polity (trust, feud, treaty, war, branching tech, creeds)
- letters, and a 10×10 realm of districts where only the active one runs

The realm work also added a district inbox for mail and news between districts, plus an away-tick (`sim/realm-away.ts`).

What it lacks against the vision:

- **Goods are not stored anywhere.** Stock is one abstract ledger per town (`economy/village-economy.ts`, `economy/food-stock.ts`). There are no storage sites and no hauling by workers.
- **Four staffing models that don't connect:**
  - `economy/companies.ts`: owner, workers and coin.
  - `economy/facilities.ts`: crew slots, no pay.
  - `economy/build-plans.ts`: owner labour.
  - `economy/workshops.ts`: the player's workshops.

  None has a manager, and no site requires one.
- **Food and pay don't bind work.** Workers aren't fed by their site, and wages go into purses that nothing spends.
- **Time only moves when you rest.** `WorldScene.rest()` calls `session.tick()`. Away districts only get despair drift (`realm.catchUp()` and the `realm-away` tick), so nothing else happens off-screen.
- **Missing structure:** no zoning or civic tiers, no district leaders and no district-level war. Leaders and war come in the following pass, below.

### Decisions already made with the user

- The first spine is sites, staffing and stores.
- The player is one actor among many: they can own, manage, hire and zone, and NPCs run the same rules without them.
- Diplomacy and war are built on top of this in the following pass.

## Design principles

- **Sim-first.** Pure TS in `game/src/sim/civic/`, deterministic (`deriveRng`, never `Math.random`). Plug in through `registerDawnTick` (`sim/dawn-ticks.ts`) so `scenario-advance.ts` barely changes.
- **Adapt, don't rewrite.** The new Site layer first wraps the existing plans, companies, facilities and workshops with a read/write adapter. Writers then move over one slice at a time.
- **Saves:** old saves migrate. Bump `SAVE_VERSION` in `sim/save.ts` (3 → 4), add a `saveMigrations[3]` entry, and add a v4 fixture under `game/scripts/save-fixtures/` for `game:check-saves`.
- **Conservation is a test.** Coin and goods are only created by named sources (production, gifts, harvest) and only destroyed by named sinks (eating, spoilage, loss).
- **News arrives through people:** dawn lines and bubbles, never popups. New things are reached through the one ring (≤6 chips) and the noticeboard sheet.
- **"Always been there."** Higher tiers don't appear from nothing. They are generated from the seed with a backstory, and found by walking up to them.
- **Respect what is already merged:**
  - `sim/map/town-plan.ts` places buildings, so sites map onto planned buildings or plot cells.
  - `economy/town-roles.ts` gives district towns their stock, facilities and stash sites by role.
  - `realm.ts` / `realm-away.ts` carry district summaries and the inbox.
  - `economy/polity.ts` already has feud sources, wars and branching tech.

## The model

**Site** (`civic/sites.ts`):

```ts
{ id, districtId, townId, kind, plot, zone, ownerId, managerId, workers[], haulers[], wage, coin, store, status, founded, history[] }
```

- **Kinds:** farm, mill, smithy, workshop, shop/market stall, storehouse, granary, mine/camp, barracks (a stub for war), townhall.
- **Data:** `data/civic/sites.json` (inputs, outputs, roles, tier unlocked). It is seeded from `data/items/buildings.json`, `data/economy/facility-workers.json` and `data/items/jobs.json` recipes.

**Store** (`civic/store.ts`): `{ items: Record<itemId, qty>, capacity, spoilage }`.
- Every good physically lives in a Store: site stores, household pantries, carts and wagons, the player's satchel and hoard chest.
- API: `put`, `take`, `move`, `total`. Each move is written to a bounded conservation log.
- The town ledger first becomes a derived view (the sum of the town's site stores). The writers then switch over to stores.

**Roles:**
- **Manager:** required for a site to operate. Picks hires, sets the wage, and chooses what to make and sell.
- **Workers** and **haulers.**
- **No manager:** the site is idle and posts "wanted: manager" on the board. The best candidate is promoted, judged on trait and job fit from `gen/society/people.ts` vectors and `goods/jobs.ts`. The player can take the post instead.
- **Manager death or retirement** hooks into `economy/mortality.ts`.

**Daily loop per site** (dawn tick, slot `people` then `prices`):
1. Pay wages from the site's coin.
2. Workers eat from the site or household store (ration constants from `food-stock.ts`).
3. Produce into the store.
4. Haulers move surplus to a storehouse or market, and bring inputs in from storage.
5. Market sales turn goods into site coin.

**Failure rules:**
- Unpaid workers quit after N days (reuse `COMPANY.quitAfterUnpaid`).
- Unfed workers fall sick or leave, and town despair is nudged up.

**Closed coin loop:** wages → households buy food from the granary or market → the market pays producers.

**Time:** the dawn pipeline stays the unit. Add `civic/clock.ts` with `advance(state, {hours | days})` and `fastForward(state, days)`.
- Sleep, waiting and long trips call it.
- Under about 10 days it runs the full pipeline. Beyond that it runs the LOD site tick (aggregates per site: net output, wages, food), so cost stays flat.
- The same LOD tick replaces `realm.catchUp()` and the despair-only part of `realm-away.ts` for frozen and away districts, so they develop while you are gone, deterministically.

**Zoning and tiers:**
- Each town has zones on its plots: farm, craft, market, civic, housing. `build-plans.ts` claims already carry plot cells; add `zone`.
- Claims must fit their zone.
- The town's leader or council (the doctrine voice) sets zones and a tax. The player can petition, zone, or found sites.
- Tiers run hamlet → village → town → city, judged by population plus built sites. Each tier unlocks new site kinds and civic buildings (market, granary, barracks, townhall).
- Districts generated by `sim/map/districts.ts` get pre-aged sites and chronicle entries (`sim/chronicle.ts`) for their tier.

## Slices

One PR each, in order. Each must end with `npm run game:check`, `npm run game:build` and `npm run game:check-saves` green, plus `game/scripts/check-civic.mts` once it exists.

1. **Store and Site registry (adapter), no behaviour change.**
   - New `sim/civic/{store,sites,index}.ts` and `data/civic/sites.json`.
   - Derive Sites from `state.companies`, `state.facilityStaff`, `state.build` plans (player workshops from `economy/workshops.ts` live in `state.build` and `state.companies` too). The ledger becomes a derived view.
   - Save v4 migration and fixture.
   - Add `game/scripts/check-civic.mts`, with determinism and conservation checks only.
   - Add the Vitest harness (see the open question).
2. **Managers, pay, food.**
   - `civic/staffing.ts`: the manager requirement, hiring by the manager, the wage and ration loop, quit and sick, and "wanted: manager".
   - Retire the duplicate hiring in `companies.ts` behind the adapter.
   - Dawn lines through `sim/dawn-lines.ts`.
3. **Real stores and hauling.**
   - Production and consumption go through stores, and haulers move goods between sites.
   - Storehouse and granary kinds, plus spoilage.
   - Shortages post requests as today. `logistics.ts` carts draw from site stores.
4. **Clock, fast-forward and LOD.**
   - Add `civic/clock.ts`.
   - Wire it into `WorldScene.rest()` (`app/shell.ts`), `play-session` journey / `journeyDistrict` / `enterDistrict`, `realm.catchUp` and `realm-away.ts`.
   - Add a "wait / skip N days" verb.
   - Cost-cap test: a 100-day skip must fit the budget. Copy the method from the root `scripts/perf-dawn.mts` (v1) into a new `game/scripts/perf-civic.mts`.
5. **Player verbs and UI.**
   - Site ring chips: Manage, Hire/Fire, Set wage, Stock, Sell.
   - A noticeboard "Sites" tab and an extended `panels/company.ts`.
   - Provider through `play-session/action-providers.ts`, verbs registered in `sim/contrib/index.ts`.
   - Draw plots and sites with their staffing state (`world/things/plots.ts`, `world/things/facilities.ts`).
6. **Zoning, tiers, backstory.**
   - Zones on plots, council and leader decisions, tier unlocks.
   - Pre-aged sites generated per district tier, with chronicle entries so progression "was always there".

**Following pass: districts as polities.**
- **District leaders** come from each seat's doctrine. Generated districts already seed one doctrine with a leader at the seat (`doctrine-tick.ts`).
- **Letters between leaders** travel over trunk roads, reusing the realm inbox (`realm-away.ts`), `road-journey.ts` and the `letter-replies.ts` patterns, in a new `civic/district-letters.ts`.
- **Relations:** each district pair is at peace, cooperating or at war, built on top of `economy/polity.ts`.
- **War** draws on barracks, food stores and levied workers. The player can broker, join, or profit.
- **Hooks laid in slices 1–6:** the barracks kind, a leader on the Site and town, and a district relation stub.

## Critical files

- **New:** `game/src/sim/civic/*`, `game/src/data/civic/sites.json`, `game/scripts/check-civic.mts`, `game/scripts/perf-civic.mts`.
- **Change:**
  - `sim/economy/{companies,facilities,build-plans,workshops,village-economy,food-stock,logistics}.ts` (route through stores)
  - `sim/economy/mortality.ts` (manager succession)
  - `sim/realm.ts` and `sim/realm-away.ts` (catch-up)
  - `sim/play-session/play-session.ts` (journey, enterDistrict)
  - `sim/scenario/scenario-advance.ts` (one registration)
  - `sim/save.ts`, `app/shell.ts` (rest), `app/contracts.ts` (new API)
  - `panels/{board,company}.ts`, `world/things/{plots,facilities}.ts`
- **Reuse:**
  - `registerDawnTick`, `registerDawnLines`, `registerBoardPage`, `registerDevHook`
  - `deriveRng`
  - `goods/inventory.ts` helpers
  - `COMPANY` constants, `FACILITY_WORKERS.staffing`, `food-stock.ts` ration logic
  - the `economy-view.ts` read-model pattern
  - `town-roles.ts` (district roles), `town-plan.ts` (building spots)

## Verification

- **Gates** (CI runs these): `npm run game:check` (today only `tsc -p game/tsconfig.json`), `npm run game:build`, `npm run game:check-saves`, and `npx vite-node --config game/vite.config.ts game/scripts/uses-check.mts`.
- **`game/scripts/check-civic.mts`** (headless, follows `check-saves.mts`):
  - 30- and 120-dawn runs are byte-identical for a given seed.
  - Coin and goods conserve.
  - No site produces without a manager.
  - Unpaid and unfed workers leave.
  - A 100-day fast-forward matches stepping day by day within tolerance (full vs LOD) and stays under the time budget.
  - Old v1–v3 saves migrate.
- **Browser:** run a production build (`npm run game:build`, then serve the output). Drive it with Playwright through the `__hearth.dev` hooks (`rest`, `arriveAt`).
  - Confirm a site's ring, the Sites tab, "wanted: manager", and a manager taking the post after a rest.
  - Take a screenshot of a staffed site and an idle one.
  - In this environment, launch Chromium with `executablePath: '/opt/pw-browsers/chromium_headless_shell-1243/chrome-linux/headless_shell'`; the pinned Playwright expects a newer build.

## Open question: a Vitest suite for `game/src/sim/civic`

**Recommendation: add it, in slice 1.**
- The rebuild README tells agents not to write tests. The project's own rule (`PLAN.md`) is a 30-dawn deterministic test per phase, and conservation and determinism are exactly the properties a regression would silently break.
- Keep it small:
  - Add `game/vitest.config.ts` including `game/tests/**/*.test.ts`, and an npm script `game:test`.
  - Add it to `game:check` so CI runs it.
  - Cover pure modules only: store put/take/move conservation, the site loop on a tiny hand-built state, and clock full-vs-LOD tolerance.
  - `check-civic.mts` stays the whole-world proof.
- Update the README line so it allows tests under `game/tests/`.
