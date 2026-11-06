# 03 — Web-first worldgen

## Order (replace “towns then sprinkle people”)

1. **Seed nuclei** — den / Ashford anchors + gap-pole cast stubs.  
2. **Weave edges** — kin-patterns, debt/trade templates, rival pairs from history beats.  
3. **Place people** — assign `townId` / site by edge gravity (kin cluster together; rivals avoid same hearth unless drama tag).  
4. **Jobs / facilities** — trade edges pull workers to mills/camps on routes; debt to ferry → brine_hitch bias.  
5. **Settlements cohere** — towns with dense subgraphs get higher `clearVitality` floor; sparse gap-poles stay brittle.  
6. **Doctrine spread** — membership follows high-centrality paths; extractive trade edges bias city doctrines toward villages.  
7. **Bake centrality** — write social-centrality.json for this seed.  
8. **Validate hops** — mean distance 4–6 or regenerate edge layer (capped attempts).

## Generators (data)

| Table | Role |
|-------|------|
| `kin-patterns.json` | Motifs (cousin triad, owed favor chain) |
| `history-tables` / beats | Rival & debt seeds by era |
| `world-shapes` / gap-poles | Where sparse webs sit |
| New `social-edge-templates.json` | Weighted motif expander |

## ML (optional, offline only)

- Graph2vec / node embeddings trained offline on exported webs → **cluster labels** baked as `communityId` on people.  
- Runtime never calls the model — only reads `communityId` / centrality columns.

## Play boot

`createPlaySession` loads prebaked edges for seed; may add introduction edges during play without full regen.
