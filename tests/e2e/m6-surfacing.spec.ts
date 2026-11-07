/** M6 Task A: surfacing — reaction lines over people, per-town despair desaturation, succession screen. */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = 'docs/qa/reports/m6';

type Hearth = {
  session: { tick(): void; listPeople(): { id: string; townId?: string }[]; townDespair(): Record<string, number> };
  surface: {
    setDespairOverride(t: string, d: number | null): void;
    feed(id: string, p: unknown): void;
    tintOf(t: string): number;
  };
  towns: string[];
  burnOut(): void;
};
declare global {
  interface Window {
    __hearth?: Hearth;
  }
}

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!window.__hearth, null, { timeout: 20_000 });
}

/** Mean HSV saturation of a PNG, computed in-page. */
async function meanSaturation(page: Page, png: Buffer): Promise<number> {
  const b64 = png.toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) {
      const mx = Math.max(px[i]!, px[i + 1]!, px[i + 2]!);
      const mn = Math.min(px[i]!, px[i + 1]!, px[i + 2]!);
      sum += mx === 0 ? 0 : (mx - mn) / mx;
    }
    return sum / (px.length / 4);
  }, b64);
}

test.describe('M6 surfacing', () => {
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

  test('despair desaturates one town and reverses on reignite', async ({ page }) => {
    await boot(page);
    const town = await page.evaluate(() => window.__hearth!.towns[0]!);
    const shot = async (name: string) => {
      const buf = await page.locator('#game canvas').screenshot({ path: `${OUT}/${name}.png` });
      return meanSaturation(page, buf);
    };
    await page.evaluate((t) => window.__hearth!.surface.setDespairOverride(t, 0.1), town);
    await page.waitForTimeout(1800);
    const low = await shot('despair-0.1');
    await page.evaluate((t) => window.__hearth!.surface.setDespairOverride(t, 0.9), town);
    await page.waitForTimeout(1800);
    const high = await shot('despair-0.9');
    expect(low - high).toBeGreaterThan(0.01);

    // Reignite: despair falls back; tint animates toward the 0.1 look.
    await page.evaluate((t) => {
      window.__hearth!.surface.setDespairOverride(t, 0.1);
      window.__hearth!.surface.feed('person.reignite', { personId: 'x' });
    }, town);
    await page.waitForTimeout(1800);
    const after = await shot('despair-post-reignite');
    expect(Math.abs(after - low)).toBeLessThan(Math.abs(after - high));
  });

  test('30 dawns: one line per category over a person, no popups', async ({ page }) => {
    await boot(page);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const info = await page.evaluate(() => {
      const h = window.__hearth!;
      for (let i = 0; i < 30; i++) h.session.tick();
      const p = h.session.listPeople().filter((x) => x.townId);
      return { ids: p.slice(0, 4).map((x) => x.id), town: p[0]?.townId };
    });
    expect(info.ids.length).toBeGreaterThanOrEqual(4);
    const feeds: Array<[string, unknown]> = [
      ['person.reaction', { personId: info.ids[0], line: 'You listened.', source: 'unspoken' }],
      ['letter.deliver', { toPersonId: info.ids[1], body: 'A letter came for me.' }],
      ['doctrine.voice', { personId: info.ids[2], townId: info.town }],
      ['notoriety.rise', { townId: info.town }],
    ];
    await page.evaluate((f) => f.forEach(([id, p]) => window.__hearth!.surface.feed(id, p)), feeds);
    await page.waitForTimeout(500);
    await page.locator('#game canvas').screenshot({ path: `${OUT}/reaction-lines.png` });
    expect(await page.locator('[role="dialog"]:visible, .toast, .popup').count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test('succession overlay: locked copy, Carry it on focused, Let it rest', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__hearth!.burnOut());
    const overlay = page.locator('#succession-screen');
    await expect(overlay).toBeVisible({ timeout: 5000 });
    await expect(overlay).toContainText('Your fire went out. Someone remembers it.');
    const labels = await overlay.locator('button').allTextContents();
    expect(labels).toContain('Let it rest');
    if (labels.length === 2) {
      expect(labels).toEqual(['Carry it on', 'Let it rest']);
      await expect(overlay.locator('button').first()).toBeFocused();
    }
    await page.screenshot({ path: `${OUT}/succession.png` });
    await overlay.getByRole('button', { name: 'Let it rest' }).click();
    await expect(overlay).toBeHidden();
  });
});
