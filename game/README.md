# The Last Spark: the rebuild (`game/`)

This is a fresh front end on the proven simulation. The old game in `src/` keeps running until this one replaces it.

**On `main` since #64 (8 Nov 2026).**

## On the box
- **A hundred districts with up to 100,000 dawns of history.** At New game you choose the world's age, from a young world to 3,571 years (any number of dawns, 0 to 100,000). Every district lives all of it before you take a step: harvests and famines, plagues, rulers and contested seats, pacts and wars with its neighbours, and the spark-carriers who walked there before you. Lands fall to ash and are rekindled; others burn as beacons. The realm's time is cut into named ages, the map shows what the past left, and the people of each district retell their own.
- **A storyteller, not a dice roll.** Old Ember, the Weaver or the Gale paces what befalls you: quiet spells to build in, omens, then a crisis sized to what you own, and room to mend after. Nothing is told twice running, and a merciful teller holds back while you are down.
- **Trouble you can answer.** Raiders camp outside a raided town until you rout them and cart the stores home. A blighted town comes through if you keep it fed, a sick one if you keep it lit. Chains like *The Bandit King* and *The Ashen Winter* end differently depending on what you did.
- **A world that runs without you.** Villagers work, trade, build, marry, age and die; towns feud, ally and go to war; carts and convoys roll the roads.
- **Every way to be the last spark.** Four bodies, kind or cruel methods, hoarder or patron, heirs and legends, and an industrial arc from workbench to airship (The Works).
- **Real-time fights in the wilds, a phone-sized UI, and no popups:** news comes through the people it concerns.

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
- **God menu** (dev and playtest builds): **Shift+`**, or the button at the top of the dev menu (`). This full-screen control centre pauses the game while it's open (click Paused to switch to Live). Tabs: **Overview** (vitals, skip 1/7/30/100 dawns with charts for every dawn, time of day, walk speed, go to any town, and world-wide acts such as kindling everyone, lifting despair or ending wars), **People** (searchable census, plus an inspector for flame, trust, age, purse, marks and tags, and teleporting to someone), **Towns** (despair, stores, shortages, funding or finishing builds, workshop tills, doctrine meters), **Powers** (trust, feud and treaties, declaring war or making peace, granting crafts and creeds), **Roads** (carts, requests, breaking or mending routes), **Realm** (map of all 100 districts: pick one to see its wound, doctrine and towns, and in an older world how its past left it and what it remembers, then Jump to go there at once, with no days on the road), **Story** (the storyteller's hand: swap tellers, see phase, tension and points, fire any incident or arc where you stand, rout a pack or end a trouble), **You** (spark, coin, every item), **Feed** (every sim event as it happens), **State** (the raw state as a tree you can edit) and **Console** (JavaScript with `state`, `ctx`, `session`, `dev` and `commit()` in scope). Code: `src/ui/god/`.

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
| The storyteller: phases, omens, threats you answer, chains, three tellers (sim/storyteller; happenings #45 are its everyday table); authored moments (#35) | voice, panels, combat | told by townsfolk at dawn; board Tidings tab says what is afoot and how to end it; packs gather round a town in trouble |
| The realm's baked past: 0 to 100,000 dawns for all 100 districts (sim/realm-bake) | ui, panels, voice | New game → How old is the world?; world map → The realm (ages, beacons, fallen lands, each district's tales); Ask about the old days |
| Saves: 3 slots + dawn autosave (J8) | ui | title and pause |
| Sound (J6) | voice | cues; N mutes (also in pause menu) |
| Every item has ≥2 uses (revamp R3) | content, interact, panels | held item adds "Use …" to any ring |
| The realm: a 10×10 grid of districts, each generated from the seed with its own wound, doctrine, land and naming culture; only the district you are in runs the full sim, the rest are frozen or a summary (sim/map/districts, sim/realm) | world, panels | world map → The realm; signpost → Beyond this district (trunk roads) |

## The storyteller
One director decides when things happen, instead of a flat chance per dawn (`src/sim/storyteller/`, data in `src/data/systems/storytellers.json`). It runs in the dawn pipeline where the happenings draw used to be, and the happenings table is now its everyday texture.
- **Tellers** (picked at New game, saved with the game): *Old Ember* moves through calm, rising, peak and ebb; *the Weaver* gives long calms and then a whole chain; *the Gale* has no rhythm and no mercy.
- **Pacing**: each phase has its own chance per dawn and its own mix of kinds (everyday, boon, omen, twist, threat, arc). Threats cost points, which come in faster as days pass and as you grow rich, and raise tension; no threat fires over the teller's tension cap. Intensity (how much a raid takes, how many packs to rout) grows the same way.
- **No repeats**: every incident has a cooldown, anything told lately is weighed down, and nothing is told twice running.
- **Incidents reach real systems**: town despair and stock, the food ledger, flames, your spark and satchel, roads, newcomers who stay, feuds with the next district, packs in the wilds.
- **Answerable**: a timed incident shows on the board's **Tidings** tab with what ends it. *Rout* incidents gather packs of one family round the town (routing the last one needed ends it on the spot); *when* incidents check the town at the deadline (food in store, hearths lit).
- **Arcs** are chains in one town whose later steps turn on how the earlier ones ended.
- Tests: `tests/sim/storyteller.test.ts`. Dev: god menu → Story.

## The realm's past
`src/sim/realm-bake/` bakes every district's history before day 1 (data in `src/data/world/realm-bake.json`).
- **How long**: 0 to 100,000 dawns, chosen at New game (presets, or type a number). 0 is the world the game always made, bit for bit.
- **What is simulated, per dawn, for all 100 districts**: food by season, land and weather; despair pulled toward the district's wound on slow tides; how its hearths burn; rulers; rare events; and every neighbouring pair's trust, feud, pacts and wars, on the same meters play uses.
- **Cost**: about a second for the full 100,000 dawns, flat memory (each district keeps its greatest and latest events). It is a pure function of (seed, dawns): the save holds only the number, and old saves load as young worlds.
- **What it changes in play**: district despair and head count on the map, trunk roads and district wars; pacts and wars standing on day 1; each district the first time it is live (town despair, who is already lit, stores); and its history, which its people retell.
- Tests: `tests/sim/realm-bake.test.ts`, `tests/e2e/world-age.spec.ts`.

## The Works: the progression layer
Everything above is the texture; the Works is the arc you climb through it. Open it with **J**, the **⚙ Era** chip under the spark bar, the pause menu, **The Works** at any hearth, or **Contracts** at a board.

- **Yards** (depots): take on a yard in a town (the first is free), stow your satchel into it, and raise buildings: workbench, kitchen, woodlot, farmstead, kiln, mine, forge, foundry, machine shop, assembly yard, barracks, sky dock.
- **Making and cooking**: about 50 recipes at those buildings turn gathered goods into planks, iron, steel, gears, springs, wheels, axles, boilers, engines, armour, cannon and arms. The kitchen cooks porridge, stew, pies, broth, hardtack, field rations and feast platters. Eat meals for spark.
- **Manufacturing lines**: set a building to a recipe and hire townsfolk (from the sheet, or **Hire for line** on the person). Every dawn each hand makes a batch from the yard's stock for a 1-coin wage. A crew fed rations makes half again. Improve a line for more hands.
- **Vehicles**: pre-baked designs (handcart, ox wagon, war cart, steam wagon, landship, airship) are put together from parts at the assembly yard, or bought ready-made from the Wright's catalogue, which also sells single parts. Mods (cargo rack, spare wheel, shield wall, field stove, armour kit, gun mount, engine governor) fill each design's slots. Drive one yourself to another town.
- **Logistics**: convoys run standing routes on their own. They load at dawn, burn fuel (grain, then charcoal), and either haul into your far yard or sell to the far town. Prices are better where the town is short, and food eases a hungry town's despair. Raiders hit bad roads and war zones; armour helps. Towns post **contracts**, which arriving convoys fill.
- **War**: raise a band at a barracks, enlist townsfolk (**Enlist** on the person, 5-coin bounty), arm them from the yard, bring war machines, and feed them one ration each per dawn (a hungry band loses heart, then soldiers). March on a town: the band's power fights the town's defence. A won town becomes a vassal that pays tribute and grows in despair, and it may rise unless you garrison it or feast there. The fallen go home wounded.
- **Five arcs, five Eras**: Industry (*The Great Engine*), Trade (*The Iron Road*), War (*Crown of Cinders*), Hearth (*The Long Table*) and Sky (*The Far Spark*: three airship voyages past the map's edge). Each has five steps that pay renown and coin, and the fifth grants a lasting boon. Renown climbs the Hearth, Cart, Forge, Steam and Sky Ages, and each age opens buildings, recipes, vehicles and more yards.
- **In the world**: convoys roll the roads with their load named over them, an airship flies high above its shadow, idle vehicles stand by your yard, and the war band marches as a column (war machines leading, the banner, then soldiers by name) or camps with tents in the town it holds. Soldiers away with the band are not in their own town's streets. Drawn by `src/actors/works-traffic.ts` from `src/sim/works/where.ts`.
- **Where the code is**:
  - Sim: `src/sim/works/`. The dawn tick runs in the `late` slot, and news is spoken at dawn by the people it concerns.
  - Ring verbs: `src/sim/contrib/works.ts`.
  - Data: `src/data/works/*.json`.
  - Sheet and chip: `src/panels/works/`.
  - Tests: `tests/works/`.
  - Whole-world check: `npm run game:check-works`.

## The action layer: fighting in the wilds
Towns stay safe. Out on the roads and in the wilds between them, things come for you.

- **Fighting**:
  - Keys: **Space** attacks (hold to keep swinging), **Shift** dodges, **Q / R / F** use your slotted skills, and **C** opens the hero sheet.
  - Tapping or clicking a foe attacks it instead of walking there.
  - On a phone, the combat bar sits above the hotbar and pad: hold **Attack**, and tap **Dodge** or a skill.
  - Health is a red bar under the spark bar. Skills burn **spark**, which comes back while you fight, and health comes back out of a fight (faster in a town).
- **Falling**: if you fall, you wake in the last town you were in, a tenth of your coin lighter (50 at most).
- **Foes come in four families**, each leaving its mark on the world:
  - **Despair-born** (ash-hounds, hollow folk, cinder-wraiths; the Despair Colossus): slaying them eases the nearest town's despair, and Spark bolt hits them double.
  - **Bandits** (cutpurses, raiders, archers; the bandit chief): each one slain makes convoys safer for ten days.
  - **Beasts** (wolves, boars, bears; Old Greymaw): they drop hides and meat for the satchel, kitchen and builds.
  - **Rival soldiers**: they walk near towns at war with your home and near the town your band marches on. Each one slain lowers that town's defence before the battle.
- **Packs and lairs**:
  - Packs are seeded per map cell and day. Bandits keep near roads, despair-born come near despairing towns and at night, and beasts keep far out.
  - **Lairs** (a despair rift, bandit or war camp, or a den) stand off the roads with a boss and its guard. A cleared lair pays a chest and lies quiet for 12 days.
- **The hero**:
  - **Levels**: each brings a skill point, two attribute points (might, grit, wits) and full health.
  - **Gear**: weapons, armour and charms in 5 rarities with rolled affixes. Swords, axes, spears and mauls swing in arcs, while bows and ember staffs shoot.
  - **Skills**: 9 skills in three branches. Blade has cleave, whirlwind and lunge; Ember has spark bolt, rekindle and flame nova; Ward has war cry, bulwark and ember volley.
  - All of this is on the hero sheet (**C**), along with breaking gear down for coin and ember shards.
- **The Works**: a sixth arc, **The Ember Knight**, counts your kills, levels, lairs and the Colossus. Its boon is a quarter more damage.
- **Where the code is**:
  - Rules: `src/sim/hero/` (pure). Data: `src/data/hero/*.json`.
  - Front end: the **combat** area in `src/combat/`, with foes and AI, attacks and skills, the spawner, effects and the HUD. It is attached after interact, and it reuses the actors' figure and painter.
  - Hero sheet: `src/panels/hero.ts`.
  - Tests: `tests/hero/`, `tests/e2e/combat*.spec.ts`.

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
