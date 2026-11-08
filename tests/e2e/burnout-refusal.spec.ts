/** Unit 1: refusal and burnout are seen in the live overworld (coal flicker at a head; dying coal before succession). */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = 'test-results/burnout-refusal';

type FxEntry = { id: string; payload: { x: number; y: number; kind?: string }; at: number };

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  const arch = page.locator('[data-id=arch-marrow]');
  if (await arch.count()) await arch.click();
  const world = page.locator('[data-id=world-known]');
  if (await world.count()) await world.click(); // the world you know (seed 42)
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!(window as any).__hearth, null, { timeout: 20_000 });
  await page.waitForTimeout(800);
  return errors;
}

test.describe('burnout & refusal on screen', () => {
  test.setTimeout(180_000);
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

  test('refusing to shame a child flickers the coal at their head and speaks the refusal', async ({ page }) => {
    const errors = await boot(page);
    // Find a child the ring offers "shame" on, stand beside them (the deed path is real: E opens the ring).
    const target = await page.evaluate(() => {
      const h = (window as any).__hearth;
      const sc = h.scene;
      const ids = [...sc.people.byId.keys()] as string[];
      for (const id of ['jonah_pike', ...ids]) {
        const p = sc.people.byId.get(id);
        if (!p || p.inside) continue;
        const chips = sc.chipsFor(id) as { id: string }[];
        const idx = chips.findIndex((c) => c.id === `shame@${id}`);
        if (idx < 0 || idx > 7) continue;
        return { id, idx };
      }
      return null;
    });
    expect(target, 'a person with a shame chip').not.toBeNull();
    await page.evaluate((id) => {
      const sc = (window as any).__hearth.scene;
      const p = sc.people.byId.get(id);
      sc.people.freeze(id);
      sc.player.setPosition(p.sprite.x + 24, p.sprite.y);
      sc.cameras.main.centerOn(sc.player.x, sc.player.y);
    }, target!.id);
    await page.waitForTimeout(300);
    // E opens the ring on the nearest person; if someone else stands nearer, open theirs directly.
    await page.keyboard.press('e');
    await page.evaluate((id) => {
      const sc = (window as any).__hearth.scene;
      if (sc.ringFor !== id) { sc.closeRing(); sc.openRing(sc.people.byId.get(id)); }
    }, target!.id);
    await expect.poll(() => page.evaluate(() => (window as any).__hearth.scene.ring.isOpen())).toBe(true);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8'];
    await page.keyboard.press(keys[target!.idx]!);
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${OUT}/refusal.png` });

    const refusal = await page.evaluate(() => ((window as any).__hearth.fx() as FxEntry[]).find((e) => e.id === 'vfx.refusal') ?? null);
    const resolve = await page.evaluate(() => (window as any).__hearth.session.lastResolve());
    expect(resolve?.kind, `${target!.id} refuses`).toBe('refused');
    expect(refusal).not.toBeNull();
    const head = await page.evaluate((id) => (window as any).__hearth.scene.people.headOf(id), target!.id);
    expect(Math.abs(refusal!.payload.x - head.x)).toBeLessThan(2);
    expect(Math.abs(refusal!.payload.y - (head.y + 10))).toBeLessThan(2);
    expect(refusal!.payload.kind).toBe('shame');
    // The refusal line is spoken in the say strip.
    const said = await page.evaluate(() => (window as any).__hearth.scene.hint.text as string);
    expect(said.length).toBeGreaterThan(10);
    expect(said).not.toMatch(/turns away/);
    expect(errors).toEqual([]);
  });

  test('burnout snuffs the coal at the player before the succession overlay opens', async ({ page }) => {
    const errors = await boot(page);
    const overlay = page.locator('#succession-screen');
    // Real path: spark spent, rest at dawn (fade out -> tick -> fade in), then the coal dies on screen.
    // rest() starts a camera fade-out, which Phaser ignores while another fade runs; wait for quiet.
    await page.waitForFunction(() => !(window as any).__hearth.scene.cameras.main.fadeEffect.isRunning, null, { timeout: 15_000 });
    await page.evaluate(() => {
      const h = (window as any).__hearth;
      // In-page frame recorder: when the offer opened, when the burnout played, when the overlay showed.
      const rec: Record<string, unknown> = {};
      (window as any).__succRec = rec;
      const burned = (): boolean => (h.fx() as FxEntry[]).some((e) => e.id === 'vfx.burnout');
      const loop = (): void => {
        const now = h.scene.time.now as number;
        if (rec.openAt == null && h.session.successionOffer()) { rec.openAt = now; rec.burnedAtOpen = burned(); }
        const el = document.getElementById('succession-screen');
        if (rec.overlayAt == null && el && el.style.display === 'flex') { rec.overlayAt = now; rec.burnedAtOverlay = burned(); }
        if (rec.overlayAt == null) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      h.session.getState().player.spark = 0;
      h.scene.rest();
    });
    const diag = (): Promise<string> =>
      page.evaluate(() => {
        const h = (window as any).__hearth;
        const f = h.scene.cameras.main.fadeEffect;
        return JSON.stringify({ now: h.scene.time.now, resting: h.scene.resting, fade: [f.isRunning, f.isComplete, f.direction], open: !!h.session.successionOffer(), day: h.session.snapshot().day, fx: h.fx().map((e: FxEntry) => e.id) });
      });
    try {
      await page.waitForFunction(() => ((window as any).__hearth.fx() as FxEntry[]).some((e) => e.id === 'vfx.burnout'), null, { timeout: 30_000 });
    } catch (e) {
      throw new Error(`burnout never played: ${await diag()}`);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/burnout.png` });
    const burn = await page.evaluate(() => {
      const h = (window as any).__hearth;
      const e = (h.fx() as FxEntry[]).find((x) => x.id === 'vfx.burnout')!;
      return { e, player: { x: h.scene.player.x, y: h.scene.player.y } };
    });
    expect(Math.abs(burn.e.payload.x - burn.player.x)).toBeLessThan(2);
    expect(Math.abs(burn.e.payload.y - (burn.player.y - 20))).toBeLessThan(2);
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    const rec = await page.evaluate(() => (window as any).__succRec as { openAt: number; burnedAtOpen: boolean; overlayAt: number; burnedAtOverlay: boolean });
    // The offer opened while the rest fade still covered the screen: the coal waited to be seen.
    expect(rec.burnedAtOpen).toBe(false);
    // The dying coal played first and held the overlay back for ~holdMs.
    expect(rec.burnedAtOverlay).toBe(true);
    expect(rec.overlayAt - burn.e.at).toBeGreaterThanOrEqual(1000);
    await expect(overlay).toContainText('Your fire went out. Someone remembers it.');
    await page.screenshot({ path: `${OUT}/succession-after-burnout.png` });
    expect(errors).toEqual([]);
  });
});
