# 04 — Integration map (fabric · interactions · M4)

What plugs into the web, and **what changes** in each layer.

## Fabric (M2)

| Existing | Role on the web | Change |
|----------|-----------------|--------|
| **Anchors** (Ashford, dens) | Dense kin/friendship cores; low mean local hops | Author denser `kin`/`friendship` inside anchors; centrality peaks here |
| **Gap-poles** | Sparse, brittle subgraphs; long paths to anchors | Fewer cross edges; rival/debt stretch across gapAxis |
| **History beats** | Seed rival + debt + old friendship | Beats emit edge templates at gen, not only lore text |
| **Kin-patterns** | Motif grammar for weave step | Expand to all five edge kinds; patterns become worldgen step 2 |
| **Reaction-curves / marks** | Node state the walk reads | No curve rewrite; cascades write mark stacks already defined |
| **Assertions** | Gate illegal rumor lines | Rumor walker must pass assertion cases (cheerful grief, etc.) |

Fabric world-dump stays inspectable; add optional `social.edges` / `social.centrality` to dump when mode inspect.

## Interaction model

| Interaction | Graph effect |
|-------------|--------------|
| `show_up` / `talk_gentle` | Soft friendship weight +; good cascade hop≤2 |
| `favor_do` / `gift_give` / `work_alongside` | Strengthens trade or friendship; favor reaches FoF |
| `promise_keep` | Clears debt edge or converts debt→friendship |
| `promise_break` | Spawns/boosts `rival` + debt; bad cascade |
| `introduce` | **Adds** edge + shortens paths (see 02) |
| `stand_up` | Good cascade from target through kin; may hit influential |
| `talk_hard_shame` | Bad cascade along rival+kin |

Spark strain unchanged by this spec (pacing is catalog). Ripple `help`/`harm`/`cling` become **graph-aware**: prefer neighbors over random town sample; fall back to today’s kin-neighbor cap if graph missing.

**Change:** `resolveInteraction` post-touch calls `walkSocialCascade(...)` (Forge); Loom authors `social-propagation.json`.

## M4 plan

| Task | Plug-in | Change vs solo task doc |
|------|---------|-------------------------|
| **A / packet-01 economy LOD** | Town despair still LOD-owned; contagious despair from graph uses **smaller** adds | LOD runs first at dawn; then optional `tickSocialDespair` using trade/kin in-town |
| **B caravans** | Caravan agents follow `trade` edges + routes | Schedule pick preferred towns with trade-edge density; deliver also bumps trade weight |
| **C doctrine** | Spread/collapse along high-centrality paths + extractive trade | `DoctrineSupplyHook` can read influential set; collapse rumor walks rivals outward |
| **D letters/rumors** | Same walker as 02 rumors | Letters.json targets prefer centrality; packet.emit gains `viaEdgeId` |

Packet-01 remains **first** implementable Forge slice; graph runtime may land as packet-02 after A is green.

## Data ownership

| New / extended file | Owner |
|---------------------|--------|
| `people/kinship.json` (kinds↑) | Loom |
| `people/social-centrality.json` | Loom bake script |
| `systems/social-propagation.json` | Loom |
| `world/social-edge-templates.json` | Loom |
| `src/sim/social/*` | Forge (after packet-01) |
