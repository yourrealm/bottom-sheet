import { useCallback, useRef, useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { Icon } from '../icons'
import { log, logged } from '../debug'

interface Photo {
  src: string
  alt: string
  w: number
  h: number
}

const BASE = import.meta.env.BASE_URL

/** A stand-in photo: an SVG gradient with real dimensions, so it letterboxes like a photo (object-fit: contain). */
function gradient(hue: number, w: number, h: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs>
<radialGradient id="g" cx="30%" cy="30%" r="80%"><stop offset="0" stop-color="hsl(${hue} 85% 72%)"/><stop offset="1" stop-color="hsl(${hue + 40} 60% 30%)"/></radialGradient>
</defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const SIZES: [number, number][] = [[1200, 900], [900, 1200], [1000, 1000], [1600, 900], [900, 1350]]
const PHOTOS: Photo[] = [
  { src: `${BASE}dog/toy.webp`, alt: 'A small dog holding a purple toy', w: 1200, h: 1184 },
  { src: `${BASE}dog/walk.webp`, alt: 'A small dog on a forest path at sunset', w: 1040, h: 1300 },
  ...Array.from({ length: 22 }, (_, i) => {
    const [w, h] = SIZES[i % SIZES.length]!
    const hue = (i * 47 + 20) % 360
    return { src: gradient(hue, w, h), alt: `Gradient ${i + 1}`, w, h }
  }),
]

/**
 * A photo lightbox. On a phone: a fullscreen black sheet you swipe down to close, and swipe sideways between photos
 * (a horizontal scroller inside the one sheet scroller). On desktop (the app-wide `dialog`): a large dialog with
 * arrow buttons and arrow keys.
 */
export function Lightbox(_: { autoOpen: boolean }) {
  const [start, setStart] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(0)
  const strip = useRef<HTMLDivElement | null>(null)

  // The strip mounts when the sheet does: jump to the tapped photo before it paints.
  const stripRef = useCallback(
    (el: HTMLDivElement | null) => {
      strip.current = el
      if (el && start != null) el.scrollLeft = start * el.clientWidth
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the strip mounts
    [open],
  )
  const go = (by: number) => {
    const el = strip.current
    if (!el) return
    const to = Math.min(Math.max(shown + by, 0), PHOTOS.length - 1)
    el.scrollTo({ left: to * el.clientWidth, behavior: 'smooth' })
  }
  const photo = PHOTOS[shown]!

  return (
    <div className="page-pad">
      <header className="lb-head">
        <h2>Summer on Lillholmen</h2>
        <p className="muted small">{PHOTOS.length} photos · tap one to open it</p>
      </header>
      <div className="lb-grid">
        {PHOTOS.map((p, i) => (
          <button
            key={p.src}
            className="lb-thumb"
            aria-label={`Open ${p.alt}`}
            onClick={() => {
              setStart(i)
              setShown(i)
              setOpen(true)
            }}
          >
            <img src={p.src} alt="" loading="lazy" />
          </button>
        ))}
      </div>

      <BottomSheet
        {...logged('lightbox', { className: 'lightbox-root' })}
        open={open}
        onOpenChange={(o) => {
          log(`lightbox: onOpenChange ${o}`)
          setOpen(o)
        }}
        fullscreen
        className="lightbox"
        aria-label="Photo viewer"
        leading={<BottomSheet.Close className="lb-text-button">Done</BottomSheet.Close>}
        trailing={
          <span className="lb-count" aria-live="polite">
            {shown + 1} of {PHOTOS.length}
          </span>
        }
        contentProps={{
          onKeyDown: (e) => {
            if (e.key === 'ArrowRight') go(1)
            else if (e.key === 'ArrowLeft') go(-1)
            else return
            e.preventDefault()
          },
        }}
        footer={<p className="lb-caption">{photo.alt}</p>}
      >
        <BottomSheet.Edge
          className="lb-strip"
          ref={stripRef}
          onScroll={(e) => setShown(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        >
          {PHOTOS.map((p, i) => (
            <div key={p.src} className="lb-slide" aria-hidden={i !== shown}>
              <img src={p.src} alt={p.alt} width={p.w} height={p.h} draggable={false} />
            </div>
          ))}
        </BottomSheet.Edge>
        {/* Over the sides of the photo; for a mouse (touch swipes). */}
        <button className="lb-nav prev" aria-label="Previous photo" disabled={shown === 0} onClick={() => go(-1)}>
          <Icon name="chevronLeft" size={24} strokeWidth={2.2} />
        </button>
        <button className="lb-nav next" aria-label="Next photo" disabled={shown === PHOTOS.length - 1} onClick={() => go(1)}>
          <Icon name="chevronRight" size={24} strokeWidth={2.2} />
        </button>
      </BottomSheet>
    </div>
  )
}
