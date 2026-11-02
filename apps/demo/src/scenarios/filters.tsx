import { useMemo, useState } from 'react'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { Icon, type IconName } from '../icons'
import { logged } from '../debug'

const CATEGORIES = [
  'Tents', 'Sleeping bags', 'Backpacks', 'Stoves', 'Headlamps', 'Water filters', 'Trekking poles', 'Rain jackets',
  'Base layers', 'Gloves', 'Maps', 'First aid', 'Cookware', 'Hammocks', 'Camp chairs', 'Dry bags',
]
const SORTS = ['Relevance', 'Price', 'Newest', 'Rating']
const ITEMS: [name: string, kind: string, price: number, hue: number, icon: IconName][] = [
  ['Fjällhem 2 tent', 'Tents', 3490, 140, 'tent'], ['Kvist ultralight tent', 'Tents', 5290, 95, 'tent'], ['Glöd canister stove', 'Stoves', 649, 20, 'flame'],
  ['Glöd titanium pot', 'Cookware', 399, 210, 'cookingPot'], ['Lavvu down bag −5°', 'Sleeping bags', 2890, 260, 'bedDouble'], ['Ränna 38 L pack', 'Backpacks', 1590, 30, 'backpack'],
  ['Lykta 400 headlamp', 'Headlamps', 449, 50, 'flashlight'], ['Bäck squeeze filter', 'Water filters', 379, 190, 'droplets'], ['Stig carbon poles', 'Trekking poles', 899, 0, 'mountain'],
  ['Skur rain shell', 'Rain jackets', 1990, 220, 'cloudRain'], ['Ull merino base layer', 'Base layers', 749, 340, 'shirt'], ['Gunga hammock', 'Hammocks', 549, 160, 'tent'],
]

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
        <div>
          <h2>Outdoor gear</h2>
          <span className="muted small">
            {results} results · {sort}
            {inStock && ' · In stock'}
            {sale && ' · On sale'}
          </span>
        </div>
        <button className="primary" onClick={() => setOpen(true)}>Filters · {cats.size}</button>
      </div>
      <div className="active-filters" aria-label="Active filters">
        {[...cats].map((c) => (
          <span key={c} className="tag on">{c}</span>
        ))}
        <span className="tag">Up to {maxPrice.toLocaleString('sv-SE')} kr</span>
      </div>
      <div className="results-grid">
        {ITEMS.map(([name, kind, price, hue, icon]) => (
          <div key={name} className="result-card" style={{ ['--h' as string]: hue }}>
            <div className="result-img">
              <Icon name={icon} size={44} strokeWidth={1.4} />
            </div>
            <div className="result-name">{name}</div>
            <div className="muted small">{kind} · {price.toLocaleString('sv-SE')}{'\u00a0'}kr</div>
          </div>
        ))}
      </div>

      <BottomSheet {...logged('filters')} open={open} onOpenChange={setOpen} detents={[0.6]}
        title="Filters"
        footer={<button className="primary wide" onClick={() => setOpen(false)}>Show {results} results</button>}
      >
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
        </div>
      </BottomSheet>
    </div>
  )
}
