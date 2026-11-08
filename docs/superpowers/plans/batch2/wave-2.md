# Wave 2: nodes that build on wave 1 (8 units; needs wave 1 merged)

Merge order: 01, 02, 03, 04, 05, 08, 06, 07.

```text
/batch Batch 2, wave 2: build the next tech-tree nodes of The Last Spark on top of wave 1. Read docs/superpowers/plans/batch2/index.md first; its unit contract and house rules apply. Use the same seams as wave 1 (registerDawnTick, registerDevHook, target-kind providers, item verbs, kit sheets, bubbles over people). Run exactly these 8 units in parallel, one branch and one PR each.

U01 "succession-tells" (claude/batch2-201-succession-tells), nodes A8 and I4
- Any resident can carry the fire on. The heir is built from their own traits with composeInhabitant (wave 1 U01) through legacy/flow.ts carryItOn. legacy-world.json maps a person's wound, job and vector to parts.
- The succession screen names the heir and says what carried over: ember, reputation echoes, the rumor letter, dependence.
- "Let it rest" gets a short closing scene. Model it on hoard-ending-screen.ts, built with the kit.
- Done when: e2e burns out, carries on as a generated villager and sees the heir named; a second run lets it rest and sees the closing scene.

U02 "minds" (claude/batch2-202-minds), node C9
- state.minds per person: needs (food, warmth, kin, meaning), memories (who, what, where, which dawn), grudges and gratitude, and mood.
- Write after each act (play-session-interaction.ts). Tick on registerDawnTick('people'). Read in dyn/line-select.ts memoryTags so people bring up what you did.
- Show it only through lines and posture.
- Done when: a 30-dawn deterministic test passes, and an e2e person mentions a remembered act.

U03 "relations" (claude/batch2-203-relations), node C14
- NPC friendships, feuds, courtships and estrangements form on their own (social/relations-tick.ts on registerDawnTick('relations'), with a state.relations overlay).
- letters-scale.ts and kin-strain.ts edgesOf read the overlay. Courtship feeds the households.ts pairing. Mortality (wave 1) ends relations.
- Neighbours tell of them at dawn.
- Done when: a 120-dawn deterministic test shows edges forming and breaking, plus a household formed by courtship.

U04 "gap-drift" (claude/batch2-204-gap-drift), node D2
- The city-village gap moves in play: state.gapDrift per town, driven by trade flow, kin letters, migration pressure and bridge-style acts.
- townGap01(townId, state) carries the drift through kin-strain.ts, line-select.ts and coherence.ts. Settlement kind and layout stay frozen from the seed.
- People talk about the town changing.
- Done when: a 60-dawn test moves the gap both ways deterministically.

U05 "price-waves" (claude/batch2-205-price-waves), node F21
- A per-town price index spreads scarcity to road neighbours each dawn, weighted by leg days (economy/prices.ts on registerDawnTick('prices')).
- priceAt, caravan trade and the economy board page read it. Traders and townsfolk mention dear and cheap goods elsewhere.
- Done when: a 30-dawn test shows a shortage's price wave reaching the next town.

U06 "wealth-seen" (claude/batch2-206-wealth-seen), node H8
- visibleWealth counts carried coin, fine goods, owned workshops (wave 1 U10) and hired hands.
- The player's look changes with it (inhabitant-body.ts bodyLook: clothes, a larger home sprite).
- People react with envy, flattery and requests: lines plus visitor petitioners (wave 1 U13).
- Done when: tests cover the wealth bands, and e2e sees a flattering line at high wealth.

U07 "mount" (claude/batch2-207-mount), node G9
- Buy and own a mount or cart: state.mount, bought at a waystation or stable through verbs.
- It needs feeding from the town ledger (wave 1 one-food). It speeds journeys (journey.ts, embodiment walkSpeedMul) and adds carry capacity (inventory.ts).
- It can be stolen or lost on the road. Draw a sprite when riding.
- Done when: e2e buys, rides and feeds a mount, and a test loses it to a road encounter.

U08 "item-demand" (claude/batch2-208-item-demand), node B10b
- Every item has a buyer: town needs (goods/town-needs.ts) and per-person wants (from wound, job and minds) name the items they want.
- Gift affinity becomes per item, not only per table rule.
- Each item's wanted-by shows on the board's economy page and in what people ask for.
- Done when: the validator confirms every item has at least 1 demand source, and a 30-dawn test sees each item consumed somewhere.
```
