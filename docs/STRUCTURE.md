# Hearthfall: The Last Spark — Structure

TypeScript + Vite + Phaser 3. Development prototype: logic first, polish later.

## Folder layout
```
hearthfall/
  src/
    sim/      Pure game logic. No Phaser, no DOM, no Math.random (use seeded RNG passed in).
      gen/      World generation (M2 Fabric): seeded, deterministic builders for regions, settlements, people.
                Same seed + same data = same world. Writes plain world state; no render/ui imports.
                Stage folders: load/ (load-*.ts tables), places/ (settlements/routes/facilities/biomes/gap-sites),
                society/ (history/kin/doctrines/people). world.ts + world-types.ts stay at gen/ root.
                Tests mirror under tests/sim/gen/{load,places,society}/. gen/ never imports dyn/.
      dyn/      Dynamism engine (M2 Fabric): prebaked tables, interpolation, assertions over live state.
                May import gen/ types and core sim; gen/ never imports dyn/.
      Both stay pure (headless-testable); tests mirror them under tests/sim/gen/ and tests/sim/dyn/.
      fabric.ts Public Fabric API facade (e.g. connectFabricApi for bots). Thin re-export shim; Probe hardcodes this path.
      fabric/ holds fabric-bake.ts (only place gen output and dyn are composed), fabric-bake-score.ts, and world-dump.ts; facade re-exports them.
      play-session/  Play + inspect session factory and act/boot/types helpers.
      travel/        Route tables, encounter rolls, travel state helpers.
      scenario/      Advance clocks (dusk/dawn/day) and scenario person resolve.
      Tests mirror under tests/sim/{play-session,travel,scenario}/ when dedicated.
    data/     JSON content (units, items, levels, tuning). No code. Large registries split by category (e.g. hooks/).
      Grouped by domain subfolders (final layout pending Loom's M2 data redesign).
      New tables go in the matching group; a new group needs a STRUCTURE.md line.
    render/   Phaser scenes, sprites, effects. Reads sim state, never mutates it directly.
    ui/       HUD, menus, input mapping. Sends commands to sim.
    main.ts   Entry: boots Phaser, wires sim + render + ui.
  tests/      Unit tests mirror src/ (tests/sim/combat.test.ts for src/sim/combat.ts).
    e2e/      Playwright browser tests (*.spec.ts). artifacts/ is gitignored.
    bots/     Automated playthrough bots (Probe).
  .superpowers/sdd/  Task briefs, reports, review ledger. Scratch (tmp/, *.diff, *.patch) is gitignored.
  assets/     Images, audio, fonts. vendor/*.zip archives are gitignored.
  scripts/    Dev tooling (validate-data.mjs). Not shipped.
  docs/       STRUCTURE.md, DESIGN.md, SCHEDULE.xlsx
    superpowers/plans|specs/  Dated plans and specs (YYYY-MM-DD-name.md).
    art/      Reference art (palettes, swatches, mockups, MOODBOARD/PALETTE notes). Game assets go in assets/.
    qa/       QA notes and playtest reports (reports/). QA write-ups live here, not at docs/ root.
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
10. Author followed superpowers: spec and plan exist in docs/superpowers/, tests came first, report lists skills used.

## Team schedule (docs/SCHEDULE.xlsx)
- One tab per teammate; `Overview (Niblet)` is Niblet's only.
- Edit ONLY your own tab: append a row (Date, Task, Milestone, Status, Progress %, Blockers, Next step, Notes) when you start, progress on, or finish work.
- Use openpyxl: load, edit your sheet, save immediately. Never hold the file open or rewrite other tabs.
