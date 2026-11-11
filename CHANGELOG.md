# Changelog

## 0.7.0 (2026-11-11)

### Added

- `BottomSheet.Chat` (headless: `Sheet.Chat`): a chat's messages in their own scroll area, pinned to the composer
  (the `footer`), newest at the bottom. At a partial detent you see the latest messages, sliding up reveals older ones
  above while the newest stay put, and at full you scroll the history. It stays at the newest message as replies
  stream in. A swipe on the messages scrolls them at every detent (touch or wheel), the header and footer move the
  sheet, and a header drag with the history scrolled back moves the whole sheet. Render the whole conversation at every detent. See "Chat" in the README.

- `fit={false}` on `BottomSheet` and `Sheet.Root`: the sheet is always at least a screen tall, so the full detent is
  the top of the screen even with short content. For content that changes with the detent (a list that loads more at
  full): a fitted sheet's stops moved with every content change, so a flick up stopped dead at the short content's
  top, and a sheet could bounce between half and full.
- With the content scrolled to its very end, dragging the header down shortens the sheet from the top: the last line
  and the footer stay on the bottom edge (a chat at its latest message). In the middle of the content the whole
  sheet still moves.

- `BottomSheet.useScrollElement()` (headless: `Sheet.useScrollElement()`): the element a sheet's content scrolls in
  (the sheet's one scroller, or the dialog on desktop), for virtualizing a long list in a sheet. A 1000-row sheet
  took ~800ms from tap to first frame on a throttled phone profile, ~130ms virtualized. See "Long lists
  (virtualized)" in the README.

### Changed

- A partial detent is no longer dropped for being within 15% of a short sheet's full; only one at or within 8px of
  full is. The stops used to change when the content did: a chat that showed less at its peek lost its 0.5 stop
  there, so a drag up to half landed at full (#13).

### Fixed

- Firefox Android slid its toolbar away on a swipe nothing took (up at the end of a non-modal sheet's content), which
  resized the sheet under the finger. A non-modal sheet now locks the page scroll while it rests at full and covers
  the screen; below full, or as a short fit-content sheet, the page scrolls as before.
- A chat following new text at the end of a long sheet jumped back to the top of its content (#13). At the very end
  the sheet's bottom sat a fraction of a pixel above the screen's, so it no longer covered the screen and the browser
  snapped it to the content top on the next layout change or app scroll; in Chrome, `scrollTo({ top: scrollHeight })`
  landed on the content top too. The end of the content is now a snap position of its own.
- Content that grew from fit-content past the screen, with the app scrolling to its end, was clamped to the content
  top in Firefox (the momentum guard kept the old full line).
- Content that grew right after the sheet settled at full (an app rendering more there) didn't move the sheet to the
  new full: the browser snapped it down to the detent below, the app rendered less, and the two took turns. A big
  move after a content change now glides instead of jumping.

## 0.6.0 (2026-11-05)

### Added

- `rootProps` on `BottomSheet` (headless: `Sheet.Portal` takes `className`, `style` and other attributes): props for
  this sheet's own `[data-ybs-root]`, the element around its backdrop and the sheet. That's where one sheet's own
  theme goes, e.g. `rootProps={{ 'data-theme': 'dark' }}` or `rootProps={{ style: { colorScheme: 'dark' } }}`.
  Everything drawn for the sheet follows, also when the theme changes while it's open.
- A console warning when a sheet opens with a token set on the sheet itself that the parts outside it read (the
  colours, corners, widths and gaps the backdrop, dialog ring and shadow, keyboard bleed or header peek use, and
  `color-scheme`). It names the token and points at `rootProps`. Tokens only read inside the sheet are fine there.

### Changed

- **One sheet's theme goes on its root, not the sheet.** Tokens, a `data-theme` or `color-scheme` set on the sheet
  (`className`, `contentProps`) can't reach the parts drawn outside it, because CSS variables don't inherit up:
  in the dialog presentation the ring and shadow kept the page's divider colour and corners (#9), behind the keyboard
  the page's sheet colour showed, a covered sheet and the scrolled-header clip kept the page's corners, and a
  floating sheet's header peek ignored its gap. Move them to `rootProps`. The README's "one sheet in a fixed theme"
  example changed from `className="[color-scheme:dark]"` to `rootProps={{ style: { colorScheme: 'dark' } }}`.
  `--ybs-dialog-width` still works on the sheet.

### Fixed

- `--ybs-dialog-width` set on `[data-ybs-root]` now sizes a `variant="page"` dialog too (its 48rem default set on the
  sheet used to win).

## 0.5.0 (2026-11-05)

### Added

- `replaceable` (on `BottomSheet` and `Sheet.Root`): a sheet that opens over this one replaces it instead of
  stacking on it, both moving at once, for a step in a flow (a place sheet whose Share opens a separate share sheet).
  The replaced sheet gets `onOpenChange(false, { reason: 'replace' })` (a new reason) and recedes behind the new one
  as it leaves; the backdrops cross-fade (no darker flash), a receded page stays receded, and focus returns to what
  opened it. Sheets opened together in one render stack. A sheet rendered inside it still stacks.
  See "Replacing a sheet" in the README.

### Fixed

- `--ybs-dialog-width` set on the sheet (the documented place, through `className`) was ignored in the dialog
  presentation in 0.4.0, for `variant="page"` too (#8). The dialog's shadow is now a layer behind it instead of a box
  around it, so the blur fix from 0.4.0 stays.

## 0.4.0 (2026-11-05)

### Added

- `'header+footer'` detent: a peek that shows the header and the footer, with the footer pinned right under the
  header and the body covered. For a chat whose composer lives in `footer` and must show while minimised. It
  re-measures when the footer grows (a composer getting a second line), and catches flings like `'header'`. Without
  a footer it is `'header'`.
- `scrollEdge="soft"` on `/styled` `BottomSheet`: the header and footer lose their fill and the content fades out
  under them, so a translucent or blurred sheet works. Tokens: `--ybs-soft-fade` (the fade's length, 48px), and
  `--ybs-soft-behind-header` / `--ybs-soft-behind-footer` (`1`, the default: content carries on under that bar and
  fades out there; `0`: it fades out before the bar). Works in the dialog too. During a fast fling, content can show
  past the fade for a frame or two.

### Changed

- Closing with a wheel or trackpad has friction. A step that would close the sheet now starts a pull: the sheet
  follows a damped share of the scroll and closes on the third mouse-wheel notch, or after about 150px of trackpad
  scrolling. Let go for 400ms and it springs back. A 1px trackpad nudge used to close a single-detent sheet. Steps
  between detents are unchanged.
- A wheel scroll back up through the content lands at the content top with a short slide, instead of overshooting
  and snapping back (which also swallowed the next few notches).

### Fixed

- `/styled`: the sheet went transparent in light mode when a build (Lightning CSS: Vite production builds, Tailwind
  v4) lowered `light-dark()` and the app set no `color-scheme`. Other lowerers log a console error when
  `--ybs-sheet-bg` isn't a colour.
- A sheet opened together with a sheet nested inside it (a deep link) stacks on top of its parent instead of under it.
- Scrolling the content in one wheel gesture from full and back up could run on down the detents and close the
  sheet (Chrome).
- A sheet whose content grew at full (a chat getting a reply) could stop responding to swipes on its header.
- A tap right after a sheet settled (an early tap on the backdrop) was ignored.
- A footer trailed the sheet by a frame while it animated open or closed.
- A non-dismissible sheet swiped below its lowest detent fought the browser's own snap back (a jank).
- Firefox Android could leave a swiped-down sheet resting a few pixels above closed, an invisible layer that blocked
  taps on the page for a moment. It now closes at once, or snaps to the nearer stop.
- `/styled`: content scrolled under the header showed through its rounded top corners.
- `/styled`: a dialog's shadow no longer stops a `backdrop-filter` on the sheet from working (a blurred, translucent
  dialog showed the page sharp behind it).

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
