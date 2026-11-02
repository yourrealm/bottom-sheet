# Changelog

## 0.3.0 (2026-11-02)

### Changed

- **`BottomSheet` opens as a centred dialog on desktop** (a wide screen with a mouse: `DIALOG_QUERY`), like a
  SwiftUI `.sheet` on iPad. Phones, touch tablets and non-modal sheets keep the bottom sheet. There are no detents in
  a dialog, so `onDetentChange` doesn't fire there. To keep the old behaviour: `dialog={false}` on a sheet, or
  `<BottomSheet.Provider dialog={false}>` around the app. The headless `Sheet` parts are unchanged (opt in with
  `dialog`). Desktop e2e tests that swipe or check detents need a mobile profile or the Provider.

### Added

- `dialog` (on `BottomSheet` and `Sheet.Root`): `true` uses `DIALOG_QUERY`
  (`(min-width: 768px) and (hover: hover) and (pointer: fine)`); a string is your own media query; `false` is always
  a sheet. Same parts, props and behaviour (focus, Escape, back, stacking, outside press, `onExitComplete`);
  `floating`, `fullscreen` and `recede` don't apply. Decided when it opens, like `modal`. See "Dialog on desktop" in
  the README.
- `<BottomSheet.Provider dialog>` / `<Sheet.Provider dialog>`: `dialog` for every sheet in the app. A sheet's own
  `dialog` wins; nested Providers keep what they don't set from the outer one.
- `usePresentation()` (`BottomSheet.usePresentation`, `Sheet.usePresentation`): `'sheet'` or `'dialog'`, for content
  that adapts.
- `DIALOG_QUERY`, and the tokens `--ybs-dialog-width` (32rem), `--ybs-dialog-gap` (24px) and `--ybs-dialog-radius`
  (16px in `/styled`). `data-ybs-dialog` on the root.
- `/styled` in a dialog: rounded on all sides, the ✕ shows by default when the sheet is dismissible (unless it has
  `leading`/`trailing`), and `variant="page"` is a larger dialog (48rem).

### Fixed

- Shift+wheel over a sideways strip scrolls the strip. Chrome on Windows and Linux reports it as a vertical wheel
  with `shiftKey`, which stepped the sheet to another detent instead.

## 0.2.1 (2026-11-02)

### Changed (`/styled` looks)

- Dark mode: the sheet is `#2c2c2e` (was `#1c1c1e`), and the page behind dims 60% (light mode stays at 40%), so the
  sheet stands out from dark pages. The defaults are now `--ybs-backdrop: light-dark(rgb(0 0 0 / .667), #000)` and
  `--ybs-backdrop-max: 0.6`; an app that sets both itself sees no change.
- The sheet uses the app's font; it no longer sets `system-ui`.
- `eyebrow` is a small all-caps label (12px, letter-spaced, semi-bold), like eyebrows elsewhere on the web.

### Fixed

- A `BottomSheet` without children (a confirm sheet: title, description, footer) no longer renders an empty body, and
  its buttons sit one 16px gap under the text instead of about 36px.

## 0.2.0 (2026-11-02)

### Breaking

- The styled parts from `@yourrealm/bottom-sheet/styled` are now `StyledSheet` (they were a second `Sheet`, easy to
  confuse with the headless one). Most code should use `BottomSheet`; for a close button inside it, `Sheet.Close`
  becomes `BottomSheet.Close`. The headless `Sheet` from `@yourrealm/bottom-sheet` is unchanged.
- `BottomSheet` needs a name: `title`, or `aria-label` for a sheet without a visible title. A `title` that may be
  `undefined` needs a fallback (`title={q ?? 'Confirm'}`).

### Added

- `footer` (`Sheet.Footer` / `StyledSheet.Footer`): actions pinned to the bottom of the screen, also at partial
  detents, reaching the sheet's edges, taking the home-bar safe area.
- `BottomSheet.Edge` (`StyledSheet.Edge`): content in the body that reaches the sheet's edges, its contents kept in
  line with the body. `--ybs-body-inset` is the side space in use.
- `StyledSheet.Body`: the padded content area for parts users.
- The `'header'` detent: a peek of exactly the header. A flick down from higher up lands on it instead of closing.
- `onExitComplete`: called once the sheet has finished closing and left the page.
- `closeButton` (a visible ✕) and `closeLabel`. Without `closeButton`, a dismissible sheet gets a close button only
  screen readers announce.
- `BottomSheet.Close`.
- `eyebrow`: a small label above the title.
- `--ybs-title-size` token.
- A sheet without a visible title (`aria-label`): the header is just the grabber, without a title's space.
- `data-ybs-more` on the root while content is hidden behind the footer.

### Changed

- `/styled`: the line under the header shows only while content is scrolled under it (it used to always show, and
  content sat right on it). If you added top padding to work around that, you can drop it.
- `/styled` `floating`: the side spacing includes the gap (24px instead of 16px), so text no longer sits 8px from the
  visible edge at lower detents.
- A pixel peek like `detents={['76px']}` that was meant to show just the header can become `['header']`.

## 0.1.0 (2026-11-01)

First release.
