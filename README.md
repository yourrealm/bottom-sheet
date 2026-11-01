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
controller only handles what native sheets also do on top: stopping a fling at the full detent, following the
on-screen keyboard, and re-snapping when the layout changes.

## Install

```sh
pnpm add @yourrealm/bottom-sheet
```

Requires React 19. No CSS import needed: styles are injected into the `ybs` cascade layer, so your own CSS wins.
With Tailwind v4 the layer sits between `base` and `components`: utility classes on the parts win, and preflight
doesn't reset the preset.

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

- `detents`: partial resting heights, as fractions of the screen (`0.5`) or CSS lengths of visible sheet (`'76px'`,
  `'40dvh'`). Full height is always included, and is the content's own height when the content is short.
- `open` / `onOpenChange(open, { reason })`, `detent` / `onDetentChange`: controlled or uncontrolled. The reason is
  `'trigger' | 'close-button' | 'escape' | 'back' | 'outside-press' | 'swipe'`.
- `modal` (default `true`): `false` gives a sheet without a backdrop that leaves the page usable around it (no inert,
  no scroll lock, focus stays where it is).
- `dismissible` (default `true`): `false` means a swipe down, Escape or an outside press drop the sheet to its lowest
  detent instead of closing it. `open={false}` and `<Sheet.Close>` still close it.
- `fullscreen`: the full detent reaches the very top of the screen, and the sheet fills the screen there even with short
  content. `/styled` squares off the corners as it arrives and pads the header by the top safe area.
- `/styled` only: `variant="page"` (an iOS page sheet for a task: opens straight to full, full width), `width`
  (`'card'`: at most 640px, centred; `'full'`: spans the window with the content in a centred 960px column), and
  `leading` / `trailing` header slots (Cancel / title / Save, title centred):

  ```tsx
  <BottomSheet variant="page" title="New Note" leading={<Sheet.Close>Cancel</Sheet.Close>} trailing={<button onClick={save}>Save</button>}>
  ```
- `closeOnBack` (default: `modal`): the Android back button closes the top sheet, like a native sheet. Built on
  [`CloseWatcher`](https://developer.mozilla.org/en-US/docs/Web/API/CloseWatcher), so it adds no history entries and
  never touches your URLs or router. Works in Chrome Android; Firefox Android has the API but doesn't route its back
  button to it yet, and Safari has no back button. Elsewhere it does nothing.

A persistent "result" sheet that peeks at 76px and never closes by gesture:

```tsx
<BottomSheet open={solved} modal={false} dismissible={false} detents={['76px']} title="Solved">
  …
</BottomSheet>
```
- CSS variables on `[data-ybs-root]`: `--ybs-progress` (0 to 1, closed to full) for your own backdrop or effects, and
  `--ybs-sheet-bg` (the colour that continues behind the keyboard).

## Status

Early. The core works in Chrome and Firefox on Android and in iOS Safari (simulator). See `CLAUDE.md` for the design
notes, what's been tested where, and what's still open.

## Develop

```sh
pnpm install
pnpm dev      # demo site on :5180
pnpm test     # unit tests
pnpm e2e      # Playwright: Chromium + WebKit (mobile), Firefox (desktop)
```

MIT
