/**
 * Small drawings of each demo's sheet, for the overview cards: what shape the sheet takes (a peek over a map, a stack,
 * a page), rather than an emoji. Flat SVG in a 160x100 box; colours come from styles.css (`.pv-*`) so they follow the
 * theme and the card's hue (`--h`).
 */
import type { ReactNode } from 'react'

const W = 160
const H = 100

/** A sheet from `y` to the bottom (past it, so only the top corners show), or a floating card with all corners round. */
function Sheet({ y, inset = 0, bottom, className = 'pv-sheet', handle = true, children }: {
  y: number
  inset?: number
  /** Floating: the gap below the card. */
  bottom?: number
  className?: string
  handle?: boolean
  children?: ReactNode
}) {
  const h = bottom == null ? H - y + 10 : H - y - bottom
  return (
    <g>
      <rect className={`pv-shadow ${className}`} x={inset} y={y} width={W - inset * 2} height={h} rx={9} />
      {handle && <rect className="pv-handle" x={W / 2 - 8} y={y + 4} width={16} height={2.5} rx={1.25} />}
      {children}
    </g>
  )
}

/** A text line. */
const Line = ({ x, y, w, accent, h = 4 }: { x: number; y: number; w: number; accent?: boolean; h?: number }) => (
  <rect className={accent ? 'pv-accent' : 'pv-ink'} x={x} y={y} width={w} height={h} rx={h / 2} />
)

function Map() {
  return (
    <g>
      <rect className="pv-map" width={W} height={H} />
      <path className="pv-water" d="M95 100 C 105 70, 130 55, 160 50 V 100 Z" />
      <rect className="pv-park" x={16} y={52} width={42} height={22} rx={6} />
      <path className="pv-road" d="M-5 40 L 165 26 M 60 -5 L 72 105 M -5 78 L 165 88" />
    </g>
  )
}

const Photo = () => <rect className="pv-photo" width={W} height={H} />

const SCENES: Record<string, () => ReactNode> = {
  places: () => (
    <>
      <Map />
      <circle className="pv-pin" cx={80} cy={30} r={5} />
      <Sheet y={52} inset={6} bottom={6}>
        <Line x={16} y={63} w={60} />
        <Line x={16} y={71} w={40} h={3} />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} className="pv-fill" x={16 + i * 33} y={79} width={29} height={9} rx={3} />
        ))}
      </Sheet>
    </>
  ),
  floating: () => (
    <>
      <Map />
      <circle className="pv-pin" cx={44} cy={28} r={4} />
      <circle className="pv-pin" cx={112} cy={40} r={4} />
      <Sheet y={66} inset={8} bottom={8}>
        <rect className="pv-fill" x={16} y={74} width={128} height={11} rx={5.5} />
        <Line x={22} y={78} w={34} h={3} />
      </Sheet>
    </>
  ),
  comments: () => (
    <>
      <Photo />
      <Sheet y={14}>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <circle className="pv-fill" cx={18} cy={28 + i * 15} r={5} />
            <Line x={28} y={24 + i * 15} w={30 + ((i * 23) % 40)} h={3} />
            <Line x={28} y={30 + i * 15} w={60 + ((i * 31) % 50)} h={3} />
          </g>
        ))}
        <rect className="pv-fill" x={10} y={86} width={140} height={10} rx={5} />
      </Sheet>
    </>
  ),
  product: () => (
    <>
      <Photo />
      <ellipse className="pv-sheet" cx={80} cy={26} rx={22} ry={9} opacity={0.6} />
      <Sheet y={46}>
        <Line x={12} y={56} w={56} />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} className={i === 2 ? 'pv-accent' : 'pv-fill'} x={12 + i * 22} y={66} width={18} height={10} rx={3} />
        ))}
        <rect className="pv-accent" x={12} y={83} width={136} height={10} rx={4} />
      </Sheet>
    </>
  ),
  share: () => (
    <>
      <Photo />
      <Sheet y={36}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <circle key={i} className="pv-fill" cx={20 + i * 26} cy={56} r={8} />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} className="pv-fill" x={12 + i * 26} y={70} width={16} height={16} rx={4} />
        ))}
        <rect x={148} y={50} width={12} height={40} className="pv-fade" />
      </Sheet>
    </>
  ),
  lightbox: () => (
    <>
      <rect className="pv-black" width={W} height={H} />
      <rect className="pv-photo" x={34} y={16} width={92} height={70} rx={2} />
      <Line x={10} y={6} w={16} h={3} />
      <Line x={134} y={6} w={16} h={3} />
      <path className="pv-chev" d="M14 46 l-5 5 5 5 M146 46 l5 5 -5 5" />
    </>
  ),
  filters: () => (
    <>
      <rect className="pv-map" width={W} height={H} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} className="pv-photo" x={8 + i * 37} y={8} width={33} height={24} rx={3} />
      ))}
      <Sheet y={30}>
        <Line x={12} y={42} w={40} />
        <rect className="pv-accent" x={128} y={40} width={20} height={9} rx={4.5} />
        <rect className="pv-fill" x={12} y={58} width={136} height={3} rx={1.5} />
        <rect className="pv-accent" x={40} y={58} width={70} height={3} rx={1.5} />
        <circle className="pv-sheet pv-knob" cx={40} cy={59.5} r={4.5} />
        <circle className="pv-sheet pv-knob" cx={110} cy={59.5} r={4.5} />
        {[0, 1, 2].map((i) => (
          <rect key={i} className="pv-fill" x={12 + i * 30} y={68} width={26} height={8} rx={4} />
        ))}
        <rect className="pv-accent" x={12} y={84} width={136} height={10} rx={4} />
      </Sheet>
    </>
  ),
  playlist: () => (
    <>
      <Photo />
      <Sheet y={22} className="pv-custom" handle={false}>
        <rect className="pv-photo" x={14} y={32} width={30} height={30} rx={4} />
        <Line x={52} y={38} w={50} />
        <Line x={52} y={47} w={30} h={3} />
        {[0, 1].map((i) => (
          <Line key={i} x={14} y={72 + i * 9} w={100 - i * 24} h={3} />
        ))}
        <rect className="pv-pill" x={56} y={10} width={48} height={7} rx={3.5} />
      </Sheet>
    </>
  ),
  settings: () => (
    <>
      <rect className="pv-black" width={W} height={H} />
      <Sheet y={12} inset={14} className="pv-sheet pv-dim" />
      <Sheet y={24} inset={4}>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect className="pv-accent" x={12} y={36 + i * 15} width={9} height={9} rx={2.5} />
            <Line x={26} y={38.5 + i * 15} w={40 + ((i * 17) % 30)} h={3.5} />
            <path className="pv-chev" d={`M144 ${37.5 + i * 15} l3 3 -3 3`} />
          </g>
        ))}
      </Sheet>
    </>
  ),
  thousand: () => (
    <>
      <rect className="pv-map" width={W} height={H} />
      {Array.from({ length: 7 }, (_, i) => (
        <g key={i}>
          <circle className="pv-fill" cx={14} cy={9 + i * 13} r={4} />
          <Line x={24} y={7.5 + i * 13} w={50 + ((i * 29) % 60)} h={3} />
        </g>
      ))}
      <Sheet y={56}>
        <Line x={12} y={66} w={48} />
        <Line x={12} y={76} w={110} h={3} />
        <Line x={12} y={84} w={90} h={3} />
      </Sheet>
    </>
  ),
  persistent: () => (
    <>
      <rect className="pv-map" width={W} height={H} />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} className="pv-fill" x={38 + (i % 4) * 22} y={6 + Math.floor(i / 4) * 22} width={18} height={18} rx={3} />
      ))}
      <Sheet y={76}>
        <Line x={12} y={86} w={50} />
        <rect className="pv-accent" x={118} y={84} width={30} height={8} rx={4} />
      </Sheet>
    </>
  ),
  notes: () => (
    <>
      <rect className="pv-black" width={W} height={H} />
      <rect className="pv-map pv-dim" x={10} y={6} width={140} height={100} rx={8} />
      <Sheet y={14} handle={false}>
        <Line x={10} y={22} w={20} h={3} accent />
        <Line x={66} y={22} w={28} h={3} />
        <Line x={132} y={22} w={18} h={3} accent />
        <Line x={10} y={36} w={70} h={5} />
        {[0, 1, 2, 3].map((i) => (
          <Line key={i} x={10} y={48 + i * 8} w={140 - ((i * 37) % 60)} h={3} />
        ))}
      </Sheet>
    </>
  ),
  assistant: () => (
    <>
      <rect className="pv-map" width={W} height={H} />
      <rect className="pv-accent pv-dim" x={20} y={8} width={120} height={26} rx={5} />
      <Line x={20} y={40} w={80} />
      <Line x={20} y={48} w={56} h={3} />
      <Sheet y={64}>
        <Line x={12} y={73} w={64} />
        <Line x={12} y={80} w={28} h={3} />
        <rect className="pv-ink pv-dim" x={12} y={87} width={112} height={9} rx={4.5} />
        <Line x={130} y={90} w={18} h={3} accent />
      </Sheet>
    </>
  ),
  'soft-edge': () => (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} className="pv-accent" opacity={0.35 + (i % 3) * 0.2} x={8 + (i % 3) * 50} y={6 + Math.floor(i / 3) * 24} width={44} height={20} rx={5} />
      ))}
      <Sheet y={50}>
        <Line x={12} y={60} w={50} />
        {[0, 1, 2].map((i) => (
          <Line key={i} x={12} y={70 + i * 8} w={110 - i * 20} h={3} />
        ))}
      </Sheet>
    </>
  ),
  confirm: () => (
    <>
      <rect className="pv-map" width={W} height={H} />
      {[0, 1, 2, 3].map((i) => (
        <Line key={i} x={12} y={10 + i * 11} w={60 + ((i * 31) % 50)} h={3} />
      ))}
      <Sheet y={56}>
        <Line x={12} y={66} w={70} />
        <Line x={12} y={75} w={96} h={3} />
        <rect className="pv-ink pv-dim" x={70} y={84} width={36} height={10} rx={5} />
        <rect className="pv-accent" x={112} y={84} width={36} height={10} rx={5} />
      </Sheet>
    </>
  ),
  lab: () => (
    <>
      <rect className="pv-map" width={W} height={H} />
      <path className="pv-dash" d="M0 26 H160 M0 54 H160" />
      <Sheet y={54}>
        {[0, 1, 2].map((i) => (
          <Line key={i} x={12} y={66 + i * 9} w={120 - i * 26} h={3} />
        ))}
      </Sheet>
    </>
  ),
}

export function Preview({ id, className }: { id: string; className?: string }) {
  const Scene = SCENES[id]
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
      {Scene ? <Scene /> : null}
    </svg>
  )
}
