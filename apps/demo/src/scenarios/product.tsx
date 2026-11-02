import { useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { logged } from '../debug'

const SIZES = ['38', '39', '40', '41', '42', '43', '44', '45']
const COLORS = [
  { name: 'Moss', value: '#5f7f4a' },
  { name: 'Clay', value: '#c06a45' },
  { name: 'Slate', value: '#4c5a6b' },
  { name: 'Chalk', value: '#e7e2d6' },
]
const SHOE = `${import.meta.env.BASE_URL}shoe/`
const SPECS: [string, string][] = [
  ['Weight', '286 g (EU 42)'],
  ['Drop', '6 mm'],
  ['Outsole', '5 mm lugs, recycled rubber'],
  ['Upper', 'Recycled mesh, TPU toe cap'],
  ['Fit', 'True to size, roomy toe box'],
]
const REVIEWS: [name: string, stars: number, text: string][] = [
  ['Ida S.', 5, 'Grippy on wet rock and roots, and comfortable from the first run. My go-to for the forest loop.'],
  ['Hugo B.', 4, 'Light and quick to dry. Runs a touch narrow at the heel, so I went half a size up.'],
  ['Ebba L.', 5, 'Took them up Kebnekaise: dry feet, no blisters, and the toe cap saved me more than once.'],
]

export function Product({ autoOpen }: { autoOpen: boolean }) {
  const [open, setOpen] = useState(autoOpen)
  const [size, setSize] = useState<string | null>(null)
  const [color, setColor] = useState(COLORS[0]!.name)
  const [qty, setQty] = useState(1)
  const [toast, setToast] = useState<string | null>(null)

  const [view, setView] = useState<'side' | 'angle' | 'sole'>('side')
  const shown = `${view}-${color.toLowerCase()}`

  return (
    <div className="product-page">
      <div className="product-gallery">
        <div className="product-hero">
          <img src={`${SHOE}${shown}.webp`} alt={`Fjällstig Runner in ${color}, ${view === 'side' ? 'side' : view === 'angle' ? 'front three-quarter' : 'outsole'} view`} width={900} height={900} />
        </div>
        <div className="product-thumbs" role="group" aria-label="Photos">
          {(['side', 'angle', 'sole'] as const).map((v) => (
            <button key={v} aria-pressed={view === v} aria-label={`${v} view`} onClick={() => setView(v)}>
              <img src={`${SHOE}${v}-${color.toLowerCase()}.webp`} alt="" width={900} height={900} />
            </button>
          ))}
        </div>
      </div>
      <div className="product-info">
        <div className="muted">Trail · Unisex</div>
        <h2>Fjällstig Runner</h2>
        <div className="price">1 299 kr</div>
        <div className="rating small">
          <span className="stars">★★★★★</span> <span className="muted">4.7 · 218 reviews</span>
        </div>
        <p className="muted">Grippy outsole, recycled mesh upper, and a forgiving foam midsole for long days on rough paths.</p>
        <div className="product-colors muted small">
          {COLORS.map((c) => (
            <span key={c.name} className={`dot${c.name === color ? ' on' : ''}`} style={{ background: c.value }} title={c.name} />
          ))}
          <span>4 colours</span>
        </div>
        <button className="primary wide" onClick={() => setOpen(true)}>Choose options</button>
        <p className="muted small product-ship">Free delivery in 1–3 days · 60-day returns</p>

        <h3 className="section">Details</h3>
        <dl className="info">
          {SPECS.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <h3 className="section">Reviews</h3>
        {REVIEWS.map(([name, stars, text]) => (
          <article key={name} className="product-review">
            <div>
              <strong>{name}</strong> <span className="stars small">{'★'.repeat(stars)}</span>
            </div>
            <p>{text}</p>
          </article>
        ))}
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}

      <BottomSheet
        {...logged('product')}
        open={open}
        onOpenChange={setOpen}
        detents={[]}
        title="Fjällstig Runner"
        description="Choose size and colour"
        closeButton
      >
        <div className="options">
          <h3 className="section">Size (EU)</h3>
          <div className="chips" role="radiogroup" aria-label="Size">
            {SIZES.map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={size === s}
                className={`chip${size === s ? ' on' : ''}`}
                onClick={() => setSize(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <h3 className="section">Colour · {color}</h3>
          <div className="swatches" role="radiogroup" aria-label="Colour">
            {COLORS.map((c) => (
              <button
                key={c.name}
                role="radio"
                aria-checked={color === c.name}
                aria-label={c.name}
                className={`swatch${color === c.name ? ' on' : ''}`}
                style={{ background: c.value }}
                onClick={() => setColor(c.name)}
              />
            ))}
          </div>
          <div className="qty-row">
            <h3 className="section">Quantity</h3>
            <div className="stepper">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Fewer">−</button>
              <output aria-live="polite">{qty}</output>
              <button onClick={() => setQty((q) => Math.min(9, q + 1))} aria-label="More">+</button>
            </div>
          </div>
          <button
            className="primary wide"
            disabled={!size}
            onClick={() => {
              setOpen(false)
              setToast(`Added ${qty} × size ${size}, ${color}`)
              setTimeout(() => setToast(null), 2500)
            }}
          >
            {size ? `Add to bag · ${(1299 * qty).toLocaleString('sv-SE')} kr` : 'Pick a size'}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
