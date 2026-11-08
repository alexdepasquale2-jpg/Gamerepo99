# Hearthfall (The Last Spark): Claude Code handoff

Everything is on `main` (https://github.com/alexdepasquale2-jpg/Gamerepo99). Start: `claude`, then "Read CLAUDE_HANDOFF.md and PLAN.md, then do <one task>". One task per session.

## Latest (Nov 8, 2026), read this first
- **Moving to a local PC.** Set up: `cd ~/Desktop && git clone https://github.com/alexdepasquale2-jpg/Gamerepo99.git && cd Gamerepo99 && npm install && npm run dev`.
- **On main:** vision archetypes (#28), shared seams (#29: action providers, board pages, dawn lines, ring paging, `PeopleLayer.sync`, `arriveAt`, `__hearth.dev`), consolidated testing (#31), batch 1 of 16 units (#32–#47), post-batch fixes (#48). Every non-locked node in both tech trees is Live. `PLAN.md` → Status has the details.
- **Tests:** `npm run check` (validate + tsc + vitest), `npm run test:e2e` (build + Playwright), `tests/README.md`. Playwright reads `E2E_PORT`, `E2E_REUSE_SERVER`, `PW_CHROMIUM_PATH` (locally you can leave these unset if Playwright's own Chromium is installed: `npx playwright install chromium`).
- **Last main run:** validate, tsc and build pass, and vitest is all green on the four fixed suites. e2e: everything passes except **two specs**. These are the next task:
  1. `tests/e2e/hoarder-path.spec.ts:17`: a `toBe(true)` check fails (received false). The likely line is `dev.ring(pid)` returning false, which means the ring did not open on the first person in the start town. Check `dev.ring` in the scene's dev hooks and whether that person is drawn/outside. Then check that the chest and the hoard-ending overlay still appear.
  2. `tests/e2e/inner-state.spec.ts:109`: `gained` is false. Three `challenge@<id>` acts at full spark no longer give `civic_voice`. Check that `challenge` is still offered and allowed for those folk (deed gates from batch unit 6, "missing verbs", may now block it), and check the `civic_voice` status rule.
  Run one spec: `npm run build && npx playwright test tests/e2e/<spec> --trace off`.
- **Next batch (queued, not started):** the newly unlocked nodes. Full tree: A8–A12, B10–B12, C8, C9, C14, D2, D7, E3, F6, F11, F15, F17, F20, F21, G5–G9, H8, H9, I4, I8, J3, J7, J12, K8. Foundation: A12, A13, B9, C7, E5, J7. The tech-tree pages are claude.ai artifacts: full tree https://claude.ai/artifact/GJP1NERWGroi7VKmtgPUqU, Foundation https://claude.ai/artifact/GxqQjXtkqueSb2m7AwHmoB.
- **Working style Alex asked for:** implement and push without running full test suites unless asked. Merge via PRs. Never force-push.
- The Gotcha below about a container Chromium mismatch only applies to cloud sessions (`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`).

## State (Nov 7, 2026)
- M1–M7 done earlier (sim, social web, hoarder/patrons/legacy, menus, mobile, bots). `PLAN.md` has history.
- Economy sim phases 1–8 done and on main, deterministic and tested: named jobs, village ledger (production, processing, demand, shortage pricing), logistics (requests, carts on roads), ambitions and build plans (plots, claims, labor), companies and wages, households and family lines (gifted births, inheritance), borders and claim disputes, light polity (diplomacy, war, tech, creeds). All NPC-run; the player only helps by gifting.
- Economy is shown on screen: noticeboard page 2 (E at a town board), plot markers in the world, M-map overlays (rings, treaty/war lines, carts).
- Checks at last commit: 628 unit tests, build, 15 e2e passing (1 skipped by design).
- Live private artifact of the game (mobile, on-screen keys): https://claude.ai/artifact/DLJdBXRYjMfUmQLpaQhhjw. Version 2 is the build of `main` at e1a7b48 (economy on screen). To refresh: `npx vite build --base=./ --outDir <scratch>/site`, wrap with the play page (on-screen keys), publish to the same URL; not yet tested on a phone.

## Where things are
- `src/sim/economy/`: `village-economy`, `logistics`, `build-plans`, `companies`, `households`, `borders`, `polity`, `economy-view` (pure read model for UI). Data: `src/data/items/{items,jobs,buildings,polity}.json`.
- Dawn order is in `src/sim/scenario/scenario-advance.ts` (`advanceToDawn`): LOD economy, village economy, build plans, companies, households, borders, polity, logistics.
- Render: `src/render/goods/{needs-board,plot-markers,world-map,overworld-goods}.ts`.

## Rules
- TypeScript, Vite, Phaser 3, Vitest. Free tools and assets only. No runtime LLM; data tables only.
- Sim is deterministic: `deriveRng(seed, ...)`, never `Math.random`; never `archetypeId ===` in `src/sim/`.
- Keep files small; tests first. Gate: `npm run validate-data && npm test && npm run build`.
- Change in the world comes through interactions, not button spends.
- Never put tokens in the remote URL.

## Gotchas
- Container Chromium is build 1243 but repo Playwright wants 1254: run e2e with a throwaway config using `launchOptions.executablePath: '/opt/pw-browsers/chromium'`, `--no-sandbox`, and `webServer.cwd` set. e2e rewrites tracked images in `docs/` and `artifacts/`; `git checkout -- docs artifacts` after.
- Negative world coordinates hide depth-sorted objects under the ground; keep placements >= 0.
- New villagers (grown children) get no sprite until the scene reloads.
- Shortage, war and border tension do not touch despair or spark yet (kept out so balance is unchanged).

## Next (pick one)
1. Hook economy into stakes: shortage/war -> town despair and doctrines; retune cart loss (courier odds look high) and tech saturation (all 8 unlock everywhere by ~dawn 400).
2. Player verbs: answer a build request, work for a company, escort a cart, broker a treaty; click a plot for details.
3. Draw carts and new villagers in the world; death/retirement so `inheritFrom` is used.
4. Refresh the artifact build and check it on a phone.
