# Hearthfall: The Last Spark — Structure

TypeScript + Vite + Phaser 3. Development prototype: logic first, polish later.

## Folder layout
```
hearthfall/
  src/
    sim/      Pure game logic. No Phaser, no DOM, no Math.random (use seeded RNG passed in).
    data/     JSON content (units, items, levels, tuning). No code. Large registries split by category (e.g. hooks/).
    render/   Phaser scenes, sprites, effects. Reads sim state, never mutates it directly.
    ui/       HUD, menus, input mapping. Sends commands to sim.
    main.ts   Entry: boots Phaser, wires sim + render + ui.
  tests/      Mirrors src/ (tests/sim/combat.test.ts for src/sim/combat.ts).
    e2e/    Playwright smoke/playthrough specs (*.spec.ts). Artifacts gitignored.
  assets/     Images, audio, fonts.
  scripts/    Dev tooling (validate-data.mjs). Not shipped.
  docs/       STRUCTURE.md, DESIGN.md, SCHEDULE.xlsx
    superpowers/plans|specs/  Dated plans and specs (YYYY-MM-DD-name.md).
    art/      Reference art (palettes, swatches). Game assets go in assets/.
    archive/  Retired designs. Read-only; never imported.
  README.md   What it is, how to run, how to test.
```

## Module boundaries
- `sim` imports only `sim` and types from `data`. It must run headless under tests.
- `render` and `ui` may import `sim` (read state, issue commands) and `data`.
- `render` and `ui` do not import each other; share via sim state or a small event bus in `src/sim/events.ts`.
- `data` is plain JSON with a matching type in `src/sim/types/`. Validate on load.
- Nothing imports from `tests/`.
- Visual values (colors, sprite keys) belong in `render` or `data`, not `sim`.
- Browser I/O (`localStorage`, fetch, DOM) belongs in `ui/` or `main.ts` adapters — never in `sim`.
- JSON over 400 lines: split by category (e.g. `hooks/` folder).

## Naming
- Files: `kebab-case.ts`. Phaser scenes: `*-scene.ts`. Unit tests: `*.test.ts`. E2E: `*.spec.ts` under `tests/e2e/`.
- Types/classes: `PascalCase`. Functions/vars: `camelCase`. Constants: `UPPER_SNAKE`.
- Data files: `kebab-case.json`, one content type per file (`units.json`, `items.json`).
- One main export per file, named after the file.

## Size limits
- Soft cap 200 lines per file, hard cap 400 (split before merging past it).
- Functions: aim under 40 lines.
- Folder over ~12 files: group into subfolders by feature.

## Milestone review checklist
1. Layout matches this doc; no stray files at root or in the wrong folder.
2. `sim` has no Phaser/DOM imports and passes tests headless.
3. No `render` <-> `ui` imports; no circular imports.
4. Tuning numbers live in `data/`, not hardcoded in logic.
5. No file over 400 lines; anything over 200 has a reason.
6. No duplicates or dead code (unused exports, commented-out blocks).
7. Naming follows the rules above.
8. README and this doc are current; new folders are listed here.
9. `npm run build` and `npm test` pass.

## Team schedule (docs/SCHEDULE.xlsx)
- One tab per teammate; `Overview (Niblet)` is Niblet's only.
- Edit ONLY your own tab: append a row (Date, Task, Milestone, Status, Progress %, Blockers, Next step, Notes) when you start, progress on, or finish work.
- Use openpyxl: load, edit your sheet, save immediately. Never hold the file open or rewrite other tabs.
