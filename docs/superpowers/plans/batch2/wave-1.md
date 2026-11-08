# Wave 1: unlocked feature nodes (18 units; needs waves A and B merged)

Merge order: 07, 08, 01, 02, 03, 04, 05, 06, 10, 11, 12, 13, 14, 18, 09, 15, 16, 17. Sim units first, render last; 17 (saves) goes last so it can fixture the final save shape.

```text
/batch Batch 2, wave 1: build the newly unlocked tech-tree nodes of The Last Spark on top of the revamped seams. Read docs/superpowers/plans/batch2/index.md first; its unit contract and house rules apply to every unit.

Use these seams:
- registerDawnTick (src/sim/dawn-ticks.ts) for dawn systems
- registerDevHook (src/render/dev-hooks.ts, imported from src/render/dev/index.ts) for QA hooks
- target-kind action providers and the focus resolver for verbs on people and things
- item verbs in items.json
- the kit side sheets for any panel
- bubbles over people for news

Do not add corner text, popups or one-off key bindings. Run exactly these 18 units in parallel, one branch and one PR each.

U01 "composer" (claude/batch2-101-composer), node A12
- Add composeInhabitant(data, parts) in src/sim/inhabitant.ts. Parts: embodiment, perception, method modifiers, spark profile, personal-cost/refusal/legacy hooks, start rule. assembleInhabitant becomes a thin wrapper over it.
- Store sparkProfileId (or parts) on Inhabitant (types/runtime.ts). Fix succession.ts burnoutAtFor/emberZoneBelowFor, legacy/imprint.ts and method-reactions.ts pickRefusalLine so they read parts, not archetypeId.
- Done when: a composed inhabitant plays 30 dawns deterministically, and all 4 archetypes still assemble the same as before (golden test).

U02 "body-starts" (claude/batch2-102-body-starts), node A10
- Each body gets its own starting place, first people and first problem. archetypes.json gets a start rule by tag (den near hills, ledger office in the largest town, warm rock, mill row), not a fixed town id.
- Resolve it in play-session-boot.ts pickTownId against generated settlements. Give each body its own opening moment in scenario/moments-live.ts. Update tests that assume Ashford.
- Done when: tests/e2e/body-starts.spec.ts starts each archetype and checks a distinct town or place and opening line.

U03 "body-acts" (claude/batch2-103-body-acts), nodes A9 and A11
- Body-only verbs, gated on trait fields (embodiment.tags, allowedApproachTags; never archetypeId), in contrib/body-acts.ts:
  - ogre: lift a stuck cart or wagon, carry heavy goods
  - clerk: read the ledger at a board
  - brood: split to watch a place
- Embodied access: move ENTRANCES (embodiment.ts) into data and read allowedApproachTags. The brood enters through vents and cracks, and the clerk is let into a new office/civic interior kind (map/interiors.ts, render/interior-room.ts).
- Done when: each body has at least 2 verbs only it can do, and e2e covers one per body.

U04 "voices" (claude/batch2-104-voices), nodes B12, C8, D7 (speech)
- Give all 60 generated villagers seeded wounds in play-session-boot.ts peopleFromWorld (deriveRng(seed, id, 'wound'), weighted by their vector). Backfill old saves in loadState.
- Generated villagers get a generic voice in dyn/line-select.ts. Reuse the genericKinStrainLine voice-hash pattern, compose opener/middle slots from fragments/generic_blend, and add fragments where coverage is thin.
- City, town and village speak differently: add a place:city|town|village tag and bias.
- Done when: no generated villager falls back to the surface-fallbacks "unspoken" lines in a 30-dawn bot run, and method chemistry fires on generated people.

U05 "people-looks" (claude/batch2-105-people-looks), nodes B11, D7 (look/tempo), Foundation E5
- Marks show in posture, colour and greeting (render/people-layer.ts, mark-tells.ts): hollowness slouches and greys, dependence follows you, growth stands taller. Give each a greeting line on approach.
- City, town and village people get a palette and wander tempo per settlement kind.
- Each town's doctrine leader carries a small mark by the name: leadersByTown helper next to power-page.ts leaderOf.
- Done when: e2e screenshots show each mark state and a leader marker; unit tests cover the look mapping.

U06 "legitimacy" (claude/batch2-106-legitimacy), node E3
- Townsfolk grumble or praise the leader by legitimacy band. These are dawn lines and occasional bubbles from named people, via contrib/legitimacy-voices.ts.
- Add a board notice of promises kept and broken to power-page.ts.
- Done when: a 30-dawn run with a collapsing doctrine produces grumbling lines through people.

U07 "one-food" (claude/batch2-107-one-food), node F6
- Merge the two food stocks: the village ledger (village-economy.ts goods bread/fish/berries/grain) and state.towns[id].stock.food_grain (economy-lod.ts).
- Despair reads the ledger's food cover / short.food. deed-goods.ts deliverToTown stops writing both stocks. Caravans, patrons, journey and facilities write to the one stock.
- Update scripts/validate/economy-lod.mjs, which pins food_grain.
- Done when: a 30-dawn test shows a town that runs short of food rising in despair, and the existing hoard/neglect tests still pass.

U08 "mortality" (claude/batch2-108-mortality), node F11
- Add economy/mortality.ts, registered with registerDawnTick('people'): aging, retirement and death rolls (deriveRng), calling households.ts inheritFrom.
- Remove the dead from companies, facilityStaff, kin.households and people. The people layer drops their sprites.
- Kin and neighbours tell the news at dawn. Reuse legacy graves for a burial record.
- Done when: a 240-dawn deterministic test shows deaths, inheritance of claims/plans/company, and no dangling ids.

U09 "l4-tiles" (claude/batch2-109-l4-tiles), node F15
- Add an L4 detail level under L3 in map/ladder/refine.ts (per-tile detail: ground variants, edges, small props) through stamp-raster.ts and chunk-layer.ts.
- Keep within the chunk budget (tests/sim/map/ladder/native-source.test.ts). Update the golden ASCII.
- Done when: chunks show L4 detail, the budget test passes and the goldens are updated.

U10 "workshops" (claude/batch2-110-workshops), node F20
- The player can start a build plan on a plot, own the finished building's company, hire and let go workers, and pay wages from their coin (build-plans.ts, companies.ts with ownerId 'player').
- Verbs go on plot and person targets. Add a company sheet in the kit and a board page line.
- Done when: a 60-dawn test where the player founds, staffs and pays a workshop is deterministic, and unpaid workers quit.

U11 "road-upkeep" (claude/batch2-111-road-upkeep), nodes G5 and G6
- Roads wear down from traffic, break below a threshold and get mended by waystation crews and players with stone and timber, through tile/road verbs. This is economy/roads.ts on registerDawnTick('roads').
- The player can escort a village cart: a verb on the cart; escortedBy cuts the hazard in logistics.ts; travel alongside it via journey.ts.
- Draw carts in the world (render/goods/living-world.ts), not only on the map.
- Done when: a 30-dawn test shows decay, a break and a repair, plus an e2e escort.

U12 "waystations" (claude/batch2-112-waystations), node G8
- Waystations and roadside inns become places to rest, hear rumors (from letters, happenings, history) and hire help (travel-trades escort_watch/guide_local). These are facility-target verbs in facilities.ts and contrib/facilities.ts.
- A journey can stop at a waystation partway (travel/journey.ts).
- Done when: e2e rests at a waystation mid-route and hears a rumor through a person.

U13 "visitors" (claude/batch2-113-visitors), nodes G7 and H9
- One shared helper spawns a temporary real person (PersonState with a reason, route and leave-by day) and removes them cleanly.
- People on the road: pilgrims from creeds, couriers, refugees from war or despair, pedlars from the economy.
- Notoriety brings thieves, beggars, petitioners and tax men to your town as people you can answer with verbs. Wire the attractors in notoriety.json that have spawn keys.
- Done when: a 30-dawn test spawns and despawns each kind deterministically, and e2e answers a petitioner.

U14 "legends" (claude/batch2-114-legends), node I8
- Stop dropping imported legends (ui/menus/world-file-menu.ts:76).
- Legends are spoken of: rumor and dawn lines from lg.legends via contrib/legends.ts.
- Graves are drawn as props you can visit (a grave target with verbs: visit, lay a keepsake). Add a manifest entry and art from the existing packs.
- Done when: e2e imports a world file and hears a legend line and finds a grave.

U15 "music" (claude/batch2-115-music), node J7
- Add render/music.ts, a procedural or small free-asset score sharing the AudioContext and the N mute with sfx.ts. Credit any assets in CREDITS.md.
- Moods for day, dusk and dawn. The score thins in despairing towns and swells on a reignite.
- Done when: unit tests cover the mood selection and the e2e page has no audio errors.

U16 "stub-art" (claude/batch2-116-stub-art), node J3
- Fill the 25 stub entries in src/data/art/overworld-assets.json (biomes x4, ore x3, crops x5, cargo x4, caravaner, fauna x8) with proper frames from the credited packs already in assets/sprites/. Use status ready.
- Update tests/render/asset-manifest.test.ts and docs/art/OVERWORLD_ASSET_MAP.md.
- Done when: listStubKeys() is empty and a screenshot pass shows each.

U17 "saves" (claude/batch2-117-saves), nodes K8 and K5
- Refactor save.ts into a stepwise saveMigrations table like legacy/world-file.ts.
- Add golden old-save fixtures (v1, v2, v3) under tests/sim/fixtures/ that must keep loading.
- Add a test that fails when the SimState save shape changes without a version bump or migration.
- Add .github/workflows/ci.yml: npm ci, npm run check, npm run build, npx playwright install --with-deps chromium, npm run test:e2e.
- Done when: CI is green on the PR and the fixtures load.

U18 "living-land" (claude/batch2-118-living-land), nodes B10c and B10d
- Resource nodes get a second verb each (tend, plant a sapling, share a fishing spot, return a stray sheep) in goods/nodes.ts and resource-nodes.json.
- Add sim/fauna.ts: seeded animals in the world that you can interact with (hunt or snare, drive off a fox, return a pig, scare a heron), with effects on nodes and food.
- The fauna render becomes target-able.
- Done when: every fauna kind has at least 2 verbs (the B01 validator rule passes for fauna), and a 30-dawn test shows foxes and rabbits affecting farms deterministically.
```
