# Hearthfall — Structure

TypeScript + Vite + Phaser 3. Development prototype: logic first, polish later.

## Folder layout
```
hearthfall/
  src/
    sim/      Pure game logic. No Phaser, no DOM, no Math.random (use seeded RNG passed in).
    data/     JSON content (units, items, levels, tuning). No code.
    render/   Phaser scenes, sprites, effects. Reads sim state, never mutates it directly.
    ui/       HUD, menus, input mapping. Sends commands to sim.
    main.ts   Entry: boots Phaser, wires sim + render + ui.
  tests/      Mirrors src/ (tests/sim/combat.test.ts for src/sim/combat.ts).
  assets/     Images, audio, fonts.
  docs/       STRUCTURE.md, design notes.
  README.md   What it is, how to run, how to test.
```

## Module boundaries
- `sim` imports only `sim` and types from `data`. It must run headless under tests.
- `render` and `ui` may import `sim` (read state, issue commands) and `data`.
- `render` and `ui` do not import each other; share via sim state or a small event bus in `src/sim/events.ts`.
- `data` is plain JSON with a matching type in `src/sim/types/`. Validate on load.
- Nothing imports from `tests/`.

## Naming
- Files: `kebab-case.ts`. Phaser scenes: `*-scene.ts`. Tests: `*.test.ts`.
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
