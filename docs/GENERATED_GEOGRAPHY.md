# Generated geography

The seed and selected settlement IDs now define one shared 2D geography.

- Cities use jittered regional grid slots; towns orbit cities and villages orbit towns with bounded best-candidate separation. Rural/urban class comes from the existing gap axis, not the art-stamp footprint.
- A Euclidean minimum spanning tree guarantees connectivity. Short non-crossing chords create loops. Curvature is accepted only when it preserves planarity. Worldgen publishes these exact route IDs to travel, facilities and economy.
- Raster roads, resource scatter, both maps and visible caravans use the same sampled paths. The old renderer projected roads onto X, so it was replaced with a two-dimensional connected-cell ribbon renderer.
- Seeded continuous noise supplies forest, hills, water, fields and meadow. Resource types follow their actual biome, including wilderness nodes away from roads.
- Play boot and save adoption bind economy towns, producers and caravan schedules to generated settlement/road IDs. Omitted authored anchors are reassigned to a present settlement. Walking into a settlement updates the player's town ID; stocks, shortages, gifts and deliveries therefore reference visible towns.
- Loaded saves preserve matching town stocks/despair and surviving route conditions. Obsolete routes/caravans are retired; geography is regenerated rather than preserving the old strip layout.

## Current limits

- Terrain uses tinted existing ground art and existing resource sprites; no new commissioned assets.
- Water is visual terrain, not a collision or hydrology system. Roads crossing water are effectively causeways; there is no bridge-placement pass.
- Real economy caravans advance on dawn ticks. Their rendered positions ease along the road after a dawn, rather than simulating continuous realtime logistics. No decorative phantom wagons remain.
- Settlement count and building stamps are unchanged. This fixes spatial generation, not settlement architecture or population design.
- This patch was built and locally captured headlessly; the full test suite was intentionally not run.
