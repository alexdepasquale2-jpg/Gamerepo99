import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLORS, cssVars, PALETTE_UI, phaserColor, phaserText, rgba } from '../../../src/ui/kit/tokens';
import { KIT_CSS } from '../../../src/ui/kit/style';

const palette = fs.readFileSync('docs/art/PALETTE.md', 'utf8');
/** Every #RRGGBB written in PALETTE.md. */
const paletteHex = new Set([...palette.matchAll(/#([0-9A-Fa-f]{6})\b/g)].map((m) => `#${m[1]!.toUpperCase()}`));

describe('kit tokens', () => {
  it('the UI / overlay tokens are PALETTE.md verbatim', () => {
    const row = (name: string) => new RegExp(`\\| ${name.replace('.', '\\.')} \\| \`(#[0-9A-F]{6})\``, 'i').exec(palette)?.[1]?.toUpperCase();
    expect(PALETTE_UI.void).toBe(row('void'));
    expect(PALETTE_UI.textPrimary).toBe(row('text.primary'));
    expect(PALETTE_UI.textMuted).toBe(row('text.muted'));
    expect(PALETTE_UI.sparkFill).toBe(row('spark.fill'));
    expect(PALETTE_UI.sparkOutline).toBe(row('spark.outline'));
    expect(PALETTE_UI.wound).toBe(row('wound'));
    expect(PALETTE_UI.letter).toBe(row('letter'));
  });

  it('every colour token is a colour from PALETTE.md', () => {
    for (const [k, v] of Object.entries(COLORS)) expect(paletteHex.has(v.toUpperCase()), `${k} ${v}`).toBe(true);
  });

  it('spark is dual-cued: gold fill + cyan outline', () => {
    expect(COLORS.sparkFill).toBe('#F2B84B');
    expect(COLORS.sparkOutline).toBe('#5EC8C8');
    expect(phaserColor('sparkOutline')).toBe(0x5ec8c8);
  });

  it('converts tokens for Phaser and CSS', () => {
    expect(phaserColor('void')).toBe(0x0b0a0f);
    expect(phaserColor('#123456')).toBe(0x123456);
    expect(() => phaserColor('nope')).toThrow();
    expect(rgba('void', 0.5)).toBe('rgba(11,10,15,0.5)');
    expect(rgba('void', 3)).toBe('rgba(11,10,15,1)');
    expect(cssVars()).toContain('--hf-text-primary:#E8DCC8;');
    expect(cssVars()).toContain('--hf-spark-outline:#5EC8C8;');
    expect(phaserText('heading').color).toBe(COLORS.accent);
  });

  it('the stylesheet uses only token colours', () => {
    const hexes = [...KIT_CSS.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0].toUpperCase());
    const allowed = new Set(Object.values(COLORS).map((c) => c.toUpperCase()));
    for (const h of hexes) expect(allowed.has(h), h).toBe(true);
  });
});
