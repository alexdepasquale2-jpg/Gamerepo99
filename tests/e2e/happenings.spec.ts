/** Happenings: resting at a hearth eventually brings news of something that befell a town, told by someone there. */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = 'docs/qa/reports/happenings';

type Active = { eventId: string; townId: string; startDay: number; endsDay: number; speakerId?: string; mods: { kind: string }[] };
type St = {
  day: number;
  people: Record<string, { name?: string; townId?: string }>;
  happenings?: { active: Active[]; log: { eventId: string; townId: string; day: number }[] };
};
type Hearth = {
  session: { getState(): St; snapshot(): { day: number } };
  dev: { rest(): Promise<string[]>; lastSay(): string };
};
declare global {
  interface Window {
    __hearth?: Hearth;
  }
}

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!window.__hearth, null, { timeout: 20_000 });
}

test('a happening begins at dawn and is told through someone in that town', async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);

  let found: { lines: string[]; act: Active; speaker: string; day: number } | null = null;
  for (let i = 0; i < 24 && !found; i++) {
    const res = await page.evaluate(async () => {
      const lines = await window.__hearth!.dev.rest();
      const st = window.__hearth!.session.getState();
      const act = st.happenings?.active.find((a) => a.startDay === st.day);
      const speaker = act?.speakerId ? st.people[act.speakerId]?.name ?? '' : '';
      const speakerTown = act?.speakerId ? st.people[act.speakerId]?.townId : undefined;
      return { lines, act, speaker, speakerTown, day: st.day };
    });
    if (res.act) {
      expect(res.speakerTown).toBe(res.act.townId);
      found = { lines: res.lines, act: res.act, speaker: res.speaker, day: res.day };
    }
  }
  expect(found, 'a happening within 24 rests').not.toBeNull();
  const { lines, act, speaker, day } = found!;
  // The dawn line names the speaker (first name) and is one of the lines heard on waking.
  const first = speaker.split(' ')[0]!;
  const line = lines.find((l) => l.includes(first));
  expect(line, `dawn lines ${JSON.stringify(lines)}`).toBeTruthy();
  expect(act.endsDay).toBeGreaterThan(act.startDay);
  // Time-limited effects are held until they lapse (grey rain's relapse pressure, the market ghost's despair + blunted inspire).
  if (act.eventId === 'grey_rain') expect(act.mods.map((m) => m.kind)).toContain('relapse');
  if (act.eventId === 'market_ghost') expect(act.mods.map((m) => m.kind)).toEqual(expect.arrayContaining(['despair', 'method']));
  // It is recorded and saved state; the effect is in force (or was instant) for the day.
  const log = await page.evaluate(() => window.__hearth!.session.getState().happenings!.log);
  expect(log.at(-1)).toMatchObject({ eventId: act.eventId, townId: act.townId, day });
  // The line is said on screen after "Dawn. Day N." (2.6s per line).
  await expect.poll(() => page.evaluate(() => window.__hearth!.dev.lastSay()), { timeout: 20_000 }).toContain(first);
  await page.screenshot({ path: `${OUT}/happening-day${day}.png` });
  expect(errors).toEqual([]);
});
