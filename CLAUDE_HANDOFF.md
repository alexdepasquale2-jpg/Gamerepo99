# Hearthfall (The Last Spark): Claude Code handoff

Everything is on `main` (https://github.com/alexdepasquale2-jpg/Gamerepo99). Start: `claude`, then "Read CLAUDE_HANDOFF.md and PLAN.md, then do <one task>". One task per session.

## State (Nov 7, 2026)
- M1–M7 done earlier (sim, social web, hoarder/patrons/legacy, menus, mobile, bots). `PLAN.md` has history.
- Economy sim phases 1–8 done and on main, deterministic and tested: named jobs, village ledger (production, processing, demand, shortage pricing), logistics (requests, carts on roads), ambitions and build plans (plots, claims, labor), companies and wages, households and family lines (gifted births, inheritance), borders and claim disputes, light polity (diplomacy, war, tech, creeds). All NPC-run; the player only helps by gifting.
- Economy is shown on screen: noticeboard page 2 (E at a town board), plot markers in the world, M-map overlays (rings, treaty/war lines, carts).
- Checks at last commit: 628 unit tests, build, 15 e2e passing (1 skipped by design).
- Live private artifact of the game (mobile, on-screen keys): https://claude.ai/artifact/DLJdBXRYjMfUmQLpaQhhjw. It is an old build; rebuild with `npx vite build --base=./` and republish to refresh.

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
