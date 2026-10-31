import { useMemo, useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { logged } from '../debug'

const CATEGORIES = [
  'Tents', 'Sleeping bags', 'Backpacks', 'Stoves', 'Headlamps', 'Water filters', 'Trekking poles', 'Rain jackets',
  'Base layers', 'Gloves', 'Maps', 'First aid', 'Cookware', 'Hammocks', 'Camp chairs', 'Dry bags',
]
const SORTS = ['Relevance', 'Price', 'Newest', 'Rating']

export function Filters({ autoOpen }: { autoOpen: boolean }) {
  const [open, setOpen] = useState(autoOpen)
  const [sort, setSort] = useState('Relevance')
  const [maxPrice, setMaxPrice] = useState(2500)
  const [inStock, setInStock] = useState(true)
  const [sale, setSale] = useState(false)
  const [cats, setCats] = useState<Set<string>>(new Set(['Tents', 'Stoves']))
  const results = useMemo(() => Math.max(3, Math.round(maxPrice / 20) - cats.size * 7 + (inStock ? 0 : 40) - (sale ? 60 : 0)), [maxPrice, cats, inStock, sale])

  return (
    <div className="results-page">
      <div className="results-bar">
        <strong>Outdoor gear</strong>
        <button className="primary" onClick={() => setOpen(true)}>Filters · {cats.size}</button>
      </div>
      <div className="results-grid">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="result-card" style={{ ['--h' as string]: (i * 37) % 360 }}>
            <div className="result-img" />
            <div className="result-name">Item {i + 1}</div>
            <div className="muted small">{(299 + i * 113).toLocaleString('sv-SE')} kr</div>
          </div>
        ))}
      </div>

      <BottomSheet {...logged('filters')} open={open} onOpenChange={setOpen} detents={[0.6]} title="Filters">
        <div className="filters">
          <h3 className="section">Sort by</h3>
          <div className="segmented" role="radiogroup" aria-label="Sort by">
            {SORTS.map((s) => (
              <button key={s} role="radio" aria-checked={sort === s} className={sort === s ? 'on' : ''} onClick={() => setSort(s)}>
                {s}
              </button>
            ))}
          </div>
          <h3 className="section">Max price · {maxPrice.toLocaleString('sv-SE')} kr</h3>
          <input
            className="range"
            type="range"
            min={100}
            max={5000}
            step={50}
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            aria-label="Max price"
          />
          <label className="switch-row">
            In stock only
            <input type="checkbox" role="switch" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
          </label>
          <label className="switch-row">
            On sale
            <input type="checkbox" role="switch" checked={sale} onChange={(e) => setSale(e.target.checked)} />
          </label>
          <h3 className="section">Categories</h3>
          <ul className="checks">
            {CATEGORIES.map((c) => (
              <li key={c}>
                <label>
                  <input
                    type="checkbox"
                    checked={cats.has(c)}
                    onChange={(e) =>
                      setCats((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(c)
                        else next.delete(c)
                        return next
                      })
                    }
                  />
                  {c}
                </label>
              </li>
            ))}
          </ul>
          <div className="sticky-footer">
            <button className="primary wide" onClick={() => setOpen(false)}>Show {results} results</button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
