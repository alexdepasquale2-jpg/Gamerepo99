/**
 * God menu look: a full-screen command deck over the game. Kit tokens where they exist (fonts, accent,
 * borders), a denser ops-room treatment on top: mono numerals, hairline grids, a spark-gold accent and a
 * cyan data colour (the spark bar's own pair, docs/art/PALETTE.md).
 */
const CSS = `
#hf-god{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;box-sizing:border-box;
  padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));
  --g-bg:rgba(14,13,12,.94);--g-panel:rgba(30,28,26,.92);--g-line:rgba(232,220,200,.12);--g-fg:#E8DCC8;--g-dim:#9b9184;
  --g-gold:#F2B84B;--g-cyan:#5EC8C8;--g-red:#d0654f;--g-green:#7fb069;--g-mono:ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace;
  background:var(--g-bg);color:var(--g-fg);font:13px/1.4 var(--hf-font-ui,system-ui,sans-serif);
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
#hf-god *{box-sizing:border-box}
#hf-god .g-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:4px 4px 10px;border-bottom:1px solid var(--g-line)}
#hf-god .g-title{font:700 18px/1 var(--hf-font-display,inherit);color:var(--g-gold);letter-spacing:.08em;text-transform:uppercase}
#hf-god .g-title small{display:block;font:500 10px/1.4 var(--g-mono);color:var(--g-cyan);letter-spacing:.14em}
#hf-god .g-strip{display:flex;gap:14px;flex-wrap:wrap;font:12px var(--g-mono);color:var(--g-dim);flex:1}
#hf-god .g-strip b{color:var(--g-fg);font-weight:600}
#hf-god .g-tabs{display:flex;gap:2px;overflow-x:auto;padding:8px 0 0;border-bottom:1px solid var(--g-line);scrollbar-width:none}
#hf-god .g-tab{flex:none;background:none;border:0;border-bottom:2px solid transparent;color:var(--g-dim);font:600 12px var(--g-mono);letter-spacing:.1em;text-transform:uppercase;padding:8px 12px;cursor:pointer}
#hf-god .g-tab[aria-selected=true]{color:var(--g-gold);border-bottom-color:var(--g-gold)}
#hf-god .g-body{flex:1;overflow:auto;padding:12px 2px;overscroll-behavior:contain}
#hf-god .g-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
#hf-god .g-card{background:var(--g-panel);border:1px solid var(--g-line);border-radius:8px;padding:10px 12px;min-width:0}
#hf-god .g-card h3{margin:0 0 8px;font:600 11px var(--g-mono);color:var(--g-cyan);letter-spacing:.12em;text-transform:uppercase;display:flex;justify-content:space-between;gap:8px}
#hf-god .g-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:10px}
#hf-god .g-kpi{background:var(--g-panel);border:1px solid var(--g-line);border-radius:8px;padding:8px 10px}
#hf-god .g-kpi .v{font:600 22px/1.1 var(--g-mono);color:var(--g-fg);font-variant-numeric:tabular-nums}
#hf-god .g-kpi .l{font:10px var(--g-mono);color:var(--g-dim);letter-spacing:.1em;text-transform:uppercase}
#hf-god .g-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:4px 0}
#hf-god button.g-b{background:rgba(232,220,200,.06);border:1px solid var(--g-line);color:var(--g-fg);border-radius:6px;padding:5px 9px;font:12px var(--hf-font-ui,inherit);cursor:pointer;min-height:28px}
#hf-god button.g-b:hover{border-color:var(--g-gold);color:var(--g-gold)}
#hf-god button.g-b.hot{border-color:var(--g-gold);color:#1b1a19;background:var(--g-gold)}
#hf-god button.g-b.danger:hover{border-color:var(--g-red);color:var(--g-red)}
#hf-god button.g-b:focus-visible,#hf-god .g-tab:focus-visible{outline:2px solid var(--g-cyan);outline-offset:1px}
#hf-god input,#hf-god select,#hf-god textarea{background:rgba(0,0,0,.35);border:1px solid var(--g-line);color:var(--g-fg);border-radius:5px;padding:4px 6px;font:12px var(--g-mono)}
#hf-god input[type=number]{width:72px}
#hf-god input[type=range]{width:120px;accent-color:var(--g-gold)}
#hf-god table{width:100%;border-collapse:collapse;font:12px var(--g-mono);font-variant-numeric:tabular-nums}
#hf-god th{text-align:left;color:var(--g-dim);font-weight:500;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:4px 6px;border-bottom:1px solid var(--g-line);position:sticky;top:0;background:var(--g-panel);cursor:pointer}
#hf-god td{padding:3px 6px;border-bottom:1px solid rgba(232,220,200,.05);white-space:nowrap}
#hf-god tr.sel td,#hf-god tbody tr:hover td{background:rgba(242,184,75,.08)}
#hf-god .g-scroll{overflow:auto;max-height:60vh}
#hf-god .g-split{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:10px}
@media (max-width:760px){#hf-god .g-split{grid-template-columns:1fr}}
#hf-god .g-bar{height:6px;border-radius:3px;background:rgba(232,220,200,.08);overflow:hidden;min-width:60px}
#hf-god .g-bar i{display:block;height:100%;background:var(--g-gold)}
#hf-god .g-pill{display:inline-block;padding:1px 6px;border-radius:9px;font:10px var(--g-mono);border:1px solid var(--g-line);color:var(--g-dim)}
#hf-god .g-pill.ok{color:var(--g-green);border-color:var(--g-green)}#hf-god .g-pill.bad{color:var(--g-red);border-color:var(--g-red)}#hf-god .g-pill.gold{color:var(--g-gold);border-color:var(--g-gold)}
#hf-god .dim{color:var(--g-dim)}#hf-god .gold{color:var(--g-gold)}#hf-god .cyan{color:var(--g-cyan)}#hf-god .red{color:var(--g-red)}#hf-god .green{color:var(--g-green)}
#hf-god pre{margin:0;font:12px/1.45 var(--g-mono);white-space:pre-wrap;word-break:break-word}
#hf-god .g-log{font:12px/1.5 var(--g-mono);max-height:62vh;overflow:auto}
#hf-god .g-log div{border-bottom:1px solid rgba(232,220,200,.04);padding:1px 0}
#hf-god canvas.g-spark{width:100%;height:46px;display:block}
#hf-god .g-tree summary{cursor:pointer;font:12px var(--g-mono);color:var(--g-cyan)}
#hf-god .g-tree .k{color:var(--g-dim)}#hf-god .g-tree div{padding-left:14px;font:12px var(--g-mono)}
#hf-god .g-toast{position:absolute;right:16px;bottom:16px;background:var(--g-gold);color:#1b1a19;padding:6px 10px;border-radius:6px;font:600 12px var(--g-mono);opacity:0;transition:opacity .2s}
#hf-god .g-toast.on{opacity:1}
@media (prefers-reduced-motion:reduce){#hf-god .g-toast{transition:none}}
`;

export function installGodStyle(): void {
  if (document.getElementById('hf-god-css')) return;
  const s = document.createElement('style');
  s.id = 'hf-god-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
