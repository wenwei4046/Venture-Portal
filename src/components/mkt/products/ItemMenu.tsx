'use client'

import type { CatalogItem } from '@/lib/marketing/catalog'
import PopMenu, { type MenuAt } from './PopMenu'
import v2 from './v2.module.css'

// A Product List row's right-click (v2 §5): Internal only — a switch; on, the item is the team's alone (off the client's
// PDF, still counted in every sum) — and Delete item…, which opens its dialog.

export default function ItemMenu({ item, at, onClose, onInternal, onDelete }: {
  item: CatalogItem
  at: MenuAt
  onClose: () => void
  onInternal: () => void
  onDelete: () => void
}) {
  const name = item.name.trim() || 'Item'
  return (
    <PopMenu at={at} width={240} label={name} onClose={onClose}>
      <div className={v2.menuHead}><span className={v2.menuName}>{name}</span><span className={v2.menuSub}>{item.cat}</span></div>
      <button type="button" role="menuitemcheckbox" aria-checked={item.internal} className={`${v2.menuRow} ${v2.menuRowTop}`} onClick={onInternal}>
        <span className={v2.menuTwo}><span>Internal only</span><span className={v2.menuHint}>Not shown on the client’s PDF</span></span>
        <span className={`${v2.switch}${item.internal ? ` ${v2.switchOn}` : ''}`} aria-hidden="true" />
      </button>
      <div className={v2.menuLine} />
      <button type="button" role="menuitem" className={`${v2.menuRow} ${v2.menuDel}`} onClick={onDelete}>Delete item…</button>
    </PopMenu>
  )
}
