# Overworld Asset Manifest Design (M3 handoff)

**Status:** Approved for Prism executor (parent task brief)  
**Goal:** Runtime-ready mapping from Loom `WorldRenderSnapshot` asset keys → CC0 sheet/frame/variant + heading rule.

## Approaches considered
1. **Markdown-only map** — human readable, not importable by Phaser. Rejected as sole deliverable.
2. **JSON under assets/** — easy for tools; weak typing. Good companion.
3. **TS manifest in src/render/** — typed helpers + heading math; preferred primary. **Chosen:** TS primary + JSON mirror for tooling.

## Design
- Keys: `biome.<id>`, `facility.<kind>.<state>`, `fauna.<id>`, `ore.<id>`, `caravan.<type>` (+ aliases from shortlist).
- Source of truth for ids: `biomes.json`, `facilities.json` kinds, `travel-trades.json` roles, `economy-resources.json`.
- Each entry: sheet id, frame(s), despair/alive variant strategy (`palette` lerp vs `swap`), status `ready|stub|missing`.
- Heading: degrees CW from north; **8-way** primary `round(deg/45)%8`; **4-way** fallback `round(deg/90)%4`.
- Grid: **square ortho** `q=x,r=y` until Loom locks hex — documented as pending.
- Gaps (`farm`, fauna) listed with CC0 fill options; stubs in manifest with `status:'missing'`.

## Non-goals
Importing vendor zips into runtime atlas bake; hex layout; feel numbers in sim.
