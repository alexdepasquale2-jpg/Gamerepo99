/**
 * Interactable things as code-drawn 1x textures (shown at 2x): resource nodes at three fullness levels
 * (full, picked over, spent), the stash chest and its tally pieces, noticeboard, signpost, facilities
 * and their crew, plot stakes, graves, a ground bundle (tinted by item colour), the hearth and the stall.
 */
import type Phaser from 'phaser';
import { makeTex, type Px } from './px';

/** Node look by fullness: 2 full, 1 picked over, 0 spent. */
type NodePaint = (p: Px, level: number) => void;
const NODES: Record<string, [number, number, NodePaint]> = {
  tree: [20, 28, (p, l) => {
    p.shadow(10, 7, 2);
    if (l === 0) { p.rect(7, 22, 6, 5, '#5a3a24').rect(7, 22, 6, 1, '#a8743e').rect(5, 26, 2, 1, '#5a3a24'); return; }
    p.rect(9, 17, 3, 10, '#5a3a24').rect(9, 17, 1, 10, '#7a5232');
    const r = l === 2 ? 8 : 6;
    p.disc(10, 11, r, r, '#2f5a2a').disc(8, 9, r * 0.6, r * 0.55, '#3f7a34').disc(13, 11, r * 0.45, r * 0.4, '#3f7a34').rect(6, 5, 2, 2, '#5a9a44');
    if (l === 1) p.rect(13, 17, 3, 1, '#5a3a24');
  }],
  rock: [16, 12, (p, l) => {
    p.shadow(8, 7, 2);
    if (l === 0) { p.disc(8, 9, 5, 2, '#6a5a40', 0.7).px(4, 9, '#7a756c').px(11, 10, '#7a756c'); return; }
    const s = l === 2 ? 1 : 0.7;
    p.disc(8, 8, 7 * s, 4 * s, '#6e6e68').disc(7, 6.5, 5 * s, 2.5 * s, '#9a9a92');
    if (l === 1) p.rect(11, 9, 2, 2, '#6e6e68');
  }],
  ore_vein: [16, 12, (p, l) => {
    p.shadow(8, 7, 2).disc(8, 8, 7, 4, '#5e4e44').disc(7, 6.5, 5, 2.4, '#6e5e52');
    const glints: [number, number][] = [[4, 6], [9, 5], [11, 8], [6, 9]];
    glints.slice(0, l === 2 ? 4 : l === 1 ? 2 : 0).forEach(([x, y]) => p.rect(x, y, 2, 2, '#c88a4a').px(x, y, '#f2c080'));
  }],
  berry_bush: [16, 12, (p, l) => {
    p.shadow(8, 7, 2).disc(8, 7, 7.5, 5, l === 0 ? '#4a5a34' : '#2f6a34').disc(6, 5, 4, 2.5, l === 0 ? '#5a6a40' : '#3f7a40');
    const berries: [number, number][] = [[4, 5], [9, 4], [11, 8], [6, 8], [12, 5], [3, 8]];
    berries.slice(0, l === 2 ? 6 : l === 1 ? 2 : 0).forEach(([x, y]) => p.rect(x, y, 2, 2, '#b8324a').px(x, y, '#e8607a'));
  }],
  herb_patch: [16, 10, (p, l) => {
    const n = l === 2 ? 5 : l === 1 ? 3 : 0;
    p.disc(8, 8, 7, 2, '#5a4a30', 0.5);
    for (let i = 0; i < n; i++) p.rect(2 + i * 3, 3 + (i % 2) * 2, 1, 6 - (i % 2) * 2, '#6aa84f').rect(1 + i * 3, 3 + (i % 2) * 2, 3, 1, '#8ac86a');
    if (l > 0) p.rect(3, 2, 2, 1, '#e8e0a0').rect(9, 2, 2, 1, '#e8e0a0');
    else p.rect(4, 7, 1, 2, '#6a5a30').rect(9, 7, 1, 2, '#6a5a30');
  }],
  fishing_spot: [18, 10, (p, l) => {
    p.disc(9, 5, 8.5, 4, '#2f6a8a', 0.55);
    if (l === 0) return void p.rect(7, 5, 4, 1, '#8fb8d0');
    p.rect(4, 4, 3, 1, '#bfe0f0').rect(11, 6, 3, 1, '#bfe0f0');
    if (l === 2) p.rect(8, 2, 2, 1, '#e8f4f8').rect(6, 7, 1, 1, '#e8f4f8').rect(13, 3, 1, 1, '#e8f4f8');
  }],
  sheep_flock: [22, 12, (p, l) => {
    p.shadow(11, 10, 1.5);
    const sheep = (x: number) => p.rect(x + 1, 9, 1, 3, '#3a3028').rect(x + 5, 9, 1, 3, '#3a3028').disc(x + 3.5, 6.5, 4, 3, '#eae4d4').rect(x + 6, 4, 3, 3, '#3a3028');
    if (l === 0) return void p.rect(4, 9, 14, 1, '#7a6a40');
    sheep(1);
    sheep(11);
    if (l === 2) sheep(6);
  }],
};
const NODE_FALLBACK = 'rock';
export const nodeTex = (kindId: string, level: number): string => `w-node-${NODES[kindId] ? kindId : NODE_FALLBACK}-${Math.max(0, Math.min(2, level))}`;

const THINGS: Record<string, [number, number, (p: Px) => void]> = {
  chest: [14, 11, (p) => {
    p.shadow(7, 7, 1.5).rect(1, 4, 12, 6, '#6a4020').rect(1, 2, 12, 3, '#8a5a32').rect(1, 2, 12, 1, '#a8743e');
    p.rect(1, 6, 12, 1, '#f2b84b').rect(6, 4, 2, 3, '#f2b84b').px(6, 5, '#7a5a1a');
  }],
  'chest-open': [14, 13, (p) => {
    p.shadow(7, 7, 1.5).rect(1, 0, 12, 4, '#8a5a32').rect(1, 3, 12, 1, '#5a3a1c').rect(1, 6, 12, 6, '#6a4020').rect(2, 5, 10, 2, '#2a1a10');
    p.rect(1, 8, 12, 1, '#f2b84b');
  }],
  coin: [5, 3, (p) => { p.rect(0, 0, 5, 3, '#c8962e').rect(0, 0, 5, 1, '#f2d27a').px(2, 1, '#f2b84b'); }],
  sack: [7, 7, (p) => { p.disc(3.5, 4.5, 3.2, 2.5, '#c8a46a').rect(2, 1, 3, 2, '#b08a54').px(3, 0, '#7a5a34'); }],
  guard: [6, 16, (p) => {
    p.rect(2, 0, 1, 16, '#7a5a3a').rect(1, 0, 3, 2, '#c8c8d0').rect(0, 8, 6, 5, '#4f7a8a').rect(1, 9, 4, 3, '#8ab0c0').px(2, 10, '#f2b84b');
  }],
  board: [30, 26, (p) => {
    p.shadow(15, 12, 2).rect(4, 10, 2, 16, '#59412d').rect(24, 10, 2, 16, '#59412d');
    p.rect(1, 1, 28, 16, '#68472e').rect(2, 2, 26, 14, '#a87643').rect(2, 2, 26, 1, '#c08c58');
    for (let i = 0; i < 3; i++) { const x = 4 + i * 8, y = 4 + (i % 2) * 2; p.rect(x, y, 6, 9, '#e9d4a2').rect(x + 1, y + 2, 4, 1, '#907951').rect(x + 1, y + 4, 3, 1, '#907951').px(x + 3, y, '#b8324a'); }
  }],
  signpost: [32, 28, (p) => {
    p.shadow(16, 6, 1.5).rect(15, 2, 3, 26, '#59412d').rect(15, 2, 1, 26, '#7a5a3a');
    p.rect(16, 4, 12, 6, '#a87643').rect(16, 4, 12, 1, '#c08c58');
    for (let i = 0; i < 3; i++) p.rect(28 + i, 5 + i * 0.5, 1, 4 - i, '#a87643');
    p.rect(5, 12, 11, 6, '#93653a').rect(5, 12, 11, 1, '#b07a4a');
    for (let i = 0; i < 3; i++) p.rect(4 - i, 13 + i * 0.5, 1, 4 - i, '#93653a');
  }],
  mill: [36, 40, (p) => {
    p.shadow(18, 13, 2.5).rect(9, 18, 18, 21, '#8a8274').rect(10, 19, 7, 19, '#b0a894').roof(7, 9, 22, 10, '#7a3a28').rect(15, 30, 6, 9, '#3a2a1c').rect(22, 24, 3, 3, '#f2d28a');
    for (let i = 0; i < 12; i++) { p.rect(6 + i * 2, 3 + i * 2, 3, 2, '#5a3e26'); p.rect(30 - i * 2, 3 + i * 2, 3, 2, '#5a3e26'); }
    p.rect(4, 3, 7, 3, '#e8dcc0').rect(25, 3, 7, 3, '#e8dcc0').rect(4, 22, 7, 3, '#e8dcc0').rect(25, 22, 7, 3, '#e8dcc0').disc(18, 14, 2, 2, '#3a2a1c');
  }],
  lumber_camp: [36, 28, (p) => {
    p.shadow(18, 15, 2);
    for (let i = 0; i < 20; i++) p.rect(17 - i * 0.8, 6 + i, 2 + i * 0.8, 1, i % 5 === 0 ? '#8b5a2b' : '#6a4a2a');
    p.rect(18, 6, 2, 20, '#5a3a24');
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) p.disc(23 + j * 4 + i * 2, 23 - i * 4, 2, 2, '#7a5232').px(23 + j * 4 + i * 2, 23 - i * 4, '#d9b07a');
    p.rect(30, 8, 1, 8, '#8a8a90').rect(28, 6, 4, 2, '#c8c8d0');
  }],
  mine: [36, 30, (p) => {
    p.shadow(18, 16, 2);
    for (let i = 0; i < 28; i++) { const w = 4 + i * 1.15; p.rect(16 - w / 2, 1 + i, w, 1, i < 6 ? '#8a8a92' : '#6a6a72'); }
    p.rect(12, 17, 9, 12, '#1b1612').rect(11, 15, 11, 2, '#6a4a2a').rect(11, 15, 2, 14, '#6a4a2a').rect(20, 15, 2, 14, '#6a4a2a');
    p.rect(24, 24, 9, 4, '#4a3a2c').rect(25, 22, 3, 2, '#c88a4a').rect(29, 22, 3, 2, '#c88a4a').disc(26, 28, 1.5, 1.5, '#2a1a10').disc(31, 28, 1.5, 1.5, '#2a1a10');
  }],
  waystation: [36, 34, (p) => {
    p.shadow(17, 14, 2).rect(5, 15, 22, 18, '#c4a574').rect(21, 15, 6, 18, '#a68a5c').roof(2, 4, 28, 12, '#8a3a2a', '#a84a3a');
    p.rect(13, 23, 6, 10, '#3a2a1c').rect(8, 19, 3, 3, '#f2d28a').rect(21, 19, 3, 3, '#f2d28a').rect(30, 18, 1, 15, '#6a4a2a').rect(28, 20, 7, 1, '#6a4a2a').rect(32, 21, 1, 3, '#f2b84b');
  }],
  crew: [8, 14, (p) => {
    p.shadow(4, 3, 1).rect(2, 10, 1, 4, '#3a2a1c').rect(5, 10, 1, 4, '#3a2a1c').rect(1, 5, 6, 6, '#7a5a3a').rect(1, 5, 6, 1, '#9a7a5a').rect(2, 1, 4, 4, '#e0b890').rect(2, 1, 4, 1, '#5a3a24');
  }],
  'crew-tool': [10, 14, (p) => {
    p.shadow(4, 3, 1).rect(2, 10, 1, 4, '#3a2a1c').rect(5, 10, 1, 4, '#3a2a1c').rect(1, 5, 6, 6, '#5a6a7a').rect(2, 1, 4, 4, '#e0b890').rect(7, 2, 1, 10, '#7a5a3a').rect(6, 1, 4, 2, '#a8a8b0');
  }],
  stake: [4, 10, (p) => { p.rect(1, 0, 2, 10, '#6a4a2a').rect(1, 0, 2, 1, '#9a6a3a').rect(0, 2, 4, 1, '#f2b84b'); }],
  timber: [12, 4, (p) => { p.rect(0, 0, 12, 4, '#9a6a3a').rect(0, 0, 12, 1, '#c8945a').rect(11, 1, 1, 2, '#d9b07a'); }],
  'frame-post': [3, 24, (p) => { p.rect(0, 0, 3, 24, '#9a6a3a').rect(0, 0, 1, 24, '#b8885a'); }],
  grave: [10, 14, (p) => {
    p.shadow(5, 5, 1.5).rect(1, 11, 8, 2, '#5a4a30').rect(2, 2, 6, 10, '#8a8a84').rect(3, 1, 4, 1, '#8a8a84').rect(2, 2, 1, 10, '#a8a8a0').rect(4, 5, 2, 1, '#5a5a54').rect(3, 7, 4, 1, '#5a5a54');
    p.px(1, 12, '#e8a0c0').px(8, 12, '#f0d878');
  }],
  bundle: [8, 6, (p) => { p.shadow(4, 3.5, 1.2).disc(4, 3, 3.5, 2.4, '#ffffff').rect(3, 1, 2, 1, '#d8d8d8').px(4, 0, '#bcbcbc'); }],
  hearth: [18, 8, (p) => {
    p.shadow(9, 8, 2).disc(9, 5, 8, 3, '#5a5550').disc(9, 4.5, 6, 2, '#2a2018').rect(4, 4, 10, 2, '#5a3a24').rect(5, 3, 8, 1, '#7a5232');
    for (const x of [1, 4, 13, 16]) p.rect(x, 5, 2, 2, '#8a857a');
  }],
  stall: [24, 20, (p) => {
    p.shadow(12, 11, 1.5).rect(2, 8, 2, 12, '#6a4a2a').rect(20, 8, 2, 12, '#6a4a2a').rect(1, 13, 22, 4, '#8a5a32').rect(1, 13, 22, 1, '#a8743e');
    p.rect(0, 4, 24, 4, '#c8423a');
    for (let x = 3; x < 24; x += 6) p.rect(x, 4, 3, 4, '#f4e6c8');
  }],
  'stall-goods': [20, 4, (p) => { p.rect(0, 0, 5, 4, '#d9a45b').rect(6, 0, 4, 4, '#b8324a').rect(11, 0, 4, 4, '#8a5a32').rect(16, 0, 4, 4, '#6aa84f'); }],
  well: [24, 26, (p) => {
    p.shadow(12, 11, 2).rect(4, 18, 16, 7, '#777f79').rect(4, 18, 16, 2, '#c6c3a5').rect(6, 19, 12, 2, '#283e42');
    p.rect(3, 6, 2, 13, '#725137').rect(19, 6, 2, 13, '#725137').roof(0, 0, 24, 7, '#995b48', '#c27d59').rect(11, 7, 1, 10, '#c7a878');
  }],
};

export const thingTex = (id: string): string => `w-thing-${id}`;

export function paintThingTextures(scene: Phaser.Scene): void {
  for (const [id, [w, h, draw]] of Object.entries(NODES)) for (let l = 0; l <= 2; l++) makeTex(scene, nodeTex(id, l), w, h, (p) => draw(p, l));
  for (const [id, [w, h, draw]] of Object.entries(THINGS)) makeTex(scene, thingTex(id), w, h, draw);
}
