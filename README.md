# @yourrealm/bottom-sheet

Native-feeling bottom sheets for the web, for React.

**[Try the demos on your phone →](https://yourrealm.github.io/bottom-sheet/)**

## Why another sheet?

On iOS and Android, a sheet and the list inside it act as **one gesture**. Drag up and the sheet expands, then the
list scrolls, without lifting your finger. Scroll back to the top and keep pulling: the sheet follows, with real
momentum.

Most web sheets put a JavaScript-dragged panel around a separate scroll box. The browser can't hand a gesture from
one to the other mid-touch, so you get dead zones, lost momentum, or "drag from the handle only".

This library puts the sheet's travel **and** its content in one native scroll container. Resting positions
(detents) are scroll-snap points. Momentum, rubber-banding and velocity come from the browser itself; a small
controller only handles what native sheets also do on top: stopping a fling at the full detent, animating opens and
closes, following the on-screen keyboard, and re-snapping when the layout changes.

## Install

```sh
pnpm add @yourrealm/bottom-sheet
```

Requires React 19. Import the CSS once, before Tailwind:

```css
@import "@yourrealm/bottom-sheet/styled.css"; /* or styles.css for the headless parts alone */
@import "tailwindcss";
```

Or `import '@yourrealm/bottom-sheet/styled.css'` in your entry, before your own CSS. It's a plain stylesheet served from
your own origin, so it works under a strict Content-Security-Policy. Everything is in the `ybs` cascade layer, between
Tailwind v4's `base` and `components`: your own CSS and utility classes on the parts win, and preflight doesn't reset
the preset. Opening a sheet without the CSS logs an error naming the import.

## Use

```tsx
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'

<BottomSheet
  trigger={(props) => <Button {...props}>Filters</Button>} // your own button; or control it with open/onOpenChange
  title="Filters"
  detents={[0.5]}
>
  …
</BottomSheet>
```

Three ways in. **Use `BottomSheet`** unless you've been asked for something else:

| | Import from | What it is |
|---|---|---|
| `BottomSheet` | `@yourrealm/bottom-sheet/styled` | The finished sheet. Everything you need hangs off it (`BottomSheet.Close`, `BottomSheet.Edge`). |
| `StyledSheet` | `@yourrealm/bottom-sheet/styled` | The styled parts `BottomSheet` is built from, to arrange yourself. |
| `Sheet` | `@yourrealm/bottom-sheet` | The parts with no look at all, only the behaviour. For a fully custom design. |

On a wide screen with a mouse, `BottomSheet` opens as a centred dialog instead (see "Dialog on desktop"); turn that
off with `dialog={false}`, or for the whole app with `<BottomSheet.Provider dialog={false}>`.

`BottomSheet`'s options (`leading`, `trailing`, `eyebrow`, `headerExtra`, `footer`, `BottomSheet.Edge`) cover most
layouts. Use the parts only when the person you're working for asks for them, or for a fully custom design (see
"Building from parts" below).

**Migrating an existing sheet or dialog?** Move its content into `BottomSheet`, and map its header to `title`,
`description`, `leading`, `trailing` and its buttons to `footer`. Don't rebuild your old markup from parts to keep the
diff small: you lose the screen-reader close button, the header layouts and the eyebrow, and your spacing drifts
from the preset.

### `BottomSheet`

```tsx
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'

// A confirm sheet with actions pinned to the bottom
<BottomSheet open={open} onOpenChange={setOpen} title="Delete this list?"
  footer={<><BottomSheet.Close>Cancel</BottomSheet.Close><button onClick={remove}>Delete</button></>}>
  This can't be undone.
</BottomSheet>

// Content that reaches the sheet's edges
<BottomSheet open={open} onOpenChange={setOpen} title="Café Mollan" eyebrow="Gamla stan">
  <BottomSheet.Edge className="photos">…</BottomSheet.Edge>
</BottomSheet>

// An iOS page sheet: Cancel / title / Save
<BottomSheet open={open} onOpenChange={setOpen} variant="page" title="New Note"
  leading={<BottomSheet.Close>Cancel</BottomSheet.Close>} trailing={<button onClick={save}>Save</button>}>
  …
</BottomSheet>

// No visible title: name it with aria-label (description, leading/trailing still work)
<BottomSheet open={open} onOpenChange={setOpen} aria-label="Photo options">
  …
</BottomSheet>

// A persistent result sheet: peeks with just its header, never closes by gesture
<BottomSheet open={solved} modal={false} dismissible={false} detents={['header']} title="Solved">
  …
</BottomSheet>
```

- **A name is required:** `title` (visible, and it names the dialog for screen readers), or `aria-label` for a sheet
  without a visible title (an action list, a photo viewer). TypeScript refuses a sheet with neither. A title that may
  be missing needs a fallback: `title={pending?.question ?? 'Confirm'}`.
- `eyebrow`: a small label above the title (a section, a category), read together with the title. Needs `title`.
- `description`: a line under the title; it describes the dialog.
- `leading` / `trailing`: header slots, iOS navigation-bar style (Cancel / title / Save, the title centred).
- `headerExtra`: content in the sticky header under the title (a search field).
- `footer`: actions pinned to the bottom of the screen (Cancel / Delete, Show results). They stay reachable while a
  long sheet scrolls and at partial detents, reach the sheet's edges, and take the home-bar safe area. At a peek
  too low for both, the footer stays tucked under the header and slides in as the sheet rises.
- `closeButton`: a visible ✕ in the header's top right (off by default for a sheet; on by default when it shows as a
  dialog, unless `leading`/`trailing` are set). Without it, a dismissible sheet still has a
  close button that only screen readers announce (shown when focused by keyboard), because VoiceOver users can't swipe a
  sheet away or tap the dimmed area. `closeLabel` names either one (default `'Close'`).
- `BottomSheet.Close`: a button that closes the sheet (in `leading`, `footer`, or the content).
- `BottomSheet.Edge`: content in the body that reaches the sheet's edges (a photo strip that scrolls sideways, a
  full-width tappable row, a separator), its contents kept in line with the body. Right in every variant.
- `trigger`: text or elements go inside a plain, unstyled `<button class="ybs-trigger">`. For a design-system button,
  pass a function; it receives `type`, `onClick` and the ARIA state:
  `trigger={(props) => <Button variant="outline" {...props}>Filters</Button>}`. Or leave `trigger` out and control `open`.
- `variant="page"`: an iOS page sheet for a task: full width, the page behind recedes (`recede`), and the sheet fills
  the screen at full even with short content.
- `width`: `'card'` (default for sheets: at most 640px, centred) or `'full'` (default for pages: spans the window,
  content in a centred 960px column).
- `floating`: iOS 26 style, inset from the screen edges with large corners at lower detents, attaching as it reaches
  full. Its side spacing includes the gap, so text keeps its distance from the visible edge.
- `scrollEdge`: how content scrolling under the header and footer shows. `'line'` (default): the bars are filled with
  the sheet colour and a divider appears. `'soft'`: the bars have no fill or line, and the content fades out under them, like
  iOS 26's soft scroll edge. Use it for a translucent or blurred sheet (`--ybs-sheet-bg` with alpha plus your own
  `backdrop-filter`), where filled bars would stack into darker bands. Tune it with `--ybs-soft-fade`,
  `--ybs-soft-behind-header` and `--ybs-soft-behind-footer` (Styling). Works in the dialog too. Known limit: the fade
  is placed from scroll events, so during a fast fling content can show past it for a frame or two.
- `initialFocus`: see Options.
- `className` / `contentProps`: go on the sheet element (`<section role="dialog">`). Props there override the
  defaults, the role too (see "Confirm prompts" below).
- `rootProps`: go on this sheet's `[data-ybs-root]`, around the backdrop and the sheet. The place for one sheet's own
  theme (Styling).
- Plus every option below.

### Options (on `BottomSheet` and `Sheet.Root`)

- `detents`: partial resting heights, as fractions of the height available to the sheet (`0.5`), CSS lengths of
  visible sheet (`'76px'`, `'40dvh'`), or `'header'`: exactly the header, measured, for a peek that shows the title
  and nothing under it. `'header+footer'` adds the footer right under the header, for a chat whose composer lives in
  `footer` (at the bottom when expanded) but must show when minimised; both are re-measured as they change size (a
  composer that grows a line). Without a footer it's `'header'`. These peeks are minimised states: a flick down from
  higher up lands on one, and only a flick from the peek itself closes the sheet (with `dismissible={false}`,
  nothing does). Other partial detents let a
  flick run past them. Full height (`'full'`) is always included, and is the content's own height when the content
  is short (see `fit`). A partial detent stays a stop however close it is to a short sheet's full; only one at or
  within a few pixels of full is the same place and left out. Default `[]`: the sheet opens straight to full, like
  iOS.
- `initialDetent`: where it opens: `'full'` or one of your `detents`. Default: the smallest partial detent, else full.
- `detent` / `onDetentChange`: the detent the sheet rests at, `'full'` or the value you passed in `detents`
  (`0.5`, `'76px'`, `'header'`, `'header+footer'`). Pass `detent` to control it (changing it moves the sheet). `onDetentChange` never
  reports `'closed'` (closing is `onOpenChange(false)`), so `detent={d} onDetentChange={setD}` round-trips.
- `open` / `defaultOpen` / `onOpenChange(open, { reason })`: controlled or uncontrolled. The reason is
  `'trigger' | 'close-button' | 'escape' | 'back' | 'outside-press' | 'swipe' | 'replace'`. Use `open` when a sheet has several
  openers, or opening runs your own logic.
- `onExitComplete`: called once the sheet has finished closing and left the page. See "Closing animates".
- `modal` (default `true`): `false` leaves the page usable around the sheet: no backdrop (`BottomSheet` drops it), no
  inert page, no scroll lock. It doesn't move focus unless you pass `initialFocus`, and Escape only acts on it while
  focus is inside it. `modal` is read when the sheet opens; a change while it's open applies from the next open.
  On iOS, each direct child of a non-modal sheet becomes a 1px horizontal scroller (Safari needs a scroll container
  under the finger to drag the sheet): keep sticky elements at the top level, like the header, and render popovers in
  a portal rather than inside the sheet's children.
- `initialFocus` (on `BottomSheet` / `Sheet.Content`, like Base UI's): where focus goes when the sheet opens. A ref,
  `false`, `true` (the sheet), or a function of how it was opened: `initialFocus={(type) => type !== 'touch' &&
  newBoardRef.current}` focuses a button for mouse and keyboard users only. Default: the sheet for a modal sheet,
  nothing for a non-modal one. A non-modal sheet that took focus gives it back when it closes.
- `dismissible` (default `true`): `false` means a swipe down, Escape or an outside press drop the sheet to its lowest
  detent instead of closing it. `open={false}` and a close button still close it.
- `closeOnBack` (default: `modal`): the Android back button closes the top sheet, like a native sheet. Built on
  [`CloseWatcher`](https://developer.mozilla.org/en-US/docs/Web/API/CloseWatcher), so it adds no history entries and
  never touches your URLs or router. Works in Chrome and Firefox on Android; Safari has no `CloseWatcher` yet, and
  elsewhere it does nothing.
- `fullscreen`: the full detent reaches the very top of the screen, and the sheet fills the screen there even with
  short content. `/styled` squares off the corners as it arrives and pads the header by the top safe area.
- `fit` (default `true`): a sheet with short content is as tall as its content, so full is lower on the screen.
  `false` keeps the sheet at least a screen tall (the gap above it stays), so full is always the top of the screen.
  Use it when the content changes with the detent, like a list that loads more at full: with a fitted sheet, full and
  the other stops move every time the content does, so a flick up stops dead at the short content's top and a sheet
  can bounce between two detents. For a chat, use `BottomSheet.Chat` (see "Chat") instead.
- `recede`: the page behind scales back like iOS while the sheet covers the screen. Mark your app's wrapper with
  `data-ybs-background` and give it a background. While receding, `position: fixed` elements inside that wrapper are
  positioned against it. Modal sheets only. On by default for `variant="page"`.
- `replaceable`: a sheet that opens over this one replaces it instead of stacking on it. See "Replacing a sheet".
- `dialog`: show it as a centred dialog on a wide screen used with a mouse. On by default for `BottomSheet`, off for
  `Sheet.Root`. See "Dialog on desktop".
- `debug`: a function that receives the sheet's internal decision log, for testing gestures on a device.

### Closing animates

A sheet animates out after `open` turns false, so **keep it rendered**. Don't write `{open && <BottomSheet … />}`:
removing it skips the animation (it just vanishes). Whatever the content shows (the question in a confirm sheet,
the item being shared) has to stay around until the sheet is gone. `onExitComplete` tells you when:

```tsx
import { useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'

function useConfirm() {
  const [pending, setPending] = useState<{ question: string; onConfirm: () => void } | null>(null)
  const [open, setOpen] = useState(false)
  const confirm = (question: string, onConfirm: () => void) => {
    setPending({ question, onConfirm })
    setOpen(true)
  }
  const sheet = (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      onExitComplete={() => setPending(null)} // the sheet is gone: now it's safe to clear
      title={pending?.question ?? 'Confirm'}
      footer={<>
        <BottomSheet.Close>Cancel</BottomSheet.Close>
        <button onClick={() => { pending?.onConfirm(); setOpen(false) }}>Confirm</button>
      </>}
    />
  )
  return { confirm, sheet } // render {sheet} once; call confirm('Delete this list?', remove)
}
```

`onOpenChange` fires for what the user does (a trigger click, a swipe, Escape, back, a tap outside, a close button),
never when you change `open` yourself, so `onOpenChange={(o) => !o && onClose()}` can't loop.

**Confirm prompts** ("Delete event?") are alert dialogs to a screen reader. Give the sheet that role with
`contentProps`, and start focus on the safe action:

```tsx
<BottomSheet
  title="Delete event?"
  description="This can't be undone."
  contentProps={{ role: 'alertdialog' }}
  initialFocus={cancelRef}
  footer={<>
    <BottomSheet.Close ref={cancelRef}>Cancel</BottomSheet.Close>
    <button onClick={remove}>Delete</button>
  </>}
/>
```

`aria-labelledby` and `aria-describedby` already point at `title` and `description`. It can stay dismissible (a swipe,
Escape or a tap outside is Cancel); `dismissible={false}` doesn't change the role by itself.

### Styling

- Light and dark follow your app's `color-scheme` (inherited from `<html>`), so a theme switch that sets it gets a
  matching sheet. Set `html { color-scheme: light dark }` to follow the phone's setting; with no `color-scheme` at all
  the sheet stays light. That also holds after a production build lowers `light-dark()` for older browsers (Lightning
  CSS, used by Vite and Tailwind v4, does): `styled.css` defaults its switches to light. Other tools that lower it
  need a `color-scheme` on `:root`; if `--ybs-sheet-bg` isn't a colour when a sheet opens, the console says so. One sheet in a fixed theme:
  `rootProps={{ style: { colorScheme: 'dark' } }}` (on its root, see below).
- The sheet uses your app's font (it sets none of its own).
- Tokens. Set them on `[data-ybs-root]` for every sheet, and point them at your own variables to match your theme
  (dark mode then comes with it): `[data-ybs-root] { --ybs-sheet-bg: var(--card); --ybs-sheet-fg: var(--card-foreground); }`.
- One sheet with its own theme (a dark event sheet on a light page): put it on that sheet's root with `rootProps`,
  `<BottomSheet rootProps={{ 'data-theme': 'dark' }}>` (or a `className`, a `style` with tokens or `colorScheme`;
  headless: the same props on `Sheet.Portal`). Each sheet has its own `[data-ybs-root]`, around everything drawn for
  it, so the backdrop, the dialog's ring and shadow and the colour behind the keyboard follow too, also when the
  theme changes while it's open. Not on the sheet itself (`className`, `contentProps`): CSS variables don't inherit
  up, so the parts outside the sheet would keep the page's values, and a `[data-ybs-root] { --ybs-sheet-bg:
  var(--card) }` mapping reads `--card` on the root, not the sheet. A sheet that opens with such a token set on it
  logs a warning naming it.

  | Token | Default (light / dark) | What it affects |
  |---|---|---|
  | `--ybs-sheet-bg` | `#fff` / `#2c2c2e` | Sheet background, also behind the keyboard |
  | `--ybs-sheet-fg` | `#111` / `#f2f2f7` | Text colour |
  | `--ybs-muted` | `#6b6b70` / `#98989f` | Description, eyebrow, the ✕ |
  | `--ybs-handle` | grey, 30% | The grabber at the top |
  | `--ybs-divider` | grey, 12% | Lines under the header and above the footer |
  | `--ybs-backdrop` | `rgb(0 0 0 / .667)` / `#000` | Colour of the dimmed page; its alpha times `--ybs-backdrop-max` is the dim at full |
  | `--ybs-backdrop-max` | `0.6` | How dark the dim gets at full: 40% on light pages, 60% on dark ones by default. An `rgba(0,0,0,.5)` scrim is `#000` + `0.5` |
  | `--ybs-radius` | `14px` | Top corners |
  | `--ybs-title-size` | `17px` | Title |
  | `--ybs-body-padding` | `16px` | Side space of the body and footer (`0` for edge-to-edge lists that pad their own rows) |
  | `--ybs-max-width` | `640px` | Width of a `card` sheet |
  | `--ybs-content-width` | `960px` | Content column of a `width="full"` sheet |
  | `--ybs-float-gap` / `--ybs-float-radius` | `8px` / `32px` | `floating`: gap to the screen edges, corner size |
  | `--ybs-soft-fade` | `48px` | `scrollEdge="soft"`: length of the fade at the header and the footer |
  | `--ybs-soft-behind-header` / `--ybs-soft-behind-footer` | `1` | `scrollEdge="soft"`: `1` lets content carry on under the bar and fade out there, showing faintly through it; `0` fades it out before the bar |
  | `--ybs-inset` | safe area + 10px | Gap above the sheet at full (safe area + 22px for page sheets, `0` with `fullscreen`). Works headless too |
  | `--ybs-dialog-width` | `32rem` (`48rem` for `variant="page"`) | Width of the dialog on desktop. Works headless too |
  | `--ybs-dialog-gap` | `24px` | Space kept around the dialog. Works headless too |
  | `--ybs-dialog-radius` | `16px` (none headless) | Dialog corners; the dialog is clipped to them |

- `--ybs-body-inset` (read it, don't set it) is the side space actually in use, larger on a wide `width="full"` sheet;
  `BottomSheet.Edge` uses it.
- The header draws its divider only while content is scrolled under it, and the footer only while content is hidden
  behind it, so a sheet at rest has no lines splitting it.
- The sheet already pads its bottom for the home bar (`safe-area-inset-bottom`, in the footer when there is one).
  Don't add your own.

### Behaviour

- Opening, closing and the other moves the library makes (a new `detent`, the keyboard appearing, wheel steps) animate
  in about 400ms going up and 280ms going down (Material 3 emphasized easing), and are instant with reduced motion.
  Drags and flings are the browser's own scrolling.
- With the content scrolled, dragging the header moves the whole sheet and keeps the content where it is, like native.
  Scrolled to the very end (a chat at its latest message), the sheet shortens from the top instead, and the last line
  and the footer stay on the bottom edge.
- Content that changes height while the sheet rests keeps the sheet at its detent: at the end of a long content (a
  chat following a streamed reply) it stays at the end, and a detent that moves far glides there.
- A tap on content that is still scrolling only stops it, and a drag never presses what it started on.
- Keys scroll the content but never move the sheet down or close it; closing by keyboard is Escape. Escape that ends
  an input method's composition (Chinese, Japanese) is left to the input.
- Sideways scrollers inside the sheet (a photo strip) scroll with touch, a trackpad and Shift+wheel; the sheet never
  takes those. A vertical mouse wheel can't scroll a strip sideways (nowhere on the web), so with a mouse a strip that
  hides its scrollbar can't be scrolled at all: keep a thin one there, e.g.
  `@media (pointer: fine) { .strip { scrollbar-width: thin } }`.
- A mouse wheel or trackpad moves between detents one step per gesture. Closing takes more: the sheet gives a little
  on the first notches and springs back, and closes on the third notch or a longer trackpad swipe.
- Once a sheet starts closing, it finishes: a touch, wheel or drag during the animation doesn't bring it back.
- A sheet closes from a swipe, Escape, back, an outside press, a close button or `open={false}`, never from a scroll
  nobody asked for: one that lands at closed (the browser revealing a focused field, say) is undone.

### Stacked sheets

A sheet opened from inside another one stacks on top: with `/styled`, the one below recedes (scales back, like iOS)
and comes forward again when the top one closes (parts: `data-ybs-covered`, see below). Escape, Android back and a tap on the dimmed area all close only the top sheet.
The page stays inert until the last modal sheet closes. No setup: render the second `BottomSheet` inside the first.
Both can open at once (a deep link that sets both `open` states): the inner one waits a render for its parent and
still lands on top, and closing it gives focus back inside the parent. One browser rule to know: sheets opened
without a user action in between (both open on page load) share one back/Escape listener (`CloseWatcher`'s
anti-trap grouping), so the first back or Escape closes both. Opened from a tap or click, they close one at a time.

### Replacing a sheet

For a step in a flow, where the next sheet takes the place of the current one instead of stacking on it (a place,
then Share), make the current one `replaceable`:

```tsx
<BottomSheet replaceable open={place} onOpenChange={setPlace} title="Café Mollan">
  <button onClick={() => setShare(true)}>Share…</button>
</BottomSheet>
<BottomSheet open={share} onOpenChange={setShare} title="Share">…</BottomSheet>
```

Opening Share is all the app does: the place sheet gets `onOpenChange(false, { reason: 'replace' })` and slides away
behind Share as Share comes up in front, receding like a sheet going behind another (a replace closes it even with
`dismissible={false}`). The two backdrops cross-fade, so the page never gets darker for a moment (it lightens slightly
mid-swap), and a page that recedes behind them stays receded. Focus moves into the new sheet, and when it closes focus
goes back to what opened the place sheet (a non-modal new sheet doesn't take focus: it goes back right away). If your
`onOpenChange` keeps the place sheet open anyway, it simply stays, stacked under Share. The new sheet needs nothing, so a generic Share sheet still stacks wherever else it's used.
A sheet rendered *inside* the replaceable one stacks on it as usual (a confirm prompt, Directions): it can't replace
its own parent, it would close with it. So render the next step beside the replaceable sheet, in whatever component
owns it. `replaceable` acts on a sheet that's already open: two sheets opened in the same render (a deep link that
sets both) stack. Works the same as dialogs on desktop. Headless: give `[data-ybs-replaced] [data-ybs-backdrop]` the opacity
`min(var(--ybs-progress), var(--ybs-backdrop-handoff))` (what's left of its dim) instead of `--ybs-progress`.

### Dialog on desktop

A bottom sheet suits a phone; on a laptop, a sheet rising from the bottom edge of a wide window looks out of place.
So on a wide screen with a mouse, `BottomSheet` opens as a centred dialog instead, like a SwiftUI `.sheet` becomes a
form sheet on iPad. Nothing to set up:

```tsx
<BottomSheet trigger="Filters" title="Filters" detents={[0.6]}>…</BottomSheet>      {/* a dialog on desktop */}
<BottomSheet dialog={false} …>                                                       {/* a sheet everywhere */}
<BottomSheet dialog="(min-width: 1024px) and (hover: hover) and (pointer: fine)" …>  {/* your own query */}
```

For the whole app, wrap it once: `<BottomSheet.Provider dialog={false}>` keeps every sheet a sheet (headless:
`<Sheet.Provider dialog>` turns it on for the parts, which are off by default). A sheet's own `dialog` wins over the
Provider. Providers nest: an inner one overrides what it sets and keeps the rest from the outer one.

- `dialog={true}` (the default for `BottomSheet`) uses `DIALOG_QUERY`:
  `(min-width: 768px) and (hover: hover) and (pointer: fine)`, so a phone in landscape or a touch tablet keeps the
  sheet. A string replaces the whole query, so keep the hover and pointer checks if you still want that. Import
  `DIALOG_QUERY` from `@yourrealm/bottom-sheet/styled`, or use `Sheet.DIALOG_QUERY` headless.
- Same tree, props and state, unlike swapping a `Drawer` for a `Dialog` yourself: the title, footer, focus, Escape,
  back, outside press, stacking and `onExitComplete` all work the same.
- It fades and scales in (about 220ms) and out (160ms), instant with reduced motion. The content scrolls inside the
  dialog under a sticky header and above a sticky footer.
- There are no detents and nothing to drag: `detents`, `initialDetent`, `detent` and `onDetentChange` (it doesn't
  fire), `floating`, `fullscreen` and `recede` don't apply, nor do `width="card"` / `--ybs-max-width` and
  `--ybs-radius` (the dialog has its own tokens, in the table above). The grabber is hidden. An app that drives other
  UI from the current detent on desktop should pass `dialog={false}` there.
- A dismissible `BottomSheet` gets a visible ✕ (it has nothing to swipe) unless it has `leading`/`trailing`, which
  carry its own way out (Cancel / Done). `variant="page"` becomes a larger dialog (48rem); to change that width, set
  `--ybs-dialog-width` on `[data-ybs-root]` or on the sheet itself (`className`).
- `dismissible={false}` makes it behave like an alert dialog (the role stays `dialog`; set it with
  `contentProps={{ role: 'alertdialog' }}`, see "Confirm prompts"): Escape, back and an outside
  press do nothing and there's no ✕, so give it a button that closes it.
- Popovers rendered inside the dialog are clipped by its edges, also `position: fixed` ones (the dialog scrolls its
  own content, and the `/styled` sheet is a size container). Popover libraries that detect clipping (Floating UI, used
  by Base UI and Radix) flip or shift them to fit.
- Read when it opens, like `modal`: resizing the window while it's open keeps the presentation; the next open
  follows the window. Modal only: a non-modal sheet stays a sheet.
- `BottomSheet.usePresentation()` (headless: `Sheet.usePresentation()`) returns `'sheet'` or `'dialog'`, for content
  that adapts. Call it inside the sheet's content; it throws outside a sheet.
- Headless: the root gets `data-ybs-dialog`. Set `--ybs-dialog-radius` on `[data-ybs-root]` for the corners rather
  than a `border-radius` of your own: the dialog is clipped to it, which also rounds a classic scrollbar (Chrome and
  Safari leave a scroller's own scrollbar square). The clip cuts off a `box-shadow`, so draw the shadow on the
  scroller, in dialog mode only: `[data-ybs-dialog] [data-ybs-scroller] { filter: drop-shadow(…) }`. Give it its own
  close button.

### Chat

A chat in a sheet wants its newest messages at the bottom, on the composer, at every height: at half you read the
latest reply, and sliding up reveals the older messages above. One scrolling surface can't do that (at a partial
height a sheet shows its content from the top), so `BottomSheet.Chat` gives the messages a scroll area of their own,
pinned to the bottom of the screen:

```tsx
<BottomSheet
  open
  modal={false}
  dismissible={false}
  detents={['header+footer', 0.5]}
  title="Assistant"
  footer={<Composer />}
>
  <BottomSheet.Chat>
    {messages.map((m) => <Message key={m.id} message={m} />)}
  </BottomSheet.Chat>
</BottomSheet>
```

- Render the whole conversation, whatever the detent: the newest messages are what shows at half, and the history is
  already there above them when the sheet slides up. Don't swap in fewer messages at lower detents.
- It starts at the newest message and stays there while messages arrive or a reply streams in. A reader who has
  scrolled back into the history stays where they are. No scroll-to-end code needed.
- The sheet is always a screen tall (as with `fit={false}`): its height can't follow the messages.
- A swipe on the messages scrolls them, at every detent; the header and footer move the sheet. At the ends it hands
  over: a swipe up at the newest message grows the sheet, a swipe down at the oldest shrinks it. At full with the
  history scrolled back, a header drag moves the whole sheet with the messages as they are; at the newest message the
  sheet shortens from the top and the newest stay on the composer.
- Props and `ref` go to the scroll area (headless: `Sheet.Chat`). In the dialog presentation it's a plain block in the
  dialog's scrolling body, which opens at the newest message and follows new ones the same way.

### Long lists (virtualized)

A sheet with hundreds of rows is slow to open: the browser styles and lays out every row before the first frame
(1000 rows took ~750ms on a throttled phone profile, ~130ms virtualized). Virtualize the list, but don't give it a
scroll box of its own: the sheet's content scrolls in the same scroller as the sheet itself (that's how a drag hands
over from content to sheet). Point the virtualizer at that scroller with `BottomSheet.useScrollElement()` (headless:
`Sheet.useScrollElement()`). It returns the sheet's scroller, or the dialog on desktop, and `null` on the first
render. Pass the list's offset inside it as `scrollMargin`:

```tsx
import { useVirtualizer } from '@tanstack/react-virtual'

function Orders({ rows }: { rows: Order[] }) {
  const scroller = BottomSheet.useScrollElement()
  const list = useRef<HTMLUListElement>(null)
  const [margin, setMargin] = useState(0)
  useLayoutEffect(() => {
    const ul = list.current
    if (!scroller || !ul) return
    const measure = () => {
      const s = scroller.getBoundingClientRect()
      const scale = s.height / (scroller.offsetHeight || 1) || 1 // a dialog scales in while it opens
      setMargin((ul.getBoundingClientRect().top - s.top) / scale + scroller.scrollTop)
    }
    measure()
    const ro = new ResizeObserver(measure) // the offset includes the screen height
    ro.observe(scroller)
    return () => ro.disconnect()
  }, [scroller])
  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller,
    estimateSize: () => 58, // fixed: see below
    overscan: 15,
    scrollMargin: margin,
  })
  return (
    <ul ref={list} style={{ position: 'relative', height: v.getTotalSize() }}>
      {v.getVirtualItems().map((item) => (
        <li key={item.key} style={{ position: 'absolute', top: 0, insetInline: 0, height: 58, transform: `translateY(${item.start - margin}px)` }}>
          …
        </li>
      ))}
    </ul>
  )
}
```

- **Give the rows a fixed height.** A virtualizer that measures rows corrects `scrollTop` when a row above the
  screen changes size. In a sheet that's a programmatic scroll in the middle of a native fling, which stops the
  momentum on iOS.
- Overscan generously: a fling moves faster than React renders, and too few rows show as a blank strip.
- Rows outside the range aren't in the DOM: find-in-page can't reach them, and a row's own `<BottomSheet>` unmounts
  with it (the list is covered and inert while a row's sheet is open, so in practice it stays put). For a "tap a
  row, see details" list, one sheet whose content follows the selected row is simpler.

### Building from parts

Not sure you need this? Go back to `BottomSheet`.

`StyledSheet` (the preset look) and `Sheet` (no look) have the same parts; `StyledSheet` adds `Body` (the padded
content area) and `Edge`. You assemble what `BottomSheet` does for you, so a few things are yours:

```tsx
import { Sheet } from '@yourrealm/bottom-sheet'

<Sheet.Root detents={[0.4]}>
  <Sheet.Trigger>Up next</Sheet.Trigger>
  <Sheet.Portal>
    <Sheet.Backdrop className="backdrop" />
    <Sheet.View>
      <Sheet.Content className="sheet">
        <Sheet.Header className="header">
          <Sheet.Handle />
          <Sheet.Title>Up next</Sheet.Title>
          <Sheet.Close>Done</Sheet.Close>
        </Sheet.Header>
        …
        <Sheet.Footer className="footer">…</Sheet.Footer>
      </Sheet.Content>
    </Sheet.View>
  </Sheet.Portal>
</Sheet.Root>
```

- **With `StyledSheet`:** put your content in `StyledSheet.Body` after the `Header` (it's the padded area, and
  `StyledSheet.Edge` lines up with it), add `StyledSheet.Backdrop` for a modal sheet, and lay out the header yourself
  (the Cancel / title / Save row, the ✕ and the eyebrow are `BottomSheet` features).
- **Naming:** `Sheet.Title` and `Sheet.Description` name and describe the dialog. Without a `Title`, give
  `Sheet.Content` an `aria-label` (or `aria-labelledby` pointing at your own heading).
- **Closing:** add your own `Sheet.Close`; there's no automatic screen-reader close button.
- **Non-modal:** leave `Backdrop` out yourself (a rendered `Backdrop` still dims and closes on tap).
- **`Sheet.Portal container`:** render into an element other than `<body>`. A modal sheet still makes everything else
  on the page inert. Its other props (`className`, `style`, `data-*`) go on the sheet's `[data-ybs-root]`: one sheet's
  theme goes there.
- **`Sheet.View`** passes its props (`className`, `style`, `ref`, `data-*`) to the scroller, the one scroll
  container; `bleedClassName` styles the layer that continues the sheet colour behind the keyboard.
- **Set by the library on `[data-ybs-root]`**, for your own styling: `--ybs-progress` (0 to 1, closed to full),
  `--ybs-visible` (px of the sheet on screen), and the attributes `data-ybs-scrolled` (content scrolled under the
  header), `data-ybs-more` (content hidden behind the footer), `data-ybs-fit` (the sheet is shorter than the screen),
  `data-ybs-fullscreen`, `data-ybs-modeless` (non-modal), `data-ybs-dialog` (shown as a dialog), and on the sheet below a stacked one `data-ybs-covered`
  with `--ybs-covered` (0 to 1, following the top sheet).
- **Recede headless:** style `html[data-ybs-recede] [data-ybs-background]` with `--ybs-recede` (0 to 1, how much of
  the screen the sheet covers) and `--ybs-scroll-y` (for a `transform-origin` at the top of the screen).
- **Headless sticky header:** content scrolling under it can show a 1px sliver above it; cover it with
  `box-shadow: 0 -2px 0 0 <sheet colour>` on the header (only while `data-ybs-scrolled` if your sheet has a border).
- Don't put `touch-action` classes on the header (Tailwind's utilities layer beats ours): the library turns it off
  there while the content is scrolled, so that dragging the header moves the whole sheet.
- **Types** for wrappers: `Detent`, `OpenChangeReason`, `OpenChangeDetails`, `RootProps`, `ContentProps`,
  `ProviderProps`, `InitialFocus` and the other part props from both entry points, and `BottomSheetProps` and
  `DIALOG_QUERY` from `/styled` (headless: `Sheet.DIALOG_QUERY`).

### Replacing a `<dialog>`

| `<dialog>` | bottom-sheet |
|---|---|
| `showModal()` / `close()` | `open` (keep the sheet rendered, see "Closing animates") |
| `cancel` event (Escape) | `onOpenChange(false, { reason: 'escape' })` |
| click where `target === currentTarget` (backdrop) | `onOpenChange(false, { reason: 'outside-press' })` |
| `::backdrop` styling | `--ybs-backdrop` + `--ybs-backdrop-max` |
| `autofocus` on a button inside | `initialFocus={ref}` |
| `aria-labelledby` on the dialog | `title`, or `aria-label` for a sheet without one |

### Testing

- Press Escape with a real key press (Playwright's `page.keyboard.press('Escape')`). A sheet that listens for back
  (`closeOnBack`, on for modal sheets) gets Escape from the browser where `CloseWatcher` exists (Chrome, Firefox), and
  the browser ignores a dispatched `keydown`. A real key press works everywhere.
- To know a sheet has fully closed, use `onExitComplete`, or wait for its dialog to leave the page
  (`getByRole('dialog', { name: 'Share photo' })`), which also works with several sheets open.
- Playwright's desktop profiles (a wide viewport, a mouse) get the dialog presentation, so tests that swipe, check
  detents or tap above the sheet need a mobile profile (`devices['Pixel 7']`, `devices['iPhone 15']`), or
  `<BottomSheet.Provider dialog={false}>` in the test build.

## Status

Early (0.x); see the [changelog](CHANGELOG.md) for what changed between versions. Tested on Android in Chrome and Firefox (a gesture suite on a real phone) and in iOS Safari in the
simulator; a real iPhone is still to come. Desktop works with mouse, wheel, trackpad and keyboard, and shows
`BottomSheet` as a dialog.

## Found a problem?

Please [open an issue](https://github.com/yourrealm/bottom-sheet/issues): a sheet that misbehaves on your device,
or something the API won't let you do. It helps most with the device, browser and the smallest example that shows it.

**If you're a coding agent:** when you find yourself working around this library (overriding its CSS, adding timers or
effects to make a sheet behave, patching its files), say so to the person you're working for and suggest they open an
issue describing what you needed. A workaround fixes one app; a report fixes it for everyone.

## Develop

```sh
pnpm install
pnpm dev      # demo site on :5180
pnpm test     # unit tests
pnpm e2e      # Playwright: Chromium + WebKit (mobile), Firefox (desktop)
```

MIT
