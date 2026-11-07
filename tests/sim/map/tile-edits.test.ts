import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import { loadData } from '../../../src/sim/load-data';
import { loadState, saveState } from '../../../src/sim/save';
import { generateWorld } from '../../../src/sim/gen/world';
import { createStampRasterSource } from '../../../src/sim/map/stamp-raster';
import { setTileEdit } from '../../../src/sim/map/tile-edits';
import { placeSettlements, placeSettlementsBase } from '../../../src/sim/map/world-layout';
import { TILE_PX } from '../../../src/sim/map/constants';

describe('tile edits + save v3', () => {
  it('edits are saved per chunk and override generated tiles', () => {
    const { state } = bootPlayState(7, 'marrow');
    setTileEdit(state, 40, 70, 'road');
    const back = loadState(JSON.parse(JSON.stringify(saveState(state))), loadData());
    expect(back.tileEdits).toEqual({ '1,2': { '40,70': 'road' } });
    const world = generateWorld({ seed: 7, includeAnchors: true, peopleCount: 60 });
    const towns = placeSettlements(world.settlements!, 7);
    const t = towns[0]!;
    setTileEdit(back, t.q + 20, t.r + 20, 'bridge_deck');
    const src = createStampRasterSource(world, 7, () => back.tileEdits);
    const chunk = src.getChunk({ cx: Math.floor((t.q + 20) / 32), cy: Math.floor((t.r + 20) / 32) });
    expect(chunk.tiles.find((x) => x.q === t.q + 20 && x.r === t.r + 20)?.biomeId).toBe('bridge_deck');
  });

  it('v2 saves keep ground items beside the same town at the new scale', () => {
    const { state } = bootPlayState(7, 'marrow');
    const world = generateWorld({ seed: 7, includeAnchors: true, peopleCount: 60 });
    const old = placeSettlementsBase(world.settlements!, 7)[1]!, now = placeSettlements(world.settlements!, 7)[1]!;
    state.groundItems = [{ id: 'g1', itemId: 'bread', x: (old.q + 3) * TILE_PX, y: (old.r - 2) * TILE_PX }];
    const blob = { ...saveState(state), version: 2 as const };
    const back = loadState(JSON.parse(JSON.stringify(blob)), loadData());
    expect(back.groundItems![0]).toMatchObject({ x: (now.q + 3) * TILE_PX, y: (now.r - 2) * TILE_PX });
    expect(loadState(saveState(state), loadData()).groundItems![0]).toMatchObject({ x: (old.q + 3) * TILE_PX });
  });
});
