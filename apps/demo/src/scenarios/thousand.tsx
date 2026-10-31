import { memo, useLayoutEffect, useRef, useState } from 'react'
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
    <div className="pad">
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
const BARE = new URLSearchParams(location.search).get('bare') === '1'

function OrderList() {
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
      <button className="ybs-trigger">
        <RowContent row={row} />
      </button>
    </li>
  )
})

const OrderRow = memo(function OrderRow({ row }: { row: (typeof ROWS)[number] }) {
  return (
    <li>
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
    </li>
  )
})
