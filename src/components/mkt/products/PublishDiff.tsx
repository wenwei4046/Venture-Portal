'use client'

import type { DiffMoney, ProductDiff } from '@/lib/marketing/products'
import { rm } from '@/lib/marketing/quotes'
import Lock from './Lock'
import Modal from './Modal'
import v2 from './v2.module.css'

// Publish v(n+1) (v2 §3 › Publish diff dialog): the draft against the version last published — each item's quantity
// before → after, tagged Added / Removed / Qty; List price, Internal cost and Margin before → after, the new one green when
// it improved and red when it got worse. Nothing different: said, and Publish stays off (as before).

const TAG: Record<'added' | 'removed' | 'qty', [string, string]> = {
  added: ['Added', v2.tagAdded],
  removed: ['Removed', v2.tagRemoved],
  qty: ['Qty', v2.tagQty],
}

function Money({ m, pct = false }: { m: DiffMoney; pct?: boolean }) {
  const show = (v: number | null) => (v == null ? '—' : pct ? `${v}%` : rm(v))
  const tone = m.better == null ? '' : m.better ? v2.green : v2.red
  return (
    <>
      <span className={`${v2.mono} ${v2.dR} ${v2.muted}`}>{show(m.from)}</span>
      <span className={`${v2.dArrow}`}>→</span>
      <span className={`${v2.mono} ${v2.dR} ${tone}`} style={{ fontWeight: 600 }}>{show(m.to)}</span>
    </>
  )
}

export default function PublishDiff({ diff, recurring, busy, onCancel, onPublish }: {
  diff: ProductDiff
  recurring: boolean
  busy: boolean
  onCancel: () => void
  onPublish: () => void
}) {
  const from = diff.from ? `v${diff.from}` : 'Nothing'
  return (
    <Modal label={`Publish v${diff.to}`} width={520} onClose={onCancel} busy={busy}>
      <div className={v2.modalHead}>
        <span className={v2.modalTitle}>Publish v{diff.to}</span>
        <span className={v2.chip}>{diff.from ? `v${diff.from} → v${diff.to}` : `v${diff.to}`}</span>
        <button type="button" className={v2.x} aria-label="Close" disabled={busy} onClick={onCancel}>×</button>
      </div>
      <div className={v2.modalBody}>
        {diff.same ? <span className={v2.diffSame}>Nothing has changed since v{diff.from}.</span> : null}
        <div className={v2.dTable} role="table" aria-label="Items">
          <div className={`${v2.dRow} ${v2.dHead}`} role="row"><span>Item</span><span className={v2.dR}>{from}</span><span /><span className={v2.dR}>v{diff.to}</span></div>
          {diff.items.map(it => (
            <div key={it.name} className={v2.dRow} role="row">
              <span className={v2.dName}>
                <span className={v2.dNameText}>{it.name}</span>
                {it.tag ? <span className={`${v2.tag} ${TAG[it.tag][1]}`}>{TAG[it.tag][0]}</span> : null}
              </span>
              <span className={`${v2.mono} ${v2.dR} ${v2.muted}`}>{it.from ?? '—'}</span>
              <span className={v2.dArrow}>→</span>
              <span className={`${v2.mono} ${v2.dR}`} style={{ fontWeight: 600 }}>{it.to ?? '—'}</span>
            </div>
          ))}
          {diff.items.length === 0 ? <div className={v2.dRow}><span className={v2.muted}>No items</span></div> : null}
        </div>
        <div className={v2.dTable} role="table" aria-label="Pricing">
          <div className={`${v2.dRow} ${v2.dHead}`} role="row"><span>Pricing <Lock /></span><span className={v2.dR}>{from}</span><span /><span className={v2.dR}>v{diff.to}</span></div>
          <div className={v2.dRow} role="row"><span>List price{recurring ? ' / month' : ''}</span><Money m={diff.price} /></div>
          <div className={v2.dRow} role="row"><span>Internal cost</span><Money m={diff.cost} /></div>
          <div className={v2.dRow} role="row"><span>Margin</span><Money m={diff.margin} pct /></div>
        </div>
      </div>
      <div className={v2.modalFoot}>
        <span className={v2.grow} />
        <button type="button" className={v2.ghost} disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className={v2.primary} disabled={busy || diff.same} onClick={onPublish}>Publish v{diff.to}</button>
      </div>
    </Modal>
  )
}
