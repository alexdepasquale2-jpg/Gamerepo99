# M6 Tangible + Aesthetic audit

Goal: direct manipulation (click/drag/hover the thing) and real items visibly created by and tied to interactions.

## (a) Current state
- Items are counts only: `Record<itemId, qty>` (`src/sim/goods/inventory.ts`, `src/data/items/items.json`: bread, fish, wood, letter, keepsake, coin...). No item identity (a given loaf, who baked it).
- Deeds (`deed-goods.ts`: gift, trade, carry, work_alongside) move counts and return a text line; no world object appears.
- Inventory UI (`render/goods/inventory-ui.ts`): hotbar + panel from Phaser primitives (circle/rect icons); click selects, no drag, no hover tooltip.
- Choices go through `action-ring.ts` (hover tint, click) and `ui/method-menu.ts` (text list "method -> person"); no drag-to-person.
- Letters: DOM list in `correspondence-ui.ts`; the letter is a row, not a paper object in hand or at the door.
- Interiors (`render/interior-room.ts`, 520 lines): props drawn incl. lantern, but static decoration, not state (no lit/unlit, no player stash chest).
- Hoard stash is sim-only (`sim/hoard`, `economy/stash-sites.json`); nothing visible in the overworld.
- World nodes (`nodes-layer.ts`) and crates (`caravan-crates.ts`) are the only tangible persisted objects.
- Tests cover sim/ui/render logic; e2e screenshots only for menus, surfacing, interiors, overworld.

## (b) Gaps, ranked
1. Gifts/trades are invisible: no item travels hand->recipient or drops on the ground. Biggest feel loss.
2. Inventory is not directly manipulable: no drag to person/ground, no hover info, placeholder icons.
3. Stash is not a thing: no chest at stash sites, no place/open by clicking it.
4. Letters are a menu, not objects: no sealed letter with recipient name in inventory.
5. Lantern/hearth state not tied to the player: lit/unlit not shown, no "light it" interaction.
6. Method menu is text; the clicked thing should show its own verbs (hover glow, ring anchored to it).

## (c) Tasks (one low-effort agent each; tests first)
### T1 Item instances + provenance
- Files: `src/sim/goods/inventory.ts`, `deed-goods.ts`, `src/sim/save.ts`, new `src/sim/goods/instances.ts`.
- Tests first: `tests/sim/item-instances.test.ts`: a gifted bread keeps `{id, madeBy, townId, dawn}`, survives save/load, counts still match `inventoryOf`.
- Accept: unit test green; `listStacks` unchanged for existing callers.
### T2 Visible gift/trade handoff
- Files: `src/render/goods/overworld-goods.ts`, `living-world.ts`, `src/render/feel.ts`.
- Tests first: `tests/render/handoff.test.ts` for a pure `handoffPath(from,to)` easing fn; then wire to a `gift_give` result.
- Accept: Playwright `tests/e2e/tangible-gift.spec.ts` screenshot mid-handoff shows the item sprite between player and villager.
### T3 Drag from hotbar to person / ground
- Files: `src/render/goods/inventory-ui.ts`, `overworld-goods.ts`, `src/sim/goods/item-use.ts`.
- Tests first: `tests/ui/inventory-drag.test.ts`: pure `resolveDrop(stack, target)` -> gift_give / drop / none, reusing existing deeds.
- Accept: e2e drags bread onto a villager, count -1, reaction line appears; hover tooltip shows name and qty.
### T4 Stash chest at stash sites
- Files: `src/sim/hoard/*` (read), `src/render/goods/nodes-layer.ts` and `node-textures.ts` (reuse node sprite pattern).
- Tests first: `tests/render/stash-chest.test.ts`: sites holding coin yield a chest descriptor; a lost stash removes it.
- Accept: e2e screenshot shows a chest at a stocked site; click triggers the existing stash action.
### T5 Letter object + lantern state
- Files: `render/goods/correspondence-ui.ts`, `inventory-ui.ts` (letter icon with recipient label), `render/interior-room.ts` lantern case (lit flag from state), `sim/goods/item-use.ts`.
- Tests first: `tests/sim/letter-item.test.ts`: written letter adds a `letter` instance with recipient, delivery removes it; lantern lit flag persists in save.
- Accept: interior screenshot (extend `tests/e2e/interiors.spec.ts`) shows a lit lantern after use; letter slot shows recipient.

No new deps. Do T1 first; T2-T5 are then independent.
