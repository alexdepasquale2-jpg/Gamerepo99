# Wave A: revamp core (2 units)

Merge order: R2, then R1. R1 rebases on R2 for the shared lines in `overworld-scene.ts`.

```text
/batch Batch 2, wave A: revamp the GUI kit and the interaction system of The Last Spark. Read docs/superpowers/plans/batch2/index.md first; its unit contract and house rules apply to every unit. Run exactly these 2 units in parallel, one branch and one PR each.

UNIT A01 "ui-kit" (branch claude/batch2-a01-ui-kit)
Goal: one visual system and a minimal HUD that match docs/art/UI_JUICE_SPEC.md, STYLE_SPEC_2.5D.md and PALETTE.md.
- Add src/ui/kit/: theme tokens taken from PALETTE.md (one module; no hard-coded hex colours elsewhere); one panel/side-sheet component for DOM; a matching Phaser panel helper; one DOM layer that is sized and positioned over the 640x360 Phaser.Scale.FIT canvas, so DOM and canvas line up at any window size.
- Add one event-driven overlay stack (open, close, Esc/back, focus trap, pause-scene flag). Remove the setInterval polling for the succession screen, hoard ending and the menu button (main.ts:73-93, game-flow.ts:146-156). Remove document.body.dataset.hfLocalOverlay and querySelector('.hf-menu') checks.
- Move these onto the kit: src/ui/menus/* (title, pause, save/load, world file, inhabitant, world pick), road menu, brood menu (inhabitant-body.ts menu), letters (render/goods/correspondence-ui.ts, currently a <dialog>), succession screen, hoard-ending screen, dev menu.
- Turn the noticeboard (render/goods/needs-board.ts, 600x340), caravan trade (caravan-trade-ui.ts) and satchel panel (inventory-ui.ts panel only, not the hotbar) into slim side sheets of at most ~40% of the screen width, so the world stays visible.
- HUD: the spark bar keeps the top-left; add the cyan outline (feel.ts outlineColor is unused today). Move "Day N" (game-flow.ts:26) to top-centre, muted, with the day phase. Make the unread-letters badge a small edge chip. Nothing else stays permanently on screen except the minimap and hotbar.
- Delete dead code: src/ui/hud.ts and src/ui/method-menu.ts (and their registry lines in main.ts).
- Owns: src/ui/**, src/main.ts, src/ui/game-flow.ts, the board, trade, satchel-panel and letters UI files, inhabitant-body.ts menu(), createSparkHud in overworld-scene.ts.
- Does not touch: overworld-scene.ts interact/openRing/chipsFor/prompt code, action-ring.ts, src/sim/play-session/**.
- Done when: every menu and panel uses the kit; no setInterval UI polling is left; e2e tests/e2e/ui-kit.spec.ts opens each sheet and menu and checks that none overlaps the spark bar or another open sheet; existing e2e specs that open menus still pass (title/new game, pause/save, board, trade, letters, road menu).

UNIT A02 "interactions" (branch claude/batch2-a02-interactions)
Goal: one interaction model, where you click or press E on any thing and it shows its own short verb ring (docs/superpowers/plans/m6/tangible-aesthetic.md:3,22; specs/2026-11-06-interaction-model.md).
- Target model: extend src/sim/play-session/action-providers.ts so a provider declares target kinds: person, node, facility, board, wagon, signpost, door, hearth, chest, ground-item, plot, tile, fauna. Each provider has list(state, target) and act(state, actionId, target). Keep person providers working unchanged.
- One focus resolver in the scene picks the single thing in front of the player (nearest in facing direction, with a fixed priority among ties). Use it for E, Enter and tap, and also to draw the single world prompt. Replace the separate prompts: people "…", hearth "…", "E gather", "E · Enter", facility "E  Work a shift", "Needs · E", "Roads · E" and "Trader · E". Fix the bug where "E gather" shows while E opens a person.
- One ring anchored to any target (render/action-ring.ts), with two levels: verb families first (Speak, Help, Give, Promise, Work, Trade, Ask, …, taken from the deeds' data), then the verb. At most 6 chips are ever visible, with no "More…" paging and short labels (at most ~16 chars; the long form goes in a hover/long-press tip). Number keys pick ring chips only while the ring is open.
- One verb set:
  - Remove the 5 legacy method chips (Inspire, Carry burden, Challenge, Shame, Lie; VERB map in overworld-scene.ts:48-51) as separate chips.
  - Surface talk_gentle as "Speak gently", talk_hard as "Speak hard" and talk_hard_shame as "Shame them".
  - Remove the duplicates (carry_burden = favor_do, challenge = stand_up).
  - Keep migration.json and the old method ids accepted by session.act, so old saves, e2e specs and bots still work.
  - catalog.json choiceSetId: use it for the families or drop it.
- Fold the object paths into verbs on their targets, all through session.act so juice, ripples and the delta log apply:
  - gather on node
  - work a shift on facility
  - read on board (opens the kit sheet)
  - trade on wagon (opens the trade sheet)
  - take a road on signpost
  - enter on door (keep canEnterBuilding)
  - rest on hearth
  - the stash verbs on chest (replace the direct applyStashAct click in stash-chest.ts:68)
  - pick up on ground item
  Interiors use the same ring and resolver (interior-room.ts openRoomRing).
- Performance: cache listed actions per focused target and rebuild only on focus change, act or dawn. Stop calling listActions() over the whole world every frame (people-layer.ts:249-258, overworld-scene.ts hasActions). listActions(personId) should build for one target only.
- Keep window.__hearth.dev.ring(personId), chips(personId), board, work, travel and facilities working with the same act ids. About 23 e2e specs use them. Add dev.focus() and dev.act(targetRef, verbId) through registerDevHook.
- Owns: src/sim/play-session/play-session-act.ts, action-providers.ts, deed-verbs.ts, src/sim/contrib/{stash,patrons,history,facilities,core}.ts (only their provider shape), src/render/action-ring.ts, the interact/openRing/chipsFor/openRoomRing/prompt code in overworld-scene.ts and interior-room.ts, stash-chest.ts, nodes-layer.ts prompts, src/data/systems/interactions/*.json and scripts/validate/interactions.mjs.
- Does not touch: src/ui/** (A01), item data or item-use (wave B).
- Done when:
  - Every interactable kind opens its ring through the same path.
  - No ring shows more than 6 chips.
  - The 5 method chips are gone, but the old ids still resolve.
  - The frame profile no longer shows listActions per villager per frame.
  - Unit tests cover the resolver priority and the family grouping.
  - tests/e2e/interactions.spec.ts drives a person, node, board, wagon, signpost, door, hearth and chest through dev.focus/dev.act.
  - All existing e2e specs that use dev.ring/dev.chips still pass.
```
