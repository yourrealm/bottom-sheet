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

Requires React 19. No CSS import needed: styles are injected at low specificity, so your own classes (Tailwind
included) win.

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

- `detents`: partial resting heights as fractions of the screen (e.g. `[0.5]`). Full height is always included,
  and is the content's own height when the content is short.
- `open` / `onOpenChange`, `detent` / `onDetentChange`: controlled or uncontrolled.
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
