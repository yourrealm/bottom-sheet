import { memo, useLayoutEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { BottomSheet } from '@yourrealm/bottom-sheet/styled'
import { log, logged } from '../debug'
import { hues, initials, people, rng } from '../data'

const N = 1000
const r = rng(5)
const ROWS = Array.from({ length: N }, (_, i) => {
  const name = people[i % people.length]!
  return {
    id: i,
    name,
    title: `Order #${(48210 + i).toString()}`,
    amount: `${(120 + Math.floor(r() * 4800)).toLocaleString('sv-SE')} kr`,
    status: ['Delivered', 'Shipped', 'Processing', 'Returned'][Math.floor(r() * 4)]!,
    hue: hues[i % hues.length]!,
  }
})

/**
 * Worst case for per-item sheets: a sheet with 1000 rows where EVERY row owns its own <BottomSheet>
 * (stacked on top of the list sheet). Closed sheets should cost ~nothing: Root is a context and
 * Portal renders null until opened. Render time of the list is logged.
 */
export function Thousand({ autoOpen }: { autoOpen: boolean }) {
  const [open, setOpen] = useState(autoOpen)
  return (
    <div className="page-pad thousand-page">
      <p>
        A sheet with <strong>{N} rows</strong>, where each row has its <em>own</em> bottom sheet. Open the list, scroll,
        and tap any order.
      </p>
      <button className="primary wide" id="open-orders" onClick={() => setOpen(true)}>
        Open {N} orders
      </button>
      <BottomSheet {...logged('orders')} open={open} onOpenChange={setOpen} detents={[0.6]} title="Orders" description={`${N} orders, one sheet each`}>
        <OrderList />
      </BottomSheet>
    </div>
  )
}

// ?bare=1 renders the same rows without per-row sheets, to measure what the sheets cost.
// ?virtual=1 renders only the rows on screen (plus overscan), still one sheet per row.
const params = new URLSearchParams(location.search)
const BARE = params.get('bare') === '1'
const VIRTUAL = params.get('virtual') === '1'
/** Fixed row height: a virtualizer that measures rows corrects scrollTop mid-fling, which fights native momentum. */
const ROW_H = 58

function OrderList() {
  return VIRTUAL ? <VirtualOrderList /> : <FullOrderList />
}

/**
 * The list lives in the sheet's one scroller (or the dialog), not a box of its own: the virtualizer follows that
 * element, with the list's offset in it as `scrollMargin` (spacer + header; it changes when the screen resizes).
 */
function VirtualOrderList() {
  const scroller = BottomSheet.useScrollElement()
  const list = useRef<HTMLUListElement>(null)
  const [margin, setMargin] = useState(0)
  useLayoutEffect(() => {
    const ul = list.current
    if (!scroller || !ul) return
    const measure = () => {
      const s = scroller.getBoundingClientRect()
      // A dialog scales in while it opens: measure in layout px.
      const scale = s.height / (scroller.offsetHeight || 1) || 1
      setMargin(Math.round((ul.getBoundingClientRect().top - s.top) / scale + scroller.scrollTop))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(scroller)
    return () => ro.disconnect()
  }, [scroller])
  const v = useVirtualizer({
    count: N,
    getScrollElement: () => scroller,
    estimateSize: () => ROW_H,
    overscan: 15,
    scrollMargin: margin,
  })
  const t0 = useRef(performance.now())
  useLayoutEffect(() => {
    log(`orders: rendered virtual list (${N} rows) in ${(performance.now() - t0.current).toFixed(1)}ms`)
  }, [])
  return (
    <ul ref={list} className="orders virtual" style={{ height: v.getTotalSize() }}>
      {v.getVirtualItems().map((item) => {
        const row = ROWS[item.index]!
        return (
          <li
            key={row.id}
            aria-setsize={N}
            aria-posinset={item.index + 1}
            style={{ transform: `translateY(${item.start - margin}px)` }}
          >
            {BARE ? <BareRowContent row={row} /> : <OrderRowContent row={row} />}
          </li>
        )
      })}
    </ul>
  )
}

function FullOrderList() {
  const t0 = useRef(performance.now())
  useLayoutEffect(() => {
    const ms = (performance.now() - t0.current).toFixed(1)
    log(`orders: rendered ${N} rows with ${BARE ? 0 : N} sheets in ${ms}ms`)
  }, [])
  return (
    <ul className="orders">
      {ROWS.map((row) => (BARE ? <BareRow key={row.id} row={row} /> : <OrderRow key={row.id} row={row} />))}
    </ul>
  )
}

function RowContent({ row }: { row: (typeof ROWS)[number] }) {
  return (
    <span className="order" data-order={row.id}>
      <span className="avatar" style={{ ['--h' as string]: row.hue }}>{initials(row.name)}</span>
      <span className="order-main">
        <strong>{row.title}</strong>
        <span className="muted small">{row.name}</span>
      </span>
      <span className="order-side">
        <span>{row.amount}</span>
        <span className={`badge ${row.status.toLowerCase()}`}>{row.status}</span>
      </span>
    </span>
  )
}

const BareRow = memo(function BareRow({ row }: { row: (typeof ROWS)[number] }) {
  return (
    <li>
      <BareRowContent row={row} />
    </li>
  )
})

const BareRowContent = memo(function BareRowContent({ row }: { row: (typeof ROWS)[number] }) {
  return (
    <button className="ybs-trigger">
      <RowContent row={row} />
    </button>
  )
})

const OrderRow = memo(function OrderRow({ row }: { row: (typeof ROWS)[number] }) {
  return (
    <li>
      <OrderRowContent row={row} />
    </li>
  )
})

const OrderRowContent = memo(function OrderRowContent({ row }: { row: (typeof ROWS)[number] }) {
  return (
      <BottomSheet
        {...logged(`order-${row.id}`)}
        trigger={<RowContent row={row} />}
        detents={[]}
        title={row.title}
        description={`${row.name} · ${row.status}`}
      >
        <div className="pad">
          <dl className="info">
            <dt>Total</dt>
            <dd>{row.amount}</dd>
            <dt>Customer</dt>
            <dd>{row.name}</dd>
            <dt>Status</dt>
            <dd>{row.status}</dd>
          </dl>
          <div className="order-actions">
            <button className="primary">Track parcel</button>
            <button className="secondary">Contact support</button>
          </div>
        </div>
      </BottomSheet>
  )
})
