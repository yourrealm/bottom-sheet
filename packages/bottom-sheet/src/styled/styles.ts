/** The polished preset. Light/dark via prefers-color-scheme. Override with the --ybs-* tokens. */
export const styledCss = /* css */ `
[data-ybs-root] {
  --ybs-sheet-bg: #fff;
  --ybs-sheet-fg: #111;
  --ybs-muted: #6b6b70;
  --ybs-handle: rgba(60, 60, 67, 0.3);
  --ybs-divider: rgba(60, 60, 67, 0.12);
  --ybs-radius: 14px;
  --ybs-backdrop: #000;
  --ybs-backdrop-max: 0.4;
  --ybs-max-width: 640px;
  --ybs-content-width: 960px;
  --ybs-float-gap: 8px;
  --ybs-float-radius: 32px;
  /* 1 within the last 10% of travel to full, else 0..: corners square off as a fullscreen sheet reaches the top. */
  --ybs-at-top: clamp(0, (var(--ybs-progress, 0) - 0.9) * 10, 1);
}
@media (prefers-color-scheme: dark) {
  [data-ybs-root] {
    --ybs-sheet-bg: #1c1c1e;
    --ybs-sheet-fg: #f2f2f7;
    --ybs-muted: #98989f;
    --ybs-handle: rgba(235, 235, 245, 0.3);
    --ybs-divider: rgba(235, 235, 245, 0.12);
  }
}
.ybs-backdrop {
  background: var(--ybs-backdrop);
  opacity: calc(var(--ybs-progress, 0) * var(--ybs-backdrop-max));
}
.ybs-bleed { background: var(--ybs-sheet-bg); }
/* Stacked sheets: the covered sheet recedes (scales back and lifts slightly), like iOS. */
.ybs-view { transform-origin: 50% 0; transition: none; }
[data-ybs-root][data-ybs-covered] .ybs-view {
  transform: translateY(calc(var(--ybs-covered, 0) * -6px)) scale(calc(1 - var(--ybs-covered, 0) * 0.06));
  border-radius: var(--ybs-radius);
}
[data-ybs-root][data-ybs-covered] .ybs-bleed { opacity: 0; }
.ybs-sheet {
  background: var(--ybs-sheet-bg);
  color: var(--ybs-sheet-fg);
  border-radius: var(--ybs-radius) var(--ybs-radius) 0 0;
  box-shadow: 0 -1px 0 var(--ybs-divider), 0 -8px 30px rgba(0, 0, 0, 0.08);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  font-family: system-ui, -apple-system, sans-serif;
  max-width: var(--ybs-max-width); margin-inline: auto;
}
/* Full width: the surface spans the window; header and body keep their full width (no corner seams) but pad
   their contents into a readable centred column. */
.ybs-sheet.ybs-sheet-full { max-width: none; }
.ybs-sheet-full > .ybs-header, .ybs-sheet-full > .ybs-body {
  padding-inline: max(16px, (100% - var(--ybs-content-width)) / 2);
}
/* A page sheet fills the screen at full even when its content is short (no fit-content). */
.ybs-sheet.ybs-sheet-page { min-height: calc(var(--ybs-vv-h, 100dvh) - var(--ybs-inset)); }
/* Header bar: leading | title | trailing, the title centred like an iOS navigation bar. */
.ybs-bar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; }
.ybs-bar > .ybs-title { text-align: center; }
.ybs-leading { justify-self: start; }
.ybs-trailing { justify-self: end; }
/* Floating (iOS 26): at lower detents the sheet floats, inset from the sides and the bottom with large corners;
   over the last quarter of the travel to full it attaches (the gap closes, the bottom corners slide off-screen).
   A clip-path, so nothing reflows while the sheet moves. --ybs-visible is the on-screen height of the sheet, so
   100% - visible is the part below the screen edge. */
.ybs-sheet.ybs-sheet-floating {
  --ybs-float: calc(1 - clamp(0, (var(--ybs-progress, 0) - 0.75) * 4, 1));
  --ybs-g: calc(var(--ybs-float-gap) * var(--ybs-float));
  --ybs-rt: calc(var(--ybs-radius) + (var(--ybs-float-radius) - var(--ybs-radius)) * var(--ybs-float));
  --ybs-rb: calc(var(--ybs-float-radius) * var(--ybs-float));
  clip-path: inset(0 var(--ybs-g) calc((100% - var(--ybs-visible, 0px)) * var(--ybs-float) + var(--ybs-g)) var(--ybs-g)
    round var(--ybs-rt) var(--ybs-rt) var(--ybs-rb) var(--ybs-rb));
}
/* Fullscreen: square corners at the top (they would show the page through), header clear of the notch. */
[data-ybs-fullscreen] .ybs-sheet, [data-ybs-fullscreen] .ybs-header {
  --ybs-r: calc(var(--ybs-radius) * (1 - var(--ybs-at-top)));
  border-radius: var(--ybs-r) var(--ybs-r) 0 0;
}
[data-ybs-fullscreen] .ybs-header { padding-top: calc(6px + env(safe-area-inset-top, 0px)); }
.ybs-header {
  background: var(--ybs-sheet-bg);
  border-radius: var(--ybs-radius) var(--ybs-radius) 0 0;
  padding: 6px 16px 12px;
  border-bottom: 1px solid var(--ybs-divider);
  /* Content scrolls under this sticky header; at fractional positions (device scaling, or a covered
     sheet's scale) a 1px sliver of it can show above. Cover it with the sheet colour. */
  box-shadow: 0 -2px 0 0 var(--ybs-sheet-bg);
}
.ybs-handle {
  width: 36px; height: 5px; border-radius: 3px;
  background: var(--ybs-handle);
  margin: 0 auto 10px;
}
.ybs-title { margin: 0; font-size: 17px; font-weight: 600; line-height: 1.3; }
.ybs-description { margin: 4px 0 0; font-size: 14px; color: var(--ybs-muted); }
.ybs-body { padding: 0 0 12px; }
`
