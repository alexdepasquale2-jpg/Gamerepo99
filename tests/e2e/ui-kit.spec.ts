/**
 * Batch 2 A01: the UI kit. Every sheet and menu opens through the overlay stack; one sheet at a time;
 * no sheet covers the spark bar or the day chip; side sheets keep the world visible (at most ~40% of
 * the canvas width, or docked under it on a tall phone). Screens go to test-results/shots/ui-kit.
 */
import { test, expect, type Page } from '@playwright/test';
import { collectErrors, hearth, pickInhabitant, shotsDir } from './support/game';

type Box = { left: number; top: number; width: number; height: number };
type Entry = { id: string; kind: 'modal' | 'menu' | 'sheet'; pause: boolean; rect: Box | null };

const overlap = (a: Box, b: Box): boolean =>
  a.left < b.left + b.width - 0.5 && b.left < a.left + a.width - 0.5 && a.top < b.top + b.height - 0.5 && b.top < a.top + a.height - 0.5;

const hud = (page: Page) => hearth<{ canvas: Box; spark: Box }>(page, (h) => h.dev.ui.hud());
const openEntries = (page: Page) => hearth<Entry[]>(page, (h) => h.dev.ui.open());

async function boot(page: Page, archetype = 'marrow'): Promise<string[]> {
  const errors = collectErrors(page);
  await page.goto('/');
  await pickInhabitant(page, archetype);
  // Let the first frames settle (camera fade-in, chunk stream).
  await page.waitForTimeout(800);
  return errors;
}

/** The one open sheet is `id`, clear of the spark bar and the day chip, and leaves the world in view. */
async function expectSheet(page: Page, id: string): Promise<Box> {
  await expect(page.locator(`#${id}`)).toBeVisible();
  const open = await openEntries(page);
  const sheets = open.filter((e) => e.kind === 'sheet');
  expect(sheets.map((s) => s.id)).toEqual([id]);
  const r = sheets[0]!.rect!;
  const { canvas, spark } = await hud(page);
  expect(overlap(r, spark), `${id} covers the spark bar`).toBe(false);
  const day = await page.locator('#hf-daybar').boundingBox();
  if (day) expect(overlap(r, { left: day.x, top: day.y, width: day.width, height: day.height }), `${id} covers the day chip`).toBe(false);
  if (overlap(r, canvas)) expect(r.width, `${id} is wider than ~40% of the canvas`).toBeLessThanOrEqual(canvas.width * 0.41);
  expect(r.left + r.width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 0.5);
  return r;
}

for (const vp of [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'phone', width: 375, height: 812 },
]) {
  test.describe(`UI kit at ${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('sheets, menus and the HUD share the kit and never overlap', async ({ page }) => {
      test.setTimeout(120_000);
      const SHOTS = shotsDir(`ui-kit/${vp.name}`, `docs/qa/reports/batch2/ui-kit/${vp.name}`);
      const errors = await boot(page);

      // The DOM layer sits exactly over the canvas.
      const { canvas, spark } = await hud(page);
      const layer = await page.locator('#hf-ui-layer').boundingBox();
      expect(layer).not.toBeNull();
      expect(Math.abs(layer!.x - canvas.left)).toBeLessThan(1.5);
      expect(Math.abs(layer!.y - canvas.top)).toBeLessThan(1.5);
      expect(Math.abs(layer!.width - canvas.width)).toBeLessThan(1.5);

      // HUD: spark top-left inside the canvas; day + phase at top-centre; nothing else in the corner.
      expect(spark.left).toBeGreaterThanOrEqual(canvas.left);
      expect(spark.top).toBeGreaterThanOrEqual(canvas.top);
      expect(spark.left + spark.width).toBeLessThan(canvas.left + canvas.width * 0.3);
      await expect(page.locator('#hf-status')).toHaveText(/^Day \d+$/);
      await expect(page.locator('#hf-phase')).toHaveText(/· (dawn|day|dusk|night)/);
      const day = (await page.locator('#hf-daybar').boundingBox())!;
      expect(Math.abs(day.x + day.width / 2 - (canvas.left + canvas.width / 2))).toBeLessThan(2);
      expect(overlap({ left: day.x, top: day.y, width: day.width, height: day.height }, spark)).toBe(false);
      await expect(page.locator('#hf-menu-btn')).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/hud.png` });

      // An unread reply shows as a small chip on the right edge; tapping it opens the letters sheet.
      await expect(page.locator('#hf-letter-chip')).toBeHidden();
      await hearth(page, (h) => {
        const st = h.session.getState();
        st.letters ??= { flight: [], correspondence: [] };
        st.letters.replies ??= [];
        const from = Object.keys(st.people).find((id: string) => id !== st.player.id);
        st.letters.replies.push({ id: 'r_ui_kit', letterId: 'l_ui_kit', fromPersonId: from, status: 'arrived', read: false, sentDay: 1, arrivedDay: 1, title: 'A reply', body: 'We heard.' });
      });
      const chip = page.locator('#hf-letter-chip');
      await expect(chip).toBeVisible();
      await expect(chip).toHaveText('✉ 1');
      const cb = (await chip.boundingBox())!;
      const chipBox = { left: cb.x, top: cb.y, width: cb.width, height: cb.height };
      expect(overlap(chipBox, spark)).toBe(false);
      expect(cb.x + cb.width).toBeLessThanOrEqual(canvas.left + canvas.width + 0.5);
      expect(cb.x + cb.width).toBeGreaterThan(canvas.left + canvas.width - 2); // on the edge
      await page.screenshot({ path: `${SHOTS}/letter-chip.png` });
      await chip.click();
      await expectSheet(page, 'hf-letters');
      await expect(chip).toBeHidden();
      await page.locator('#hf-letters [aria-label^="Unread reply"]').click();
      await page.keyboard.press('Escape');
      await expect(page.locator('#hf-letters')).toBeHidden();
      await expect(chip).toBeHidden(); // read now

      // Satchel (I), then the board replaces it: one sheet at a time.
      await page.keyboard.press('i');
      await expectSheet(page, 'hf-satchel');
      await page.screenshot({ path: `${SHOTS}/satchel.png` });
      const town = await hearth<string>(page, (h) => h.session.snapshot().townId);
      await page.evaluate((t) => (window as unknown as { __hearth: { dev: { board(t: string, p?: number): void } } }).__hearth.dev.board(t, 0), town);
      await expectSheet(page, 'hf-board');
      await expect(page.locator('#hf-satchel')).toBeHidden();
      await expect(page.locator('#hf-board h2')).toContainText('Noticeboard');
      await page.screenshot({ path: `${SHOTS}/board.png` });
      // Tabs move between pages inside the sheet.
      const tabs = page.locator('#hf-board .hf-tabs .hf-btn');
      expect(await tabs.count()).toBeGreaterThan(1);
      await tabs.nth(1).click();
      await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true');
      await expectSheet(page, 'hf-board');

      // Trade.
      expect(await hearth<boolean>(page, (h) => h.dev.ui.openTrade())).toBe(true);
      await expectSheet(page, 'hf-trade');
      await expect(page.locator('#hf-trade h2')).toContainText('Roadside trader');
      await page.screenshot({ path: `${SHOTS}/trade.png` });

      // Letters (L): typing in the letter stays in the field; Esc closes the sheet.
      await page.keyboard.press('Escape');
      await expect(page.locator('#hf-trade')).toBeHidden();
      await page.keyboard.press('l');
      await expectSheet(page, 'hf-letters');
      await expect(page.locator('dialog[open]')).toHaveCount(1);
      await page.locator('#hf-letters textarea').pressSequentially('i m l e');
      expect(await openEntries(page).then((o) => o.map((e) => e.id))).toEqual(['hf-letters']);
      await page.screenshot({ path: `${SHOTS}/letters.png` });
      await page.keyboard.press('Escape');
      await expect(page.locator('#hf-letters')).toBeHidden();
      // Esc on a closed sheet did not open the pause menu as well.
      await expect(page.locator('#hf-pause-menu')).toHaveCount(0);

      // The road out: a sheet-placed menu.
      expect(await hearth<boolean>(page, (h) => h.dev.ui.openRoads())).toBe(true);
      await expectSheet(page, 'hf-road-menu');
      await page.screenshot({ path: `${SHOTS}/road.png` });
      await page.keyboard.press('Escape');
      await expect(page.locator('#hf-road-menu')).toHaveCount(0);

      // Pause: a centred menu; the stack's pause flag pauses the scene; the ☰ button steps aside.
      await page.keyboard.press('Escape');
      await expect(page.locator('#hf-pause-menu')).toBeVisible();
      const paused = await openEntries(page);
      expect(paused.map((e) => [e.id, e.kind, e.pause])).toEqual([['hf-pause-menu', 'menu', true]]);
      expect(await hearth<boolean>(page, (h) => h.scene.scene.isPaused())).toBe(true);
      await expect(page.locator('#hf-menu-btn')).toBeHidden();
      // Focus stays inside the menu.
      for (let i = 0; i < 7; i++) await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('#hf-pause-menu'))).toBe(true);
      await page.screenshot({ path: `${SHOTS}/pause.png` });
      await page.keyboard.press('Escape');
      await expect(page.locator('#hf-pause-menu')).toHaveCount(0);
      expect(await hearth<boolean>(page, (h) => h.scene.scene.isPaused())).toBe(false);

      // ☰ opens the same pause menu (touch).
      await page.locator('#hf-menu-btn').click();
      await expect(page.locator('#hf-pause-menu')).toBeVisible();
      await page.locator('#hf-pause-menu [data-id=resume]').click();
      await expect(page.locator('#hf-pause-menu')).toHaveCount(0);

      // Succession: the one modal. Esc does not dismiss it; the answer does.
      await page.evaluate(() => (window as unknown as { __hearth: { burnOut(): void } }).__hearth.burnOut());
      const succession = page.locator('#succession-screen');
      await expect(succession).toBeVisible({ timeout: 15_000 });
      await page.keyboard.press('Escape');
      await expect(succession).toBeVisible();
      await expect(page.locator('#hf-pause-menu')).toHaveCount(0);
      await page.screenshot({ path: `${SHOTS}/succession.png` });
      await succession.getByRole('button', { name: 'Let it rest' }).click();
      await expect(succession).toBeHidden();

      expect(errors).toEqual([]);
    });
  });
}

test('the Brood menu is a sheet that holds the world still', async ({ page }) => {
  const errors = await boot(page, 'basilisk_brood');
  await page.keyboard.press('b');
  const menu = page.locator('#hf-brood-menu');
  await expect(menu).toBeVisible();
  await expectSheet(page, 'hf-brood-menu');
  expect(await hearth<boolean>(page, (h) => h.scene.scene.isPaused())).toBe(true);
  await page.screenshot({ path: `${shotsDir('ui-kit/desktop', 'docs/qa/reports/batch2/ui-kit/desktop')}/brood.png` });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  expect(await hearth<boolean>(page, (h) => h.scene.scene.isPaused())).toBe(false);
  expect(errors).toEqual([]);
});
