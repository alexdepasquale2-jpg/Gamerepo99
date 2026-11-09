# The Last Spark: the rebuild (`game/`)

This is a fresh front end on the proven simulation. The old game in `src/` keeps running until this one replaces it.

**On `main` since #64 (8 Nov 2026).**

## Get it and run it
Fresh copy:
```bash
git clone https://github.com/alexdepasquale2-jpg/Gamerepo99.git
cd Gamerepo99
npm ci
npm run game:dev
```
Or, in an existing checkout:
```bash
git switch main
git pull
npm ci
npm run game:dev
```
Then open http://localhost:5174.

- Dev server: `npm run game:dev` (port 5174)
- Type check and unit tests: `npm run game:check` (tests alone: `npm run game:test`)
- Build: `npm run game:build` (writes `game/dist`; open with `npx vite preview --config game/vite.config.ts`)
- The old game still runs on the same branch with `npm run dev` (port 5173).
- **God menu** (dev and playtest builds): **Shift+`**, or the button at the top of the dev menu (`). This full-screen control centre pauses the game while it's open (click Paused to switch to Live). Tabs: **Overview** (vitals, skip 1/7/30/100 dawns with charts for every dawn, time of day, walk speed, go to any town, and world-wide acts such as kindling everyone, lifting despair or ending wars), **People** (searchable census, plus an inspector for flame, trust, age, purse, marks and tags, and teleporting to someone), **Towns** (despair, stores, shortages, funding or finishing builds, workshop tills, doctrine meters), **Powers** (trust, feud and treaties, declaring war or making peace, granting crafts and creeds), **Roads** (carts, requests, breaking or mending routes), **You** (spark, coin, every item), **Feed** (every sim event as it happens), **State** (the raw state as a tree you can edit) and **Console** (JavaScript with `state`, `ctx`, `session`, `dev` and `commit()` in scope). Code: `src/ui/god/`.

## What we learned, and the rules that follow
The old game had a strong simulation that the player couldn't see. It grew about 15 one-off screens, a 1,000-line scene file, 12 single-letter hotkeys, a 17-chip paged ring, and one corner line that carried all the news. Features from 50 PRs were in the build and nobody could find them.

1. **News through people, never popups.** Speech bubbles over named people, tells over heads, props in the world. No screen-space text log. The succession screen is the only modal.
2. **One way to act on anything.** Focus the thing in front of you, or tap it, and its ring opens. The ring shows at most 6 chips: verb families first, then verbs. No paging. Items in hand add their verbs to the ring. There is one prompt in the world, for the focused thing only.
3. **Everything is reachable in two steps or fewer, by touch.** A phone plays the whole game. Keys are shortcuts, never the only way.
4. **Minimal HUD:**
   - Spark top-left (gold fill, cyan outline).
   - Day and phase muted at top-centre.
   - Letter chip on the edge.
   - Purse by the hotbar.
   - Panels open as slim side sheets (≤ 40% width), one at a time. The world stays visible.
5. **Despair is a palette shift on the town,** never an overlay.
6. **Every thing has at least two uses,** each with a supply and a demand: items, nodes, animals, places.
7. **One look.** Kit tokens from `docs/art/PALETTE.md`, one bubble style, one panel style, crisp DOM text over the canvas.
8. **Small files, owned folders.** No file over about 400 lines. Each area owns its folder and talks to the others only through `src/app/contracts.ts`.

## Architecture
```
src/main.ts        title flow → app
src/app/           contracts (GameContext + every area API), shell (Boot + World scene, rest, arrive), events, dev hooks   [lead]
src/sim/  src/data/  copied from the old game: worldgen, economy, people, acts, saves, all JSON          [content agent edits contrib + data only]
src/world/         terrain chunks, settlements, buildings, props, interactable world things, interiors, day light, despair palette, asset loading
src/actors/        the player (keys + tap-to-walk + bodies), villagers (schedules, homes, looks, marks, leaders, newcomers), animals, wagons and carts
src/voice/         speech bubbles, tells, first-encounter tips, dawn spoken by people, juice → presentation, sound and music
src/ui/            UI kit (tokens, canvas-aligned layer, overlay stack, sheet, menu, modal), HUD, title/new game/world pick/save/load/pause/world file, succession and endings, touch bar, dev menu
src/panels/        satchel + hotbar, noticeboard (tabs for every page), trade, letters, world map + minimap, road menu, company sheet
src/interact/      focus resolver, the one world prompt, the ring, act → present, held-item verbs, drag to give, keyboard + tap input
```
The shell attaches areas in this order: world → actors → voice → ui → panels → interact. Areas call each other only through `ctx` at runtime.

**Reuse the old code freely.** Copy from `../src/render`, `../src/ui` and `../src/ui/kit` into your own folder and reshape it. Never import from `../src`.

## Feature coverage: everything comes back, visible
Each feature names the area that owns how it looks and is reached. The content agent makes sure the sim side offers it as verbs and lines.

| Feature (tree node, PR) | Owner | How the player meets it |
|---|---|---|
| Pick or roll your inhabitant; known/new/numbered world (A3, F16, #28, #46) | ui | title flow |
| Four bodies: size, doors, speed, brood split and recall (A4, A9 old, #28) | actors, world | body look; door refusal tell; Brood button on touch + B |
| Method modifiers, personal costs at dusk, refusals (A5–A7, B9, #39) | voice, interact | refusal flicker and line at the head; coal gutters at burnout |
| Spark bar, reignite burst, despair tint (A1, B8) | ui, voice, world | HUD; burst at the person; town palette |
| Deeds and talk: Speak, Help, Give, Promise, Ask, Deal (B2–B5, #47) | interact, content | ring families |
| Gift by dragging an item, gift affinity (B4) | interact, panels | drag hotbar → person, or held item in ring |
| Wound chemistry, marks, mark glyphs (B6, B7, #37) | voice, actors | "landed deep / slid off" lines; posture, colour, glyph by name |
| Unspoken → Blessing or Burden at dawn (C4) | voice | dawn bubble by the carrier |
| Letters, replies, rumours (C5, C6) | panels, voice | letters sheet; letter chip; rumour bubbles |
| Generated history, "ask about the old days" (C12, #34) | content, voice | Ask family in the ring; dawn retellings |
| Civic voice, kin strain across the gap (D3, D5, #32) | voice | crowd lines; strained people talk |
| Doctrine, legitimacy, power page, border disputes (E1, E2, E5, E8, #41) | panels, voice | board Power tab; townsfolk news |
| Kingdom patrons (E4, #42) | content, voice | Deal family on brokers; the patron's man at dawn |
| Gathering nodes, regrowth (F4) | world, interact | node ring: gather + second use |
| Village ledger, caravans, roadside trade, carts (F5, F7, F8) | panels, actors | board Economy tab; wagons in the world; trade sheet |
| Build plans, plots, companies (F9) | world, panels | plots drawn with progress; board |
| Households, births, newcomers (F10, #36) | actors, voice | newcomers appear named at dawn; family speaks |
| Facilities and shifts (F12, #43) | world, interact | facility ring: work a shift; crews |
| Player changes the land (F13, #33) | world, interact | the tile in front of you has verbs: lay stones (mallet or tools), clear brush (axe or tools), mend path (timber), mend a worn road (stone, timber, tools) |
| Crafting (recipes.json) | panels, interact | Craft at a hearth, a facility's workbench or forge, or your own workshop → craft sheet; short inputs greyed |
| Roads: signposts, road menu, hired travellers, days on the road, encounters (G1–G4, #40) | world, panels, voice | signpost ring → road sheet; told at the far end |
| Hoarder: coin, hide coin, guards, theft and decay, hoard ending (H1–H7, #44) | content, world, ui | Deal/Stash in the ring; chest prop with a tally; ending modal |
| Notoriety both ways, neglect greys towns (H5, H6) | voice, world | crowd lines; palette |
| Succession, heir, inherited dependence (I1–I3) | ui, voice | succession modal; dawn lines |
| World file export/import, legends as NPCs, migrations (I5–I7, #38) | ui | pause → world file |
| Interiors (F14) | world | doors open rooms; residents inside by schedule |
| Happenings, authored moments (#45, #35) | voice | told by townsfolk |
| Saves: 3 slots + dawn autosave (J8) | ui | title and pause |
| Sound (J6) | voice | cues; N mutes (also in pause menu) |
| Every item has ≥2 uses (revamp R3) | content, interact, panels | held item adds "Use …" to any ring |
| The realm: a 10×10 grid of districts, each generated from the seed with its own wound, doctrine, land and naming culture; only the district you are in runs the full sim, the rest are frozen or a summary (sim/map/districts, sim/realm) | world, panels | world map → The realm; signpost → Beyond this district (trunk roads) |

## Area ownership (one agent each)
- **world:** `src/world/**`
- **actors:** `src/actors/**`
- **voice:** `src/voice/**`
- **ui:** `src/ui/**`
- **panels:** `src/panels/**`
- **interact:** `src/interact/**`
- **content:** `src/sim/contrib/**`, `src/data/**`, and any small sim helper needed to expose a verb
- **lead:** `src/app/**`, `src/main.ts`, this README, merging

## Working rules for agents
- Tests live only under `game/tests/`: small Vitest suites for pure sim modules (`npm run game:test`, which `npm run game:check` runs after the type check); browser tests under `game/tests/e2e`. Whole-world proofs are scripts in `game/scripts/check-*.mts`. Before the PR, run `npm run game:check` and `npm run game:build`.
- Keep every export your stub has. You may add to your API in `src/app/contracts.ts`; say so in the PR.
- Register QA hooks with `registerDevHook` from `src/app/dev-hooks.ts`.
- Commit with `git -c user.name=alexdepasquale2-jpg -c user.email=alexdepasquale2@gmail.com commit`, and end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Open a PR to `claude/v2-scaffold` (not main). Never force-push.
