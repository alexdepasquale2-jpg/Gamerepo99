# v2: the unlocked tech-tree nodes

These are the nodes batch 1 unlocked, built on the v2 rebuild (`game/`). Units are grouped by area so parallel agents collide less. The tree pages are the full tree (https://claude.ai/artifact/GJP1NERWGroi7VKmtgPUqU) and the Foundation tree (https://claude.ai/artifact/GxqQjXtkqueSb2m7AwHmoB).

**Already delivered by the v2 rebuild:**
- every item, node and animal has two or more uses (B10 a/c/d/e)
- marks shown on bodies (B11)
- town looks and tempo (D7 look)
- leader marks (Foundation E5)
- music (J7)
- full touch play (J12, Foundation A12)

## Rules for every unit
- Read `game/README.md` and `game/src/app/contracts.ts` first.
- Branch `claude/v2n-<wave><NN>-<name>` from `origin/main`, with a PR to `main`. Never force-push. Don't merge your own PR.
- No tests. Before the PR, run `npm run game:check` and `npm run game:build`; both must pass.
- **Seams:**
  - dawn systems: `registerDawnTick(slot, id, fn)` (`game/src/sim/dawn-ticks.ts`; slots season, people, relations, roads, prices, late)
  - verbs: `registerTargetProvider` / person providers in a new `game/src/sim/contrib/<name>.ts`, imported from `contrib/index.ts`, which is append-only
  - QA hooks: `registerDevHook`
  - new saved state: an optional field on `SimState` (`game/src/sim/types/runtime.ts`), created lazily
- **The player must see every feature:**
  - news through people (`ctx.voice` or juice with fallback lines in `game/src/data/dialogue/surface-fallbacks.json`)
  - acts as ring verbs (at most 6 top chips; put verbs in the right family)
  - panels as `ctx.ui.sheet`
  - no popups, no corner text
- **Ownership:** keep edits inside your unit's files. When you must touch a shared file (`contracts.ts`, `runtime.ts`, `contrib/index.ts`, `surface-fallbacks.json`, `deeds.json` families), keep it to a few lines and say so in the PR.
- **Commits:** `git -c user.name=alexdepasquale2-jpg -c user.email=alexdepasquale2@gmail.com commit`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Wave 1 (8 units, parallel)

| # | Unit | Nodes | What the player gets |
|---|---|---|---|
| 11 | inhabitant | A12, A10, A9, A11 | Protagonist composer; each body starts its own way; body-only verbs (ogre lifts carts, clerk reads ledgers, brood watches); embodied access (vents, offices) |
| 12 | voices | B12, C8, D7 speech | Seeded wounds for all 72 residents; a generic voice for generated villagers; city/town/village speech |
| 13 | economy | F6, F20 | One food stock, so shortage raises despair; player workshops (found, hire, pay wages) with a company sheet |
| 14 | lifecycle | F11, I8 | Aging, retirement, death and inheritance; graves you can visit; legends spoken of; imported legends kept |
| 15 | roads | G5, G6, G8 | Roads wear and get mended; escort a cart; waystations to rest, hear rumours and hire help |
| 16 | visitors | G7, H9, E3 | Pilgrims, couriers, refugees and pedlars as real people; notoriety brings thieves, beggars and petitioners; townsfolk voice the leader's legitimacy |
| 17 | land-art | F15, J3 | L4 detail tiles; fill the 25 stub art entries from the credited packs |
| 18 | saves | K8, K5 | Stepwise save migrations with old-save fixtures; GitHub Actions CI running game:check and game:build |

## Wave 2 (after wave 1 merges)

| # | Unit | Nodes |
|---|---|---|
| 21 | succession | A8, I4: any resident as heir; the screen names the heir and what carried over; an ending after "Let it rest" |
| 22 | minds | C9: needs, memories, grudges, mood per person; people bring up what you did |
| 23 | relations | C14: friendships, feuds, courtship form on their own |
| 24 | gap-drift | D2: the city–village gap moves in play |
| 25 | prices | F21: price waves along the roads |
| 26 | wealth | H8: wealth people can see (look, envy, flattery, requests) |
| 27 | mount | G9: own a mount or cart that eats from the ledger |
| 28 | demand | B10b: every item has buyers (town and person wants) |

## Wave 3
| # | Unit | Nodes |
|---|---|---|
| 31 | seasons | F17: seasons and weather drive harvests, warmth, roads and travel; shown through the world and people |
