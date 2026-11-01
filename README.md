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

The simple path, with the polished preset:

```tsx
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'

<BottomSheet trigger="Filters" title="Filters" detents={[0.5]}>
  …
</BottomSheet>
```

Headless parts, for your own look:

```tsx
import { Sheet } from '@yourrealm/bottom-sheet'

<Sheet.Root detents={[0.4]} onDetentChange={(d) => console.log(d)}>
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
      </Sheet.Content>
    </Sheet.View>
  </Sheet.Portal>
</Sheet.Root>
```

### Options

- `detents`: partial resting heights, as fractions of the height available to the sheet (`0.5`) or CSS lengths of visible sheet (`'76px'`,
  `'40dvh'`). Full height is always included, and is the content's own height when the content is short. Default `[]`:
  the sheet opens straight to full, like iOS. It opens at the smallest partial detent when you give some, or at
  `initialDetent`.
- `open` / `defaultOpen` / `onOpenChange(open, { reason })`: controlled or uncontrolled. The reason is
  `'trigger' | 'close-button' | 'escape' | 'back' | 'outside-press' | 'swipe'`. Use `open` when a sheet has several
  openers, or opening runs your own logic.
- `detent` / `onDetentChange`: the detent the sheet rests at. Pass `detent` to control it (changing it moves the
  sheet); `onDetentChange` reports where it came to rest, never `'closed'` (closing is `onOpenChange(false)`), so
  `detent={d} onDetentChange={setD}` round-trips.
- `trigger` (`/styled`): text or elements go inside our trigger button; a function renders your own button (a
  design-system `<Button>`), receiving `type`, `onClick` and the ARIA state:
  `trigger={(props) => <Button variant="outline" {...props}>Filters</Button>}`. Headless: `<Sheet.Trigger render={…} />`.
- `modal` (default `true`): `false` gives a sheet without a backdrop that leaves the page usable around it (no inert,
  no scroll lock). It doesn't move focus unless you pass `initialFocus`, and Escape only acts on it while focus is
  inside it. `modal` is read when the sheet opens; a change while it's open applies from the next open.
  On iOS, each direct child of a non-modal sheet becomes a 1px horizontal scroller (Safari needs a scroll container
  under the finger to drag the sheet): keep sticky elements at the top level, like `Sheet.Header`, and render popovers
  in a portal rather than inside the sheet's children.
- `initialFocus` (on `BottomSheet` / `Sheet.Content`, like Base UI's): where focus goes when the sheet opens. A ref,
  `false`, `true` (the sheet), or a function of how it was opened: `initialFocus={(type) => type !== 'touch' &&
  newBoardRef.current}` focuses a button for mouse and keyboard users only. Default: the sheet for a modal sheet,
  nothing for a non-modal one. A non-modal sheet that took focus gives it back when it closes.
- `dismissible` (default `true`): `false` means a swipe down, Escape or an outside press drop the sheet to its lowest
  detent instead of closing it. `open={false}` and `<Sheet.Close>` still close it.
- `closeOnBack` (default: `modal`): the Android back button closes the top sheet, like a native sheet. Built on
  [`CloseWatcher`](https://developer.mozilla.org/en-US/docs/Web/API/CloseWatcher), so it adds no history entries and
  never touches your URLs or router. Works in Chrome and Firefox on Android; Safari has no `CloseWatcher` yet, and
  elsewhere it does nothing.
- `fullscreen`: the full detent reaches the very top of the screen, and the sheet fills the screen there even with short
  content. `/styled` squares off the corners as it arrives and pads the header by the top safe area.
- `Sheet.Portal container`: render into an element other than `<body>`. A modal sheet still makes everything else on
  the page inert.
- `debug`: a function that receives the sheet's internal decision log, for testing gestures on a device.
- `recede`: the page behind scales back like iOS while the sheet covers the screen. Mark your app's wrapper with
  `data-ybs-background` and give it a background. While receding, `position: fixed` elements inside that wrapper are
  positioned against it. Page sheets (`variant="page"`) recede by default.
- `/styled` only:
  - `title`, `description` (headless: `Sheet.Title`, `Sheet.Description`, which name and describe the dialog; without
    a `Sheet.Title`, give `Sheet.Content` an `aria-label`), and `leading` / `trailing` header slots (Cancel / title / Save, title centred), plus
    `headerExtra` for things under the title (a search field).
  - `variant="page"`: an iOS page sheet for a task: full width, the page behind recedes, and the sheet fills the
    screen at full. Leave `detents` out and it opens straight to full.
  - `width`: `'card'` (at most 640px, centred) or `'full'` (spans the window, content in a centred 960px column).
  - `floating`: iOS 26 style, inset from the screen edges with large corners at lower detents, attaching as it reaches
    full (tokens `--ybs-float-gap`, `--ybs-float-radius`).

  ```tsx
  <BottomSheet variant="page" title="New Note" leading={<Sheet.Close>Cancel</Sheet.Close>} trailing={<button onClick={save}>Save</button>}>
  ```

A persistent "result" sheet that peeks at 76px and never closes by gesture:

```tsx
<BottomSheet open={solved} modal={false} dismissible={false} detents={['76px']} title="Solved">
  …
</BottomSheet>
```

### Styling

- `/styled` light and dark follow your app's `color-scheme` (inherited from `<html>`), so a theme switch that sets it
  gets a matching sheet. Set `html { color-scheme: light dark }` to follow the phone's setting; with no `color-scheme`
  at all the sheet stays light. All colours are `--ybs-*` tokens.
- One sheet in a fixed theme: set `color-scheme` on it, e.g. `className="[color-scheme:dark]"` or
  `contentProps={{ style: { colorScheme: 'dark' } }}` (headless: on `Sheet.Content`).
- The `/styled` body gets 16px side padding like the header (`--ybs-body-padding`; set it to `0` for edge-to-edge lists).
- Headless `Sheet.View` passes its props (`className`, `style`, `ref`, `data-*`) to the scroller, the one scroll container.
- CSS variables on `[data-ybs-root]`: `--ybs-progress` (0 to 1, closed to full) for your own backdrop or effects,
  `--ybs-visible` (px of the sheet on screen), and `--ybs-sheet-bg` (the colour that continues behind the keyboard).
  While the content is scrolled the root has `data-ybs-scrolled`.
- Headless: content scrolling under a sticky `Sheet.Header` can show a 1px sliver above it; cover it with a
  `box-shadow: 0 -2px 0 0 <sheet colour>` on the header (only while `data-ybs-scrolled` if your sheet has a border).
- Don't put `touch-action` classes on `Sheet.Header` (Tailwind's utilities layer beats ours): the library turns it off
  there while the content is scrolled, so that dragging the header moves the whole sheet.

### Behaviour

- Opening, closing and the other moves the library makes (a new `detent`, the keyboard appearing, wheel steps) animate
  in about 400ms going up and 280ms going down (Material 3 emphasized easing), and are instant with reduced motion. Drags and flings are the
  browser's own scrolling.
- With the content scrolled, dragging the header moves the whole sheet and keeps the content where it is, like native.
- A tap on content that is still scrolling only stops it, and a drag never presses what it started on.
- Keys scroll the content but never move the sheet down or close it; closing by keyboard is Escape. Escape that ends
  an input method's composition (Chinese, Japanese) is left to the input.
- Once a sheet starts closing, it finishes: a touch, wheel or drag during the animation doesn't bring it back.
- A sheet closes from a swipe, Escape, back, an outside press, a close button or `open={false}`, never from a scroll
  nobody asked for: one that lands at closed (the browser revealing a focused field, say) is undone.

## Status

Early (0.x). Tested on Android in Chrome and Firefox (a gesture suite on a real phone) and in iOS Safari in the
simulator; a real iPhone is still to come. Desktop works with mouse, wheel, trackpad and keyboard.

## Develop

```sh
pnpm install
pnpm dev      # demo site on :5180
pnpm test     # unit tests
pnpm e2e      # Playwright: Chromium + WebKit (mobile), Firefox (desktop)
```

MIT
