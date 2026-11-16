'use client'

import type { Product, ProductStatus } from '@/lib/marketing/products'
import PopMenu, { type MenuAt } from './PopMenu'
import v2 from './v2.module.css'

// A package's menu (v2 §2 — right-click on its card or its ⋯): its name and code; Status — Active, Draft, Retired, each
// with its dot, its hint and a ✓ on the one it is (Active on a package never published: "Publish first"); Open ↵,
// ⧉ Duplicate, Delete (every package — the dialog says what it does).

const HINT: Record<ProductStatus, string> = {
  active: 'Can be picked for new projects',
  draft: 'Hidden from quotations',
  retired: 'Running projects keep their version',
}
const DOT: Record<ProductStatus, string> = { active: v2.sdotActive, draft: v2.sdotDraft, retired: v2.sdotRetired }
const LABEL: Record<ProductStatus, string> = { active: 'Active', draft: 'Draft', retired: 'Retired' }

export default function PackageMenu({ p, at, fromButton, onClose, onStatus, onOpen, onDuplicate, onDelete }: {
  p: Product
  at: MenuAt
  fromButton: boolean
  onClose: () => void
  onStatus: (to: ProductStatus) => void
  onOpen: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <PopMenu at={at} width={232} label={p.name || p.code} onClose={onClose} alignRight={fromButton}>
      <div className={v2.menuHead}>
        <span className={v2.menuName}>{p.name.trim() || 'New package'}</span>
        <span className={v2.menuSub}>{p.code}</span>
      </div>
      <div className={v2.menuSect}>Status</div>
      {(['active', 'draft', 'retired'] as const).map(k => {
        const on = p.status === k
        const hint = k === 'active' && p.version === 0 ? 'Publish first' : HINT[k]
        return (
          <button key={k} type="button" role="menuitemradio" aria-checked={on} className={`${v2.menuRow} ${v2.menuRowTop}${on ? ` ${v2.menuOn}` : ''}`} onClick={() => onStatus(k)}>
            <span className={`${v2.sdot} ${DOT[k]}`} style={{ marginTop: 6 }} />
            <span className={v2.menuTwo}><span>{LABEL[k]}</span><span className={v2.menuHint}>{hint}</span></span>
            <span className={v2.menuTick}>{on ? '✓' : ''}</span>
          </button>
        )
      })}
      <div className={v2.menuLine} />
      <button type="button" role="menuitem" className={v2.menuRow} onClick={onOpen}><span className={v2.grow}>Open</span><span className={v2.menuKey}>↵</span></button>
      <button type="button" role="menuitem" className={v2.menuRow} onClick={onDuplicate}>⧉ Duplicate</button>
      <div className={v2.menuLine} />
      <button type="button" role="menuitem" className={`${v2.menuRow} ${v2.menuDel}`} onClick={onDelete}>Delete…</button>
    </PopMenu>
  )
}
