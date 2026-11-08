# Wave 3: seasons and weather (1 unit; needs wave 2 merged)

This is a single unit. Run it with `/batch` or as a normal session.

```text
/batch Batch 2, wave 3: add seasons and weather to The Last Spark (tree node F17). Read docs/superpowers/plans/batch2/index.md first; its unit contract and house rules apply. One unit, one branch claude/batch2-301-seasons, one PR.

U01 "seasons"
- Add src/sim/season.ts: a yearly cycle derived from state.day, with seeded weather per region each dawn. Register it with registerDawnTick('season') so the day's conditions are set before the economy runs.
- Add data/systems/seasons.json and a validator module.
- Seasons drive:
  - harvest multipliers in the village economy recipes and the economy-LOD flow
  - warmth demand for wood and cloth in households
  - road wear (wave 1 roads.ts)
  - travel days (legDays, journey, logistics, caravans)
  - spoilage, if wave 2 added it
- Show it only through the world and people: palette and light shifts, snow, rain or mud tiles over the L4 detail, people talking about the weather and the harvest. No calendar HUD.
- Done when:
  - a 120-dawn deterministic test covers all four seasons with a harvest swing and slower winter roads
  - e2e screenshots show winter and summer
  - the existing economy tests still pass
```
