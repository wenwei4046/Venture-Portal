'use client'

import type { Product } from '@/lib/marketing/products'
import Modal from './Modal'
import v2 from './v2.module.css'

// Delete package (v2 §4): every package may go. One published is soft-deleted — off the Packages list and every
// picker, out of draft quotations; running projects and quotations sent or accepted keep its version. One never
// published: nothing else uses it.

export default function DeletePackage({ p, drafts, busy, onKeep, onDelete }: {
  p: Product
  /** Draft quotations it is on (they lose it). */
  drafts: number
  busy: boolean
  onKeep: () => void
  onDelete: () => void
}) {
  const name = p.name.trim() || p.code
  return (
    <Modal label={`Delete ${name}`} onClose={onKeep} busy={busy}>
      <div className={v2.modalHead}><span className={v2.modalTitle}>Delete “{name}”?</span></div>
      <div className={v2.modalBody}>
        {p.version > 0 ? (
          <>
            <span className={v2.effect}><span className={`${v2.mark} ${v2.markMinus}`}>−</span>Off the Packages list and can no longer be picked for quotations</span>
            <span className={v2.effect}><span className={`${v2.mark} ${v2.markMinus}`}>−</span>{drafts ? `Removed from ${drafts} draft quotation${drafts === 1 ? '' : 's'}` : 'Removed from draft quotations'}</span>
            <span className={v2.effect}><span className={`${v2.mark} ${v2.markKeep}`}>✓</span>{p.live} running project{p.live === 1 ? '' : 's'} and sent / accepted quotations keep v{p.version}</span>
          </>
        ) : (
          <span className={v2.effect}><span className={`${v2.mark} ${v2.markMinus}`}>−</span>Never published · nothing else uses it</span>
        )}
      </div>
      <div className={v2.modalFoot}>
        <span className={v2.grow} />
        <button type="button" className={v2.ghost} disabled={busy} onClick={onKeep}>Keep</button>
        <button type="button" className={v2.redFill} disabled={busy} onClick={onDelete}>Delete package</button>
      </div>
    </Modal>
  )
}
