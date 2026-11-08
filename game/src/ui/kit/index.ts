/**
 * UI kit: the one look for every DOM surface (README rule 7). Other areas may import `../ui/kit` for
 * styling: tokens and colours, the canvas-aligned layer, the overlay stack, and the small builders.
 * Panels open their sheets through `ctx.ui.sheet()` (one at a time); `createSheet` is here for the ui
 * area's own sheets and for completeness.
 *
 * - tokens: PALETTE_UI, COLORS, FONTS, THEME, SHAPE, SIZES, HUD_LAYOUT, Z, PAD_RESERVE_BOTTOM_PX,
 *   phaserColor, rgba, cssVars, phaserText
 * - layer: uiLayer() (DOM over the 640x360 FIT canvas), fitRect, sheetBox, textSizes, GAME_W, GAME_H
 * - overlay stack: overlays, createOverlayStack, installOverlayKeys (Esc/back, focus trap, pause flag)
 * - sheet: createSheet, kitButton, kitEl
 * - menu: openMenu (centred or in the sheet slot)
 * - modal: createModal, choiceButton
 * - phaser panel: drawPhaserPanel, addPhaserPanel (same look on the canvas)
 * - style: ensureKitStyle, KIT_CSS (class names: hf-btn, hf-field, hf-label, hf-muted, hf-small, hf-rows,
 *   hf-num, hf-slots, hf-slot, hf-list-btn, hf-read, hf-tabs, hf-cols, hf-pre, hf-glow, hf-chip)
 */
export * from './tokens';
export * from './layer';
export * from './overlay-stack';
export * from './sheet';
export * from './menu';
export * from './modal';
export * from './phaser-panel';
export { ensureKitStyle, KIT_CSS } from './style';
