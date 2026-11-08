/**
 * The pad's own stylesheet (injected once). It reads the kit's colour tokens with fallbacks, so it works
 * with or without the kit restyle. Sizes come from the short side of the viewport so the pad fits a phone in
 * either orientation; everything clears the safe-area insets. The pad sits above menus (it drives them)
 * and under the end-screen modals' z.
 */
const CSS = `
.hf-pad{--pad-d:clamp(104px,30vmin,148px);--pad-face:clamp(44px,12vmin,60px);--pad-gap:clamp(10px,3vmin,22px);
  --pad-sl:env(safe-area-inset-left,0px);--pad-sr:env(safe-area-inset-right,0px);--pad-sb:env(safe-area-inset-bottom,0px);--pad-st:env(safe-area-inset-top,0px);
  position:fixed;inset:0;pointer-events:none;z-index:40;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;
  font:600 12px/1 var(--hf-font-ui,system-ui,sans-serif);color:var(--hf-text-primary,#f1e6cf)}
.hf-pad[hidden],.hf-pad-hints[hidden]{display:none !important}
body[data-pad=on]{overscroll-behavior:none;touch-action:none}
.hf-pad__zone{position:absolute;left:0;bottom:0;width:min(32vw,calc(var(--pad-d) * 1.9));height:min(50vh,calc(var(--pad-d) * 1.5));pointer-events:auto;touch-action:none}
.hf-pad__dpad{position:absolute;left:calc(var(--pad-gap) + var(--pad-sl));top:auto;bottom:calc(var(--pad-gap) + var(--pad-sb));width:var(--pad-d);height:var(--pad-d);border-radius:50%;
  background:radial-gradient(circle,rgba(20,16,12,.25) 0 40%,rgba(20,16,12,.42) 70%);box-shadow:inset 0 0 0 1px rgba(241,230,207,.22);opacity:.78;transition:opacity .15s}
.hf-pad__dpad.is-live{bottom:auto;opacity:1}
.hf-pad__arm{position:absolute;width:30%;height:30%;left:35%;top:35%;border-radius:6px;background:rgba(241,230,207,.16)}
.hf-pad__arm--up{top:5%}.hf-pad__arm--down{top:65%}.hf-pad__arm--left{left:5%}.hf-pad__arm--right{left:65%}
.hf-pad__arm.is-on{background:var(--hf-accent,#e8b04a);opacity:.85}
.hf-pad__knob{position:absolute;left:32%;top:32%;width:36%;height:36%;border-radius:50%;background:rgba(241,230,207,.55);box-shadow:0 2px 6px rgba(0,0,0,.4);transition:transform .04s linear}
.hf-pad__buttons{position:absolute;inset:0;pointer-events:none}
.hf-pad__btn{position:absolute;pointer-events:auto;touch-action:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;margin:0;padding:0;
  border:1px solid rgba(241,230,207,.35);background:rgba(20,16,12,.5);color:inherit;font:inherit;-webkit-tap-highlight-color:transparent;cursor:pointer}
.hf-pad__btn b{font-size:1.45em;line-height:1}
.hf-pad__btn span{font-size:.72em;font-weight:500;opacity:.85;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hf-pad__btn.is-down{background:var(--hf-surface-active,rgba(232,176,74,.45));transform:scale(.94)}
.hf-pad__face{width:var(--pad-face);height:var(--pad-face);border-radius:50%}
.hf-pad__face--a{right:calc(var(--pad-gap) + var(--pad-face) * .9 + var(--pad-sr));bottom:calc(var(--pad-gap) + var(--pad-sb));width:calc(var(--pad-face) * 1.18);height:calc(var(--pad-face) * 1.18);border-color:var(--hf-accent,#e8b04a)}
.hf-pad__face--a b{color:var(--hf-accent,#e8b04a)}
.hf-pad__face--a.is-live{box-shadow:0 0 0 2px rgba(232,176,74,.35)}
.hf-pad__face--b{right:calc(var(--pad-gap) + var(--pad-sr));bottom:calc(var(--pad-gap) + var(--pad-face) * .95 + var(--pad-sb))}
.hf-pad__face--x{right:calc(var(--pad-gap) + var(--pad-face) * 2.05 + var(--pad-sr));bottom:calc(var(--pad-gap) + var(--pad-face) * .95 + var(--pad-sb))}
.hf-pad__face--y{right:calc(var(--pad-gap) + var(--pad-face) * 1.0 + var(--pad-sr));bottom:calc(var(--pad-gap) + var(--pad-face) * 1.95 + var(--pad-sb))}
.hf-pad__sys{top:calc(6px + var(--pad-st));height:28px;min-width:64px;padding:0 10px;border-radius:14px;flex-direction:row;gap:5px}
.hf-pad__sys b{font-size:1.1em}
/* Top-right, just under the minimap: clear of the day chip (top centre) and the spark bar (top left). */
.hf-pad__sys--select{right:calc(84px + var(--pad-sr));top:calc(var(--hf-minimap-bottom,82px) + var(--pad-st))}
.hf-pad__sys--start{right:calc(10px + var(--pad-sr));top:calc(var(--hf-minimap-bottom,82px) + var(--pad-st))}
.hf-pad__sh{height:30px;width:calc(var(--pad-face) * 1.3);border-radius:10px 10px 6px 6px;flex-direction:row;gap:4px;bottom:calc(max(var(--pad-gap) * 1.6 + var(--pad-d), var(--pad-gap) * 1.5 + var(--pad-face) * 3.1) + var(--pad-sb))}
.hf-pad__sh--l{left:calc(var(--pad-gap) + var(--pad-sl))}
.hf-pad__sh--r{right:calc(var(--pad-gap) + var(--pad-sr))}
.hf-pad__badge{position:absolute;top:-6px;right:-6px;min-width:16px;padding:0 4px;border-radius:999px;background:var(--hf-glow,#f2c46d);color:var(--hf-void,#120e0a);font:bold 11px/16px system-ui,sans-serif;font-style:normal}
.hf-pad-hl{outline:2px solid var(--hf-accent,#e8b04a) !important;outline-offset:2px}
.hf-pad-hints{position:fixed;left:calc(10px + env(safe-area-inset-left,0px));bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:40;display:flex;flex-wrap:wrap;gap:4px 10px;max-width:46vw;
  pointer-events:none;font:12px/1.3 var(--hf-font-ui,system-ui,sans-serif);color:var(--hf-text-primary,#f1e6cf);opacity:.8;text-shadow:0 1px 2px #000}
.hf-pad-hints b{display:inline-block;min-width:18px;padding:0 4px;border-radius:9px;background:rgba(20,16,12,.6);border:1px solid rgba(241,230,207,.35);text-align:center}
`;

export function ensurePadStyle(): void {
  if (document.getElementById('hf-pad-style')) return;
  const s = document.createElement('style');
  s.id = 'hf-pad-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}
