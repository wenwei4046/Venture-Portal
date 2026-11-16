'use client'

import { includedText, margin, type Product, type ProductStatus } from '@/lib/marketing/products'
import { dmy, rm } from '@/lib/marketing/quotes'
import Lock from './Lock'
import v2 from './v2.module.css'

// A package's card (v2 §2): its status, its kind, ⋯; its name, CODE · vN, what it includes; List price 🔒 · Margin ·
// Running. A retired card is greyed and says how many projects still run on it.

export const STATUS_LABEL: Record<ProductStatus, string> = { draft: 'Draft', active: 'Active', retired: 'Retired' }
export const STATUS_PILL: Record<ProductStatus, string> = { draft: v2.pDraft, active: v2.pActive, retired: v2.pRetired }
export const MARGIN_LOW = 20
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

export function StatusPill({ status }: { status: ProductStatus }) {
  return <span className={`${v2.pill} ${STATUS_PILL[status]}`}><span className={v2.pdot} />{STATUS_LABEL[status]}</span>
}

/** "38%" green, red below 20%, "No cost" when there is none. */
export function MarginText({ price, cost }: { price: number | null; cost: number | null }) {
  const m = margin(price, cost)
  if (m == null) return <span className={v2.muted} style={{ fontWeight: 400 }}>No cost</span>
  return <span className={m < MARGIN_LOW ? v2.red : v2.green}>{m}%</span>
}

export default function PackageCard({ p, menuOn, onOpen, onMenu, onMore }: {
  p: Product
  menuOn: boolean
  onOpen: () => void
  onMenu: (e: React.MouseEvent) => void
  onMore: (e: React.MouseEvent) => void
}) {
  const included = p.groups.some(g => g.items.some(it => it.qty > 0 && it.name.trim()))
  return (
    <div
      role="button"
      tabIndex={0}
      className={`${v2.card}${p.status === 'retired' ? ` ${v2.cardRetired}` : ''}`}
      onClick={onOpen}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen() } }}
      onContextMenu={onMenu}
    >
      <span className={v2.cardTop}>
        <StatusPill status={p.status} />
        <span className={v2.cardKind}>{p.kind === 'recurring' ? 'Recurring monthly' : 'One-time project'}</span>
        <span className={v2.grow} />
        <button type="button" className={`${v2.more}${menuOn ? ` ${v2.moreOn}` : ''}`} aria-label={`More for ${p.name || p.code}`} aria-haspopup="menu"
          onClick={e => { e.stopPropagation(); onMore(e) }}>⋯</button>
      </span>
      <span className={v2.cardName}>{p.name.trim() || 'New package'}</span>
      <span className={v2.cardCode}>{p.code} · v{p.version || '—'}</span>
      <span className={v2.cardIncl}>{included ? includedText(p.groups) : 'Nothing added yet'}</span>
      <span className={v2.cardFoot}>
        <span className={v2.stat}>
          <span className={v2.statK}>List price <Lock /></span>
          <span className={v2.statPrice}>{p.price != null ? rm(p.price) : '—'}{p.kind === 'recurring' && p.price != null ? <span className={v2.per}>/mo</span> : null}</span>
        </span>
        <span className={v2.grow} />
        <span className={`${v2.stat} ${v2.statR}`}>
          <span className={v2.statK}>Margin</span>
          <span className={v2.statV}><MarginText price={p.price} cost={p.cost} /></span>
        </span>
        <span className={`${v2.stat} ${v2.statR}`}>
          <span className={v2.statK}>Running</span>
          <span className={v2.statV}>{p.live}</span>
        </span>
      </span>
      {p.status === 'retired' ? <span className={v2.cardNote}>Retired {dmy(p.retiredOn)} · {plural(p.live, 'project')} still on v{p.version}</span> : null}
    </div>
  )
}
