# Changelog

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
