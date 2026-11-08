/**
 * Batch 2 A02: one interaction model. Every kind of thing (a person, a resource node, a noticeboard, a
 * wagon, a signpost, a door, the hearth, a stash chest) is focused by the same resolver and acted on
 * through the same verbs; rings show at most six chips, the five legacy method chips are gone, and the
 * scene no longer lists every villager's actions every frame.
 */
import { test, expect, type Page } from '@playwright/test';
import { hearth, startGame, pickVerb } from './support/game';

type Focus = { kind: string; id: string; prompt: string; verbs: { id: string; label: string }[] } | null;
type View = { family: string | null; chips: { id: string; label: string; tip?: string; verbs?: string[] }[] } | null;

const LEGACY_LABELS = ['Inspire', 'Carry burden', 'Challenge', 'Shame', 'Lie'];
const LEGACY_IDS = /^(inspire|carry_burden|challenge|shame|lie)@/;

const focus = (page: Page, kind?: string): Promise<Focus> => hearth(page, new Function('h', `return h.dev.focus(${kind ? JSON.stringify(kind) : ''})`) as (h: unknown) => Focus);
const act = (page: Page, ref: string, verb: string) =>
  page.evaluate(([r, v]) => (window as unknown as { __hearth: { dev: { act(r: string, v: string): { ok: boolean; line?: string; actionId: string } } } }).__hearth.dev.act(r!, v!), [ref, verb]);
const ringView = (page: Page): Promise<View> => hearth(page, (h: { dev: { ringView(): View } }) => h.dev.ringView());
const lastSay = (page: Page): Promise<string> => hearth(page, (h: { dev: { lastSay(): string } }) => h.dev.lastSay());
const overlayOpen = (page: Page): Promise<boolean> => hearth(page, (h: { scene: { goods: { overlayOpen(): boolean } } }) => h.scene.goods.overlayOpen());

test('one interaction model: a ring on any thing, at most six chips', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await startGame(page, { archetype: 'ivy_quill' }); // a human body fits a cottage door
  await page.waitForTimeout(800);

  // ── A person: families first, then verbs; never more than six; no legacy method chips.
  const pid = await hearth(page, (h: { session: { snapshot(): { townId: string }; listPeople(): { id: string; townId?: string }[] }; scene: { people: { byId: Map<string, { inside: unknown }> } } }) => {
    const town = h.session.snapshot().townId;
    return h.session.listPeople().find((p) => p.townId === town && h.scene.people.byId.get(p.id) && !h.scene.people.byId.get(p.id)!.inside)!.id;
  });
  const chips = await hearth(page, new Function('h', `return h.dev.chips(${JSON.stringify(pid)})`) as (h: unknown) => { id: string; label: string; short?: string }[]);
  expect(chips.some((c) => LEGACY_IDS.test(c.id))).toBe(false);
  expect(chips.map((c) => c.label)).toEqual(expect.arrayContaining(['Speak gently', 'Speak hard', 'Shame them']));
  expect(await hearth(page, new Function('h', `return h.dev.ring(${JSON.stringify(pid)})`) as (h: unknown) => boolean)).toBe(true);
  let view = await ringView(page);
  expect(view!.chips.length).toBeGreaterThan(0);
  expect(view!.chips.length).toBeLessThanOrEqual(6);
  for (const c of view!.chips) {
    expect(LEGACY_LABELS).not.toContain(c.label);
    expect(c.label.length).toBeLessThanOrEqual(16);
  }
  await page.screenshot({ path: test.info().outputPath('person-ring.png') });
  const famIdx = view!.chips.findIndex((c) => c.verbs?.length);
  if (famIdx >= 0) {
    await page.keyboard.press(`Digit${famIdx + 1}`); // a family opens its verbs
    await page.waitForTimeout(120);
    view = await ringView(page);
    expect(view!.family).not.toBeNull();
    expect(view!.chips.length).toBeLessThanOrEqual(6);
    await page.screenshot({ path: test.info().outputPath('person-family.png') });
    await page.keyboard.press('Escape'); // back to the families
    expect((await ringView(page))!.family).toBeNull();
  }
  await page.keyboard.press('Escape');
  expect(await ringView(page)).toBeNull();

  // Real keys through the families: speak gently, and they answer.
  await page.evaluate(() => {
    const w = window as unknown as { __j: string[]; __hearth: { session: { onJuice(f: (id: string, p: unknown) => void): void } } };
    w.__j = [];
    w.__hearth.session.onJuice((id, p) => w.__j.push(`${id}:${(p as { personId?: string })?.personId ?? ''}`));
  });
  await pickVerb(page, pid, `talk_gentle@${pid}`);
  await expect.poll(() => page.evaluate((id) => (window as unknown as { __j: string[] }).__j.some((j) => j === `person.reaction:${id}` || j === `refusal.coal_flicker:${id}`), pid)).toBe(true);

  // dev.focus / dev.act on the person: the same verbs.
  const pf = await focus(page, 'person');
  expect(pf?.kind).toBe('person');
  expect(pf!.verbs.some((v) => LEGACY_IDS.test(v.id))).toBe(false);
  const said = await act(page, `person:${pf!.id}`, 'show_up');
  expect(said.actionId).toBe(`show_up@${pf!.id}`);

  // No more listing the whole world's actions every frame: idle beside people, count the calls.
  const calls = await page.evaluate(async () => {
    const s = (window as unknown as { __hearth: { session: Record<string, (...a: unknown[]) => unknown> } }).__hearth.session;
    const la = s.listActions!, lv = s.listVerbs!;
    let all = 0, verbs = 0;
    s.listActions = (...a: unknown[]) => { all++; return la.apply(s, a); };
    s.listVerbs = (...a: unknown[]) => { verbs++; return lv.apply(s, a); };
    await new Promise((r) => setTimeout(r, 1500));
    s.listActions = la;
    s.listVerbs = lv;
    return { all, verbs };
  });
  expect(calls.all).toBe(0);
  expect(calls.verbs).toBeLessThanOrEqual(3); // once per focus change, not per frame

  // Night: villagers go indoors, so the things themselves are in focus.
  await hearth(page, (h: { interior: { setHour(p: number): void } }) => h.interior.setHour(0.92));
  await page.waitForTimeout(300);

  // ── A resource node: its one verb, by pressing E (the world prompt says what E does).
  const nf = await focus(page, 'node');
  expect(nf?.kind).toBe('node');
  expect(nf!.prompt).toBe('E · Gather');
  expect(nf!.verbs.map((v) => v.id)).toEqual([`gather@node:${nf!.id}`]);
  const invBefore = await hearth(page, (h: { session: { getState(): { inventory?: Record<string, number> } } }) => JSON.stringify(h.session.getState().inventory ?? {}));
  await page.keyboard.press('e');
  await expect.poll(() => hearth(page, (h: { session: { getState(): { inventory?: Record<string, number> } } }) => JSON.stringify(h.session.getState().inventory ?? {}))).not.toBe(invBefore);
  await page.screenshot({ path: test.info().outputPath('node.png') });

  // ── The noticeboard: Read opens its sheet.
  const bf = await focus(page, 'board');
  expect(bf?.kind).toBe('board');
  expect((await act(page, `board:${bf!.id}`, 'read')).ok).toBe(true);
  expect(await overlayOpen(page)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('board.png') });
  await page.keyboard.press('Escape');
  expect(await overlayOpen(page)).toBe(false);

  // ── A wagon on the road: Trade opens the trader's sheet.
  const wf = await focus(page, 'wagon');
  expect(wf?.kind).toBe('wagon');
  expect((await act(page, `wagon:${wf!.id}`, 'trade')).ok).toBe(true);
  expect(await overlayOpen(page)).toBe(true);
  await page.keyboard.press('Escape');

  // ── The signpost: E opens the road menu.
  const sf = await focus(page, 'signpost');
  expect(sf?.kind).toBe('signpost');
  expect(sf!.prompt).toBe('E · Roads');
  await page.keyboard.press('e');
  await expect(page.locator('#hf-road-menu')).toBeVisible();
  await hearth(page, (h: { scene: { roads: { close(): void } } }) => h.scene.roads.close());

  // ── A stash chest: hide coin with a neighbour, then dig it up at the chest itself.
  const helper = await hearth(page, (h: { session: { listPeople(): { id: string }[]; getState(): { player: { coin?: number } } }; dev: { chips(id: string): { id: string }[] } }) => {
    h.session.getState().player.coin = 30;
    return h.session.listPeople().map((p) => p.id).find((id) => h.dev.chips(id).some((c) => c.id === `stash_hide@${id}`)) ?? null;
  });
  expect(helper, 'someone who will keep your coin').not.toBeNull();
  await act(page, `person:${helper}`, 'stash_hide');
  const cf = await focus(page, 'chest');
  expect(cf?.kind).toBe('chest');
  expect(cf!.verbs.map((v) => v.id)).toContain(`stash_withdraw@chest:${cf!.id}`);
  expect((await act(page, `chest:${cf!.id}`, 'stash_withdraw')).ok).toBe(true);
  expect(await hearth(page, (h: { session: { getState(): { player: { coin?: number } } } }) => h.session.getState().player.coin)).toBe(30);

  // ── A door: Enter walks in; inside, the exit is a door too (Leave).
  const df = await focus(page, 'door');
  expect(df?.kind).toBe('door');
  expect(df!.prompt).toBe('E · Enter');
  expect((await act(page, `door:${df!.id}`, 'enter')).ok).toBe(true);
  await expect.poll(() => hearth(page, (h: { interior: { state(): { active: boolean } | null } }) => h.interior.state()?.active ?? false)).toBe(true);
  await page.waitForTimeout(400);
  expect((await act(page, 'door:exit', 'leave')).ok).toBe(true);
  await expect.poll(() => hearth(page, (h: { interior: { state(): unknown } }) => h.interior.state())).toBeNull();
  await page.waitForTimeout(400);

  // ── The hearth: Rest runs the night and brings the dawn.
  const day0 = await hearth(page, (h: { session: { snapshot(): { day: number } } }) => h.session.snapshot().day);
  const hf = await focus(page, 'hearth');
  expect(hf).not.toBeNull();
  const home = await hearth(page, (h: { session: { snapshot(): { townId: string } } }) => h.session.snapshot().townId);
  expect((await act(page, `hearth:${home}`, 'rest')).ok).toBe(true);
  await expect.poll(() => hearth(page, (h: { session: { snapshot(): { day: number } } }) => h.session.snapshot().day), { timeout: 15_000 }).toBe(day0 + 1);
  await expect.poll(() => lastSay(page), { timeout: 15_000 }).toContain('Dawn');

  expect(errors).toEqual([]);
});
