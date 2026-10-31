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
  max-width: 640px; margin-inline: auto;
}
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
