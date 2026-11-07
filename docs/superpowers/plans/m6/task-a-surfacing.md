# Task A: Surfacing

> Part of [M6 Feel & Polish](./index.md). Spec: DESIGN.md §2.6, `docs/art/VISUAL_LANGUAGE.md`, `UI_JUICE_SPEC.md`.

**Goal:** Everything the sim already emits becomes visible through a person's line, a tell, or town color. No popups.

**Juice ids that exist today (grep `pushJuice(` in `src/sim/`):** `person.reaction` (payload `source: 'unspoken'` for Blessings and Burdens), `letter.deliver`, `rumor.spread`, `packet.emit`, `packet.deliver`, `doctrine.{voice,exposed,suppressed,swap,collapse}`, `notoriety.{rise,attractor}`, `stash.theft`, `person.reignite`, `site.kindle`, `refusal.coal_flicker`, `route.break`, `encounter.spawn`, `mark.applied`, `status.gain`, `spark.spend`, plus data-driven economy LOD ids (`economyLod.juice.*`).

**Files:**
- Create: `src/ui/surface/reaction-lines.ts` (pure: juice event -> `{personId, line, tell}`; line from payload `line`, else `src/data/dialogue`), `src/ui/surface/index.ts`
- Create: `src/render/despair-tint.ts` (pure: `town.despair` 0..1 -> saturation multiplier; builds on the `warmth-palette` seed in Task C's `wip` patch)
- Create: `src/ui/succession-screen.ts` (DOM overlay; copy from `getUi()` in `src/sim/succession.ts`, never hard-coded)
- Modify: `src/render/overworld-scene.ts`, `town-scene.ts`, `painters/` (per-town tint, speech bubble over `personId`), `src/render/feel.ts` (tint tunables), `src/main.ts` (subscribe adapter)
- Tests: `tests/ui/surface/reaction-lines.test.ts`, `tests/render/despair-tint.test.ts`, `tests/ui/succession-screen.test.ts`, `tests/e2e/m6-surfacing.spec.ts`

## Tests first

1. Coverage test: every juice id above maps to a presentation (line/tell/tint) or is listed as `silent`; fails if a new `pushJuice` id in `src/sim/` is in neither list.
2. `person.reaction` with `source:'unspoken'` shows the line over that person only, once per event, queued (max 1 bubble per person).
3. `letter.deliver` / `rumor.spread` show as the recipient's line, not a toast; `doctrine.*` as a town-voice line from `personId`; `notoriety.rise` / `stash.theft` as nearby NPC glances/gossip lines.
4. `despairTint(0) === 1` (full color), monotone decreasing, floor >= 0.25 (never fully grey); per-town, not global.
5. On `person.reignite` / `site.kindle` the town tint animates back toward its new despair over the `FEEL` duration; headless test with fake clock.
6. Succession screen: body `Your fire went out. Someone remembers it.`, buttons `[Carry it on]` (default focus) and `[Let it rest]`; quit is visible, same size class, no warning or confirm-shame copy.
7. Playwright: screenshot a town at despair 0.9 vs 0.1 (mean saturation differs beyond a threshold); a post-reignite shot is closer to the 0.1 one; succession overlay screenshot.

## Acceptance

- A 30-dawn seeded Playwright session shows at least one line per category (reaction, letter, doctrine, notoriety) over a person; zero popups/modals except succession.
- Desaturation visible per town and reverses on reignite. `npm run validate && npm test && npm run build && npx playwright test tests/e2e/m6-surfacing.spec.ts` green.

## Out of scope

New dialogue authoring beyond fallback lines (content), audio (Task C), save UI (Task B), balance.

## Open questions

- `person.reaction` `source:'unspoken'` has no tell art in `UI_JUICE_SPEC.md`; propose a faint ember pulse beside the bubble.
- Economy LOD juice ids are data-driven; confirm they surface (caravan glimpse) or are deliberately silent.
- DESIGN.md gives no despair-color numbers; the 0.25 floor is a proposal.
- Hoarder spec §7 says succession UI is unchanged yet mentions "optional branch copy"; DESIGN.md §2.6 locks the copy, so this task adds none.
