/** The Works sheet's few rules beyond the kit's hf- classes. Colours come from the kit's CSS variables. */
const CSS = `
.hf-works-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin:0 0 6px}
.hf-works-head strong{font:600 1.05em/1.2 var(--hf-font-display,Georgia,serif);color:var(--hf-accent,#F2B84B)}
.hf-works-towns{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 8px}
.hf-works-towns .hf-btn{padding:2px 8px;font-size:12px}
.hf-works-towns .is-on{border-color:var(--hf-accent,#F2B84B);color:var(--hf-accent,#F2B84B)}
.hf-works-sec{margin:10px 0 4px}
.hf-works-sec .hf-subhead{margin:0 0 4px}
.hf-works-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 8px;padding:5px 6px;margin:2px 0;border:1px solid var(--hf-border,rgba(184,152,96,.28));border-radius:var(--hf-r-md,8px);background:rgba(11,10,15,.22)}
.hf-works-row.is-done{border-color:rgba(94,200,200,.45)}
.hf-works-row.is-locked{opacity:.55}
.hf-works-row__text{display:flex;flex-direction:column;min-width:0;flex:1 1 160px}
.hf-works-row__acts{display:flex;flex-wrap:wrap;gap:3px;justify-content:flex-end}
.hf-works-btn{padding:2px 8px;font-size:12px;white-space:nowrap}
.hf-works-btn.is-hot{border-color:var(--hf-accent,#F2B84B)}
.hf-works-bar{height:6px;margin:3px 0 1px;border-radius:3px;background:rgba(11,10,15,.5);overflow:hidden;box-shadow:inset 0 0 0 1px var(--hf-border,rgba(184,152,96,.28))}
.hf-works-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--hf-accent,#F2B84B),var(--hf-glow,#F0D878))}
.hf-works-stock{display:flex;flex-wrap:wrap;gap:3px 10px;margin:2px 0;padding:0;list-style:none;font-size:12px}
.hf-works-arc{margin:6px 0 10px}
.hf-works-arc h4{margin:0;font:600 1em/1.2 var(--hf-font-display,Georgia,serif)}
.hf-works-tier{display:flex;gap:6px;align-items:baseline;font-size:12px;margin:1px 0}
.hf-works-tier.is-done{color:var(--hf-focus,#5EC8C8)}
.hf-works-tier.is-next{color:var(--hf-text-primary,#E8DCC8);font-weight:600}
.hf-works-tier.is-later{color:var(--hf-text-muted,#8A7A68)}
.hf-works-msg{min-height:1.2em;margin:6px 0 0}
.hf-works-chip{position:absolute;left:8px;top:34px;pointer-events:auto;cursor:pointer;font:600 12px/1.2 var(--hf-font-ui,system-ui,sans-serif);padding:3px 8px;border-radius:999px;color:var(--hf-text-primary,#E8DCC8);background:rgba(11,10,15,.6);border:1px solid var(--hf-border-strong,rgba(184,152,96,.6))}
.hf-works-chip:hover{border-color:var(--hf-accent,#F2B84B)}
.hf-works-chip b{color:var(--hf-accent,#F2B84B)}
.hf-works-tabs.hf-tabs{flex-wrap:wrap;overflow:visible;padding:4px 0 2px;gap:4px}
.hf-works-tabs .hf-btn{padding:3px 9px;font-size:12px}
.hf-works-select{max-width:100%;font-size:12px}
`;

let injected = false;
export function ensureWorksStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'hf-works-style';
  style.textContent = CSS;
  document.head.append(style);
}
