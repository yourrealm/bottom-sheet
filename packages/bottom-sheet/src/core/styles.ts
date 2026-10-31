/**
 * Structural CSS only: the mechanics that make the single-scroller sheet work.
 * No colours, radii or spacing; those belong to the consumer or `/styled`.
 *
 * CSS variables set by the controller on [data-ybs-root]:
 *   --ybs-h         available height (px)
 *   --ybs-vv-top    visualViewport.offsetTop (px)
 *   --ybs-vv-h      visualViewport.height (px)
 *   --ybs-progress  0..1, closed -> full
 *   --ybs-bleed     0|1, whether the bleed (sheet colour under the visual viewport) shows
 * Consumer-settable:
 *   --ybs-inset     gap above the sheet at the full detent (default: safe area + 10px)
 *   --ybs-sheet-bg  colour of the bleed, should match the sheet
 */
export const structuralCss = /* css */ `
[data-ybs-root] {
  --ybs-inset: calc(env(safe-area-inset-top, 0px) + 10px);
  position: fixed; inset: 0; z-index: 50; pointer-events: none;
}
[data-ybs-backdrop] {
  position: fixed; left: 0; right: 0; top: var(--ybs-vv-top, 0px); height: 200lvh;
  pointer-events: auto;
}
[data-ybs-bleed] {
  position: fixed; left: 0; right: 0; height: 100lvh;
  top: calc(var(--ybs-vv-top, 0px) + var(--ybs-vv-h, 100dvh));
  background: var(--ybs-sheet-bg, Canvas);
  opacity: var(--ybs-bleed, 0);
}
[data-ybs-scroller] {
  position: fixed; left: 0; right: 0;
  top: calc(var(--ybs-vv-top, 0px) + var(--ybs-inset));
  height: calc(var(--ybs-vv-h, 100dvh) - var(--ybs-inset));
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-snap-type: y mandatory;
  scrollbar-width: none;
  pointer-events: auto;
}
[data-ybs-scroller]::-webkit-scrollbar { display: none; }
[data-ybs-root][data-ybs-drag] [data-ybs-scroller] { scroll-snap-type: none; }
[data-ybs-track] { position: relative; }
[data-ybs-spacer] { height: var(--ybs-h, 100dvh); touch-action: none; }
[data-ybs-markers] { position: absolute; top: 0; left: 0; width: 1px; height: 0; }
[data-ybs-marker] {
  position: absolute; left: 0; width: 1px; height: 1px;
  scroll-snap-align: start; pointer-events: none;
}
[data-ybs-sheet] { position: relative; scroll-snap-align: start; outline: none; }
[data-ybs-root][data-ybs-fit] [data-ybs-sheet] { scroll-snap-align: end; }
[data-ybs-header] { position: sticky; top: 0; z-index: 1; }
@media (pointer: fine) {
  [data-ybs-drag] { cursor: grab; user-select: none; -webkit-user-select: none; }
  [data-ybs-root][data-ybs-drag="active"] [data-ybs-drag] { cursor: grabbing; }
}
`
