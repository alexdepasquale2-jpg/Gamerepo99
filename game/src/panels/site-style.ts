/**
 * The few rules the site ledger and the Sites tab need beyond the shared hf- classes: worker pips, a
 * wanted mark, the wage stepper's number. Colours come from the kit's CSS variables (ui/kit/tokens).
 */
const CSS = `
.hf-site-pips{display:inline-flex;gap:3px;vertical-align:middle;margin-left:6px}
.hf-site-pip{width:7px;height:7px;border-radius:50%;background:var(--hf-glow);display:inline-block}
.hf-site-pip.is-off{background:transparent;box-shadow:inset 0 0 0 1px var(--hf-line-quiet)}
.hf-site-wanted{color:var(--hf-accent);font-weight:bold;letter-spacing:.04em}
.hf-site-wage{display:inline-block;min-width:3ch;text-align:center;font-family:var(--hf-font-mono)}
.hf-site-row{display:flex;flex-direction:column;align-items:flex-start;text-align:left;width:100%}
`;

let injected = false;
export function ensureSiteStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'hf-site-style';
  style.textContent = CSS;
  document.head.append(style);
}
