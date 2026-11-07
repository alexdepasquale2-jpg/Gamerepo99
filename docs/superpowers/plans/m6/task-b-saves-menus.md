# Task B: Saves, menus, world files

> Part of [M6 Feel & Polish](./index.md). Spec: M5 async-legacy spec §6, DESIGN.md §2.6.

**Goal:** Save/load menu, title and pause menus, and import/export UI for M5 versioned world files.

**Current state:** `src/sim/save.ts` has `SaveBlob` (version 1: seed, tick, npcs, optional `unspoken`, `coin`, `hoard`) with pure `serializeSave`/`parseSave` (no validation). `src/ui/local-storage-save.ts` is a single-slot adapter on key `the-last-spark:m1`. M5 Task C adds sim-side export/import world-file functions that this task calls.

**Files:**
- Create: `src/ui/menus/{title-menu,pause-menu,save-menu,world-file-menu}.ts` (slot list: name, day, town, last-saved), styles from `docs/art/PALETTE.md`
- Create: `src/ui/save-slots.ts` (multi-slot adapter, keys `hearthfall:save:<n>` plus an index; old `the-last-spark:m1` readable as slot 0)
- Modify: `src/ui/local-storage-save.ts` (delegate), `src/sim/save.ts` (add `validateSave` and version migration), `src/main.ts` (boot to title), `index.html`
- Tests: `tests/ui/save-slots.test.ts`, `tests/sim/save-validate.test.ts`, `tests/ui/world-file-menu.test.ts`, `tests/e2e/m6-menus.spec.ts`

## Tests first

1. Round trip: save to slot, reload, `SaveBlob` deep-equals (including `hoard`, `unspoken`).
2. `parseSave`/`validateSave` rejects non-objects and unknown future `version` with a friendly message; v1 without optional fields still loads.
3. Legacy key `the-last-spark:m1` migrates into slot 0 and is deleted only after the new save succeeds.
4. `localStorage` unavailable or quota exceeded: menu shows an in-world line, no crash, game continues (every access wrapped in try/catch).
5. Export downloads `hearthfall-<seed>-<day>.world.json`; import of a corrupt, foreign, or older-version file is refused with a message and state untouched; a valid import reproduces the same `contentHash` (M5 evidence check 3).
6. Pause menu is keyboard-operable (Esc, arrows, Enter) and pauses the tick loop; Resume restores exactly.
7. Title menu: Continue is disabled (not hidden) with no saves; quit copy never shames.
8. Playwright: title screenshot; new game -> pause -> save -> reload page -> Continue -> state matches; world-file export/import via `page.waitForEvent('download')` and `setInputFiles`.

## Acceptance

- Multi-slot save/load, title, pause, world import/export all work in Chromium; `npm run validate && npm test && npm run build && npx playwright test tests/e2e/m6-menus.spec.ts` green.
- Dawn autosave never overwrites a manual slot.

## Out of scope

Cloud saves, accounts, share sheet and static host (M8), curated legacy packs (M7), the succession screen itself (Task A; this task only wires "Carry it on" to the M5 heir flow).

## Open questions

- `SaveBlob` stores only seed/tick/npcs; confirm it can restore full `SimState` (town stock, doctrines, packets) or whether saves must replay seed + action log. Possible spec gap.
- Async spec §6 puts import/export UI in M5; M5 index defers it here.
- Is autosave in scope (DESIGN.md silent)? Proposed: dawn autosave to a reserved slot.
