/** People's inner state, surfaced: wound x method chemistry, marks (line + body tell), civic voice, notoriety, inherited dependence. */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = 'test-results/inner-state';
const methods = JSON.parse(fs.readFileSync('src/data/systems/methods.json', 'utf8')) as { methods: { id: string; effectiveness?: Record<string, number> }[] };
const fallbacks = JSON.parse(fs.readFileSync('src/data/dialogue/surface-fallbacks.json', 'utf8')) as { lines: Record<string, string[]> };
const linesFor = (prefix: string): string[] => Object.entries(fallbacks.lines).filter(([k]) => k === prefix || k.startsWith(`${prefix}.`)).flatMap(([, v]) => v);

type J = { id: string; p: Record<string, unknown> };
type Hearth = {
  session: {
    act(id: string): void;
    listPeople(): { id: string; townId?: string; woundId?: string; marks?: { markId: string; stacks: number }[] }[];
    snapshot(): { townId: string; day: number };
    onJuice(h: (id: string, p: unknown) => void): () => void;
    getState(): { player: { spark: number; statusTraits: string[] }; people: Record<string, { flame: number }> };
  };
  scene: { people: { markTell(id: string): { markId: string; glyph: string; visible: boolean } | null }; ring: { isOpen(): boolean } };
  surface: { bubbles(): { personId: string; line: string }[]; feed(id: string, p: unknown): void };
  dev: { chips(id: string): { id: string; label: string }[]; ring(id: string): boolean; rest(): Promise<string[]>; arriveAt(t: string): void };
};
declare global {
  interface Window {
    __hearth?: Hearth;
    __juice?: J[];
  }
}

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('[data-id=new]').click();
  await page.locator('[data-id=arch-marrow]').click();
  await page.locator('[data-id=world-known]').click(); // the world you know (seed 42)
  await expect(page.locator('#game canvas')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!window.__hearth, null, { timeout: 20_000 });
  await page.evaluate(() => {
    window.__juice = [];
    window.__hearth!.session.onJuice((id, p) => window.__juice!.push({ id, p: (p ?? {}) as Record<string, unknown> }));
  });
}

const juice = (page: Page, id: string): Promise<J[]> => page.evaluate((jid) => window.__juice!.filter((j) => j.id === jid), id);
const bubbleOf = (page: Page, pid: string): Promise<string | undefined> =>
  page.evaluate((id) => window.__hearth!.surface.bubbles().find((b) => b.personId === id)?.line, pid);

test.describe('inner state through people', () => {
  test.describe.configure({ timeout: 300_000 });
  test.beforeAll(() => fs.mkdirSync(OUT, { recursive: true }));

  test('an act whose method meets the wound says so; marks speak and stay on the body', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await page.waitForTimeout(800);

    // Find someone at home and a ring chip whose method clearly meets (or misses) their wound.
    const town = await page.evaluate(() => window.__hearth!.session.snapshot().townId);
    const folk = await page.evaluate((t) => window.__hearth!.session.listPeople().filter((p) => p.townId === t), town);
    let pick: { pid: string; index: number; mul: number } | null = null;
    for (const p of folk) {
      const chips = await page.evaluate((id) => window.__hearth!.dev.chips(id), p.id);
      chips.slice(0, 7).forEach((c, index) => {
        const m = methods.methods.find((x) => c.id === `${x.id}@${p.id}`);
        const mul = m?.effectiveness?.[p.woundId ?? ''];
        if (!pick && mul !== undefined && (mul >= 1.2 || mul <= 0.7)) pick = { pid: p.id, index, mul };
      });
      if (pick) break;
    }
    expect(pick, 'a chip with clear wound chemistry').not.toBeNull();
    const { pid, index, mul } = pick!;

    // Real keys: open the ring beside them, press the chip's number.
    expect(await page.evaluate((id) => window.__hearth!.dev.ring(id), pid)).toBe(true);
    await page.keyboard.press(`Digit${index + 1}`);
    await expect.poll(() => juice(page, 'person.wound').then((j) => j.length)).toBeGreaterThan(0);
    const w = (await juice(page, 'person.wound'))[0]!;
    expect(w.p).toMatchObject({ personId: pid, woundMul: mul });
    // First bubble over them is the chemistry line, keyed deep/slid.
    const first = await bubbleOf(page, pid);
    expect(linesFor(mul >= 1.2 ? 'wound_deep' : 'wound_slid')).toContain(first);
    await page.screenshot({ path: `${OUT}/wound-chemistry.png` });

    // Keep acting on townsfolk until a mark lands; its line queues over them and a glyph sits by their name.
    let marked: J | undefined;
    for (let round = 0; round < 6 && !marked; round++) {
      for (const p of folk) {
        await page.evaluate((id) => {
          const h = window.__hearth!;
          h.session.getState().player.spark = 100;
          const chip = h.dev.chips(id).find((c) => /^(challenge|carry_burden|inspire|shame|lie)@/.test(c.id));
          if (chip) h.session.act(chip.id);
        }, p.id);
        marked = (await juice(page, 'mark.applied'))[0];
        if (marked) break;
      }
    }
    expect(marked, 'some act left a mark').toBeTruthy();
    const mpid = marked!.p.personId as string;
    await expect.poll(() => page.evaluate((id) => window.__hearth!.scene.people.markTell(id), mpid)).not.toBeNull();
    const tell = await page.evaluate((id) => window.__hearth!.scene.people.markTell(id), mpid);
    expect(tell!.glyph.length).toBeGreaterThan(0);
    const said = await page.evaluate((id) => window.__hearth!.surface.bubbles().some((b) => b.personId === id), mpid);
    expect(said).toBe(true);
    await page.screenshot({ path: `${OUT}/mark-tell.png` });
    expect(errors).toEqual([]);
  });

  test('standing up earns a civic voice the crowd names; notoriety talk scales; inherited dependence is named at dawn', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    await page.waitForTimeout(800);

    // Stand up for three different townsfolk (the stand_up act) -> civic_voice; the crowd says it.
    const gained = await page.evaluate(() => {
      const h = window.__hearth!;
      const town = h.session.snapshot().townId;
      const st = h.session.getState();
      const folk = h.session.listPeople().filter((p) => p.townId === town).slice(0, 3);
      for (const p of folk) st.people[p.id]!.flame = 0;
      for (const p of folk) {
        st.player.spark = 100;
        h.session.act(`challenge@${p.id}`);
      }
      return st.player.statusTraits.includes('civic_voice');
    });
    expect(gained).toBe(true);
    const gain = (await juice(page, 'status.gain'))[0]!;
    expect(gain.p.traitId).toBe('civic_voice');
    const civic = fallbacks.lines['status_gain.civic_voice']!;
    await expect.poll(() => page.evaluate(() => window.__hearth!.surface.bubbles().map((b) => b.line))).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(civic.map((l) => l.replace(/[.?]/g, '\\$&')).join('|')))]));
    await page.screenshot({ path: `${OUT}/civic-voice.png` });

    // Notoriety: a high-notoriety rise reads differently from a whisper (sim emits notoriety.rise; fed here at a set level).
    await page.waitForTimeout(9000); // let the civic queue clear
    await page.evaluate(() => window.__hearth!.surface.feed('notoriety.rise', { notoriety: 0.7 }));
    await expect
      .poll(() => page.evaluate(() => window.__hearth!.surface.bubbles().map((b) => b.line)))
      .toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(fallbacks.lines['notoriety_rise.infamous']!.map((l) => l.replace(/[.?]/g, '\\$&')).join('|')))]));

    // Inherited dependence: while held, someone names it at dawn; the dawn it lets go, they say that too.
    await page.evaluate(() => {
      const st = window.__hearth!.session.getState();
      st.player.statusTraits.push('inherited_dependence');
      st.player.spark = 60;
    });
    const held = await page.evaluate(() => window.__hearth!.dev.rest());
    expect(held.some((l) => / lean on people | reach for a hand/.test(l))).toBe(true);
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      window.__hearth!.session.getState().player.spark = 95;
    });
    const resolved = await page.evaluate(() => window.__hearth!.dev.rest());
    expect(resolved.some((l) => /stand on your own|steadied overnight/.test(l))).toBe(true);
    await page.waitForTimeout(2800);
    expect(await page.evaluate(() => (window as unknown as { __hearth: { dev: { lastSay(): string } } }).__hearth.dev.lastSay())).toMatch(/Dawn|own|steadied/);
    await page.screenshot({ path: `${OUT}/dependence-dawn.png` });
    expect(errors).toEqual([]);
  });
});
