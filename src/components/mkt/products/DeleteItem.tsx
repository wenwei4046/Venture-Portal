'use client'

import type { CatalogItem } from '@/lib/marketing/catalog'
import Modal from './Modal'
import v2 from './v2.module.css'

// Delete item (v2 §5): every item may go. It leaves products' drafts and draft quotations; versions published and
// quotations sent or accepted keep it — the client has seen it.

const list = (nos: string[]) => (nos.length > 3 ? `${nos.slice(0, 3).join(', ')} +${nos.length - 3}` : nos.join(', '))

export default function DeleteItem({ item, impact, busy, onKeep, onDelete }: {
  item: CatalogItem
  impact: { products: number; drafts: string[]; kept: string[] }
  busy: boolean
  onKeep: () => void
  onDelete: () => void
}) {
  const name = item.name.trim() || 'this item'
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`
  return (
    <Modal label={`Delete ${name}`} onClose={onKeep} busy={busy}>
      <div className={v2.modalHead}><span className={v2.modalTitle}>Delete “{name}”?</span></div>
      <div className={v2.modalBody}>
        <span className={v2.effect}><span className={`${v2.mark} ${v2.markMinus}`}>−</span>Removed from {n(impact.products, 'package')} (drafts; published versions keep it)</span>
        <span className={v2.effect}><span className={`${v2.mark} ${v2.markMinus}`}>−</span>Removed from {n(impact.drafts.length, 'draft quotation')}{impact.drafts.length ? ` · ${list(impact.drafts)}` : ''}</span>
        <span className={v2.effect}><span className={`${v2.mark} ${v2.markKeep}`}>✓</span>Kept in {n(impact.kept.length, 'sent / accepted quotation')}{impact.kept.length ? ` · ${list(impact.kept)} — the client has seen it` : ''}</span>
      </div>
      <div className={v2.modalFoot}>
        <span className={v2.grow} />
        <button type="button" className={v2.ghost} disabled={busy} onClick={onKeep}>Keep</button>
        <button type="button" className={v2.redFill} disabled={busy} onClick={onDelete}>Delete item</button>
      </div>
    </Modal>
  )
}
