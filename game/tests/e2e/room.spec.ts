// Into a building's room and back out to the street.
import { bootToPlay, dev, expect, settle, test } from './support';

test('enter and leave a room', async ({ page }) => {
  await bootToPlay(page);
  const street = await dev<{ q: number; r: number }>(page, 'where');
  expect(await dev(page, 'room')).toBeNull();

  await dev(page, 'enterRoom');
  await settle(page);
  const room = await dev<unknown>(page, 'room');
  expect(room).not.toBeNull();
  expect((await dev<{ room: unknown }>(page, 'where')).room).toEqual(room);
  // Inside, there is still something to stand by (the room's own things, or its door out).
  expect((await dev<unknown[]>(page, 'things', 400)).length).toBeGreaterThan(0);

  await dev(page, 'leaveRoom');
  await settle(page);
  expect(await dev(page, 'room')).toBeNull();
  const back = await dev<{ q: number; r: number }>(page, 'where');
  // Out on the same street, not flung across the district.
  expect(Math.abs(back.q - street.q) + Math.abs(back.r - street.r)).toBeLessThan(40);
});
