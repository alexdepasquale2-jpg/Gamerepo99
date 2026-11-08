/**
 * The people inside the room the player is in: whoever the schedule puts in that building, seated where
 * the world's room says (WorldApi.room().seats), drawn with their outdoor look, named, and actable.
 */
import type Phaser from 'phaser';
import type { GameContext, Pt, Thing } from '../app/contracts';
import type { NameLayer } from './name-layer';
import type { PeopleCtl } from './people';

type Seated = { id: string; name: string; at: Pt; sprite: Phaser.GameObjects.Sprite };

export type RoomFolk = {
  active(): boolean;
  headOf(id: string): Pt | undefined;
  things(near: Pt, radius: number): Thing[];
  update(names: NameLayer): void;
  destroy(): void;
};

export function createRoomFolk(ctx: GameContext, people: PeopleCtl): RoomFolk {
  let seated: Seated[] = [];

  const clear = (): void => {
    for (const s of seated) s.sprite.destroy();
    seated = [];
  };

  const seat = (buildingId: string): void => {
    clear();
    const room = ctx.world.room();
    if (!room) return;
    const names = new Map(people.list().map((p) => [p.id, p.name]));
    const ids = people.residentsOf(buildingId).slice(0, room.seats.length);
    seated = ids.flatMap((id, i) => {
      const look = people.lookOf(id);
      const at = room.seats[i]!;
      if (!look) return [];
      const sprite = ctx.scene.add.sprite(at.x, at.y, look.texture, look.frame).setOrigin(0.5, 1).setScale(look.scale).setDepth(at.y);
      if (look.tint !== 0xffffff) sprite.setTint(look.tint);
      return [{ id, name: names.get(id) ?? id, at: { ...at }, sprite }];
    });
  };

  const offs = [
    ctx.events.on('room-enter', (e) => seat(e.buildingId)),
    ctx.events.on('room-leave', clear),
    ctx.events.on('state-replaced', clear),
  ];

  return {
    active: () => seated.length > 0,
    headOf(id) {
      const s = seated.find((x) => x.id === id);
      return s ? { x: s.at.x, y: s.at.y - s.sprite.displayHeight - 2 } : undefined;
    },
    things(near, radius) {
      const r2 = radius * radius;
      return seated
        .filter((s) => (s.at.x - near.x) ** 2 + (s.at.y - near.y) ** 2 <= r2)
        .map((s) => ({ key: `person:${s.id}`, kind: 'person' as const, id: s.id, x: s.at.x, y: s.at.y, label: s.name.split(' ')[0] ?? s.name, target: { kind: 'person' as const, id: s.id } }));
    },
    update(names) {
      for (const s of seated) names.put(`room:${s.id}`, s.at.x, s.at.y - s.sprite.displayHeight - 2, { text: s.name.split(' ')[0] ?? s.name, alpha: 1 });
    },
    destroy() {
      offs.forEach((off) => off());
      clear();
    },
  };
}
