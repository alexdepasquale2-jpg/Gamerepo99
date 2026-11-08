# Wave B: revamp finish (4 units; needs wave A merged)

Merge order: R3 items, R4 surfacing, R5 touch, then B04 reachability last, because it checks the other three.

Why B04 exists: Alex played the wave-A build and felt that the work from ~50 PRs was missing. Every batch-1 system runs, but in play it is buried. Verbs sit on ring pages 2–3. History, stash and patrons are chips 15–17. The power and road pages are noticeboard pages 4–5. Births, kin strain and happenings are 2.6-second corner lines. Land edits need the X key. Marks are a tiny glyph. B04 proves that each one is reachable and noticeable through real input.

```text
/batch Batch 2, wave B: finish the revamp of The Last Spark (items, surfacing, touch, reachability). Wave A has merged: src/ui/kit (tokens, side sheets, overlay stack) and the single interaction model (target kinds, focus resolver, two-level ring of at most 6 chips). Read docs/superpowers/plans/batch2/index.md first; its unit contract and house rules apply. Run exactly these 4 units in parallel, one branch and one PR each.

UNIT B01 "items" (branch claude/batch2-b01-items)
Goal: a full item-interaction pass where every item, resource node and animal has at least 2 real uses with a supply and a demand, and items are used through the same ring as everything else.
- Data: replace items.json `use` with a per-item `verbs` list: {id, label, target: self|person|hearth|tile|node|shrine|board|any, needs?, effect}. Effects reuse the existing paths: spark gain, gift affinity, hearth memory, land acts, deliver to town ledger, plan materials, and stash.
- Give every one of the 21 items at least 2 uses, taking the uses from the "Things and their uses" catalog in the full tech tree (https://claude.ai/artifact/GJP1NERWGroi7VKmtgPUqU, branch B10). Examples:
  - wood: burn at a hearth to warm a household, carry as firewood to someone cold
  - herbs: brew a remedy at a hearth, give to the sick, offer at a shrine
  - wool: give to a weaver, wear against the cold
  - keepsake: place at a hearth, return to its kin, lay on a grave
  - stone and timber: lay stones, mend a path, add to a build plan
  - tools: lend to a worker
  - pots: give to a new household
  - nails: fix a broken cart
  Keep it data-driven. Add new effect kinds only where none of the existing ones fit.
- Held item joins the ring: the selected hotbar item adds its matching verbs to the ring of whatever target is in focus (a verb family "Use <item>"). This replaces F-to-use, X-to-work-land and drag-to-gift as separate code paths. Keep drag-onto-target as a shortcut that calls the same verb. F stays as "use on self/here" and X stays as an alias for the tile verb, both through the same path.
- Hotbar (render/goods/inventory-ui.ts):
  - Selection sticks to an item id, not a slot index.
  - Coin leaves the hotbar and shows as a small purse readout next to the hotbar.
  - 9 slots, with keys 1-9 selecting slots only while no ring is open.
  - Stable order with no reshuffle when a stack empties.
- Satchel: the side sheet from wave A, with item verbs on long-press/right-click and the provenance tip (madeBy, town, sealed letter).
- Validator: in scripts/validate/, every item, resource node and fauna kind has at least 2 uses and at least 1 supply (a job, node, trader or verb output). Document the rule in the validator header.
- Owns: src/data/items/items.json, src/sim/goods/{item-use,inventory,deed-goods,nodes}.ts, src/data/world/resource-nodes.json, render/goods/inventory-ui.ts, render/goods/overworld-goods.ts drag code, src/sim/land-acts.ts entry points, and a new src/sim/contrib/item-verbs.ts.
- Done when:
  - The validator passes with the new ≥2-uses rule.
  - Each of the 21 items has a unit test for at least one verb.
  - tests/e2e/items.spec.ts selects bread, wood, stone and a keepsake and uses each on its target through dev.focus/dev.act and via the ring.
  - The old F, X and drag flows still work.

UNIT B02 "surfacing" (branch claude/batch2-b02-surfacing)
Goal: everything the sim says reaches the player through people and the world. There's no corner text log.
- Remove the top-left say() line and the 7-second controls blurb (overworld-scene.ts hint).
  - Controls hints become a one-time contextual tip at the focused thing, shown on first encounter only and remembered in localStorage.
  - Feedback (deed results, refusals, "can't do that") becomes a short tell over the player's or target's head.
  - Keep dev.lastSay() working: it returns the last tell text.
- Dawn lines (collectDawnLines, overworld-scene.ts ~711) are spoken as bubbles by the named person in the player's town who carries the news. Lines with no speaker go to the nearest villager. One queue, one at a time, with no corner text.
- One bubble style. Remove the second deed-fallback bubble (overworld-scene.ts:669-684) and the separate interior bubble, and use surface-layer.ts everywhere with kit tokens.
- Despair: replace the translucent grey circles (surface-layer.ts:105-111) with the per-pixel palette shift that docs/art/STYLE_SPEC_2.5D.md:22 and VISUAL_LANGUAGE.md describe. Use a camera/pipeline colour-matrix or per-sprite tint keyed by town despair; it must never look like a band or square.
- Owns: src/render/surface-layer.ts, src/ui/surface/reaction-lines.ts, the say/hint/dawn-line code in overworld-scene.ts, interior-room.ts bubbles, render/despair-tint.ts, src/data/dialogue/surface-fallbacks.json.
- Done when:
  - No screen-space text log remains.
  - tests/e2e/surfacing.spec.ts rests at a hearth and sees dawn lines as bubbles over people.
  - A refusal shows over a head.
  - A despairing town is palette-shifted with no overlay object in the scene list.
  - The existing specs that read dev.lastSay still pass.

UNIT B03 "touch" (branch claude/batch2-b03-touch)
Goal: the whole game plays on a phone, with no keyboard needed. This delivers tree nodes J12 (full touch play) and Foundation A12 (brood button on touch).
- A minimal context bar built with the kit, shown on touch devices (pointer: coarse) or at narrow widths: Act (= E on the focused thing), Satchel, Map, Letters and Menu. Five icons at most, along the bottom edge, never covering the hotbar.
  - The brood button shows only when the inhabitant is multi-body (inhabitant-body.ts isMultiBody).
  - Rest and work-land need no button; they come up through the ring on hearth and tile targets.
- Tap an item, then tap a target, to use it (same verb path as wave B items).
- Long-press shows chip tips.
- Interiors work by tap too (updateRoom, exit mat).
- Expose the scene actions the bar needs as methods; don't duplicate logic.
- Owns: a new src/ui/touch-bar.ts, small additions in overworld-scene.ts and interior-room.ts (public action methods only), and the main.ts mount line.
- Done when tests/e2e/touch.spec.ts at a 375x812 viewport (mobile emulation in Playwright) does all of this without key presses:
  - opens satchel, map and letters
  - acts on a person and a node
  - rests at a hearth
  - with the brood, splits the brood

UNIT B04 "reachability" (branch claude/batch2-b04-reachability)
Goal: every Live tech-tree node is something a player finds and notices in normal play, on desktop and phone. No tests: make the changes, run `npx tsc --noEmit` and `npm run build`, and open the PR.
- For each batch-1 feature, make it findable in at most 2 steps and on screen for at least about 4 seconds, through its own surface:
  - a ring family placement
  - a sheet tab
  - a world prop or tell
  - a first-encounter contextual tip at the thing (once per save, never a popup)
- Features:
  - refusal flicker and burnout (#39)
  - marks on people (#37)
  - power page (#41)
  - "ask about the old days" (#34)
  - births and newcomers at dawn (#36)
  - ask a favor / show up / empty cheer / return item (#47)
  - patron deals (#42)
  - hide coin and the stash chest (#44)
  - signpost road menu and hired travellers (#40)
  - land edits on a tile (#33): give them a ring verb on the tile in front of you, not only X
  - facility shifts (#43)
  - new world at New Game (#46)
  - kin strain talk (#32)
  - world file (#38)
  - authored moments (#35)
  - happenings (#45)
  - civic voice
  - notoriety
  - succession and heir
- Owns: small discoverability edits in src/sim/contrib/* labels and families, needs-board tabs, prompt and tip text. Don't restructure B01–B03 code.
- The PR body has a table of every feature → how a player reaches it now.
```
