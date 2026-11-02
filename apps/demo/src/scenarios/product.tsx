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

export function Product({ autoOpen }: { autoOpen: boolean }) {
  const [open, setOpen] = useState(autoOpen)
  const [size, setSize] = useState<string | null>(null)
  const [color, setColor] = useState(COLORS[0]!.name)
  const [qty, setQty] = useState(1)
  const [toast, setToast] = useState<string | null>(null)

  return (
    <div className="product-page">
      <div className="product-hero" style={{ ['--c' as string]: COLORS.find((c) => c.name === color)!.value }}>
        <span>👟</span>
      </div>
      <div className="product-info">
        <div className="muted">Trail · Unisex</div>
        <h2>Fjällstig Runner</h2>
        <div className="price">1 299 kr</div>
        <p className="muted">Grippy outsole, recycled mesh upper, and a forgiving foam midsole for long days on rough paths.</p>
        <button className="primary wide" onClick={() => setOpen(true)}>Choose options</button>
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
