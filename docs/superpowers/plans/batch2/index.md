# Batch 2

Batch 2 has two parts. First, a revamp of the GUI, the interaction system and item interactions. Then every tech-tree node that batch 1 unlocked.
Each wave below is one `/batch` run. Paste the fenced block from that wave's file. A wave starts only after the previous wave's PRs are merged and main passes the gate.

| Wave | File | Units | What it delivers |
|---|---|---|---|
| 0 | (done in session) | — | Staged work landed. Seams: `registerDawnTick` (`src/sim/dawn-ticks.ts`) and `registerDevHook` (`src/render/dev-hooks.ts` + `src/render/dev/index.ts`). Map tests green (K4). |
| A | [wave-A.md](wave-A.md) | 2 | Revamp core: R1 UI kit + HUD, R2 one interaction model |
| B | [wave-B.md](wave-B.md) | 3 | Revamp finish: R3 items + inventory, R4 surfacing, R5 touch |
| 1 | [wave-1.md](wave-1.md) | 18 | Unlocked feature nodes on the new seams |
| 2 | [wave-2.md](wave-2.md) | 8 | Nodes that build on wave 1 |
| 3 | [wave-3.md](wave-3.md) | 1 | Seasons and weather |

## The vision the revamp serves
Sources: `docs/DESIGN.md`, `docs/superpowers/plans/m6/{index,tangible-aesthetic}.md`, `docs/superpowers/specs/2026-11-06-interaction-model.md`, `docs/art/{UI_JUICE_SPEC,STYLE_SPEC_2.5D,PALETTE}.md`.
- **Change comes through acts** on people and things, never by spending a meter or pressing a menu button.
- **News comes through people** (lines, tells, posture, colour), never popups. The succession screen is the only modal.
- **Direct manipulation:** click or tap the thing itself, and it shows its own short ring of verbs.
- **Minimal HUD:**
  - spark at top-left, with a gold fill and a cyan outline
  - day and phase at top-centre, muted
  - a letter chip at the screen edge
  - satchel, noticeboard and trade open as slim side sheets, never near-fullscreen
- **No clutter:** no overlapping panels, no corner text log, no paging rings.
- **Every action works on touch.** A phone can play everything.
- **Despair is a palette shift,** never a translucent overlay.
- **Every thing has at least two uses**, with a supply and a demand.

## Unit contract (every unit, every wave)
- **Branch and PR:** branch `claude/batch2-<wave><NN>-<name>`, cut from current main, with a PR to main. Never force-push.
- **Tests first:**
  - unit tests under `tests/` mirroring `src/`
  - a 30-dawn deterministic test for any sim system: run it twice and compare with `toEqual` (pattern: `tests/sim/hoard/followups-e2e.test.ts`)
  - one `tests/e2e/<unit>.spec.ts` that boots through `tests/e2e/support/game.ts`, drives the game with `window.__hearth.dev.*`, and asserts `errors` is empty
- **Before the PR:** run `npm run validate`, `npx tsc --noEmit`, the unit's own vitest files, and its own e2e spec (`npm run build && npx playwright test tests/e2e/<spec> --trace off`). Don't run the full suites.
- **Seams instead of hotspot edits:**
  - Dawn systems: `registerDawnTick(slot, id, fn)`. Slots: season, people, relations, roads, prices, late.
  - Dev hooks: `registerDevHook(name, factory)` in a module imported from `src/render/dev/index.ts`.
  - Ring actions, board pages and dawn lines: a module in `src/sim/contrib/`, imported from `src/sim/contrib/index.ts`.
  - Index files are append-only: one import line per unit.
  - New saved state: an optional field on `SimState` in `src/sim/types/runtime.ts`, created lazily (`state.x ??= …`). `save.ts` copies it automatically.
- **House rules:**
  - Through people, never popups.
  - Never branch on `archetypeId`; read trait fields.
  - Change happens only through acts.
  - Neglect and quitting are never shamed.
  - Use deterministic RNG through `deriveRng`.
- **Own only the files listed for your unit.** If you must touch another unit's file, keep the edit to a few lines and say so in the PR body.
- **PR body:** list the tree nodes delivered, what the player now sees, the tests added, and any cross-unit touches.

## After each wave (in the main session)
1. Merge PRs in the order listed in the wave file. Resolve the one-line conflicts in the index files and `runtime.ts`.
2. Run the gate on main: `npm run check && npm run build && npm run test:e2e`. Fix regressions in one follow-up PR.
3. Revamp waves only: run `npm run qa:shots` at desktop size and at phone size (375×812). Check:
   - no overlapping panels
   - nothing modal except succession
   - every action reachable by touch
4. Update PLAN.md Status, `CLAUDE_HANDOFF.md`, and both tech-tree artifacts:
   - full tree: https://claude.ai/artifact/GJP1NERWGroi7VKmtgPUqU
   - Foundation: https://claude.ai/artifact/GxqQjXtkqueSb2m7AwHmoB
   
   Set node statuses and mark the nodes that newly unlock.
5. After the last wave, re-enable auto-sync: `schtasks /change /tn "Gamerepo99 sync" /enable`.
