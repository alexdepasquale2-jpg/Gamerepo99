# World interaction continuation

Implemented directly on the box; no Claude, cloud agents, deployment or paid assets.

## What is wired into play

- Player bank collision uses seeded terrain and the same raster roads as the
  rendered timber crossings. Substepped movement slides along banks. Settlement
  footprints are dry land, including on old saves with the same geography.
- Real economy caravans move fractionally along their actual roads. Travel is
  saved and credited against the next dawn, so rest does not double-charge it.
  Broken roads halt travel and damaged roads slow it. At the endpoint wagons wait
  for dawn unloading/turnaround. E stops a nearby driver for finite cargo/coin trade.
- Code-drawn 2x pixel art: village cottages, town halls/shops, city walls/towers,
  wells, gardens, fences and named entrance signs. Layouts/palettes are JSON.
  Baked saturation variants follow the existing despair animator.
- F uses the selected satchel item. Bread restores 6 spark, berries 3, fish 8,
  capped by the inhabitant's sparkMax. Food is not consumed at full spark.
  A keepsake placed beside a hearth persists, is visible and leaves memories
  with local neighbours. One keepsake per hearth.
- L opens local correspondence: read letters/status, select a remote resident,
  write up to 500 characters, and use one Letter as stationery. Player letters
  use the existing flight/distance/thinning/delivery system. Delivery leaves an
  unspoken memory and a small trust change. Lost letters are recorded as lost.
- Each town has an E-interactable noticeboard showing live shortages and up to
  three struggling people. No completion button: work, gifts, trades and cargo
  deliveries change the underlying people/stock. Gifts/trades prefer the selected
  item. Cargo delivery now requires the whole physical consignment.

## Controls

WASD/arrows move; E talks/gathers/rests or meets a board/trader; I/Tab opens the
satchel; click a stack or 1–8 selects it; F uses it; L opens letters; M opens the
map; Esc closes local overlays before opening the game pause menu.

## Verification and limits

`npm run build` passes. No unit-test suite or full playthrough was run; earlier
reported test failures have not been resolved or reclassified by this batch.
Local headless screenshot captures booted without page errors. The overview
uses the existing QA hook to reposition the camera/player and advance a real
caravan through the normal fractional-travel function; it is a staged view,
not evidence of a full journey played by hand.

Captures on the box: `/workspace/hearthfall-shot3.png` (settlement, crossing,
caravan) and `/workspace/hearthfall-shot4.png` (real needs board).

Dawn still settles caravan deliveries and turnaround. NPC wandering and wildlife
are not bank-collision actors. Buildings have no interiors or solid footprints.
Letters retain the existing route-distance fallback and long-road loss chance;
there is no generated reply dialogue or stationery crafting. Needs boards derive
needs live rather than storing a quest/reward chain. New art remains procedural
prototype art.
