'use client'

import PopMenu, { type MenuAt } from './PopMenu'
import v2 from './v2.module.css'

// A built-in Product List column's head, right-clicked (v2 §5): Internal only — off the client's PDF, a 🔒 on its head —
// and Delete column (off every catalogue's grid). Item and Price are the client's always and required; Cost and Margin are
// internal always.

export type HeadLock = 'client' | 'internal' | null

export default function HeadMenu({ name, at, internal, lock, required, onClose, onInternal, onDelete }: {
  name: string
  at: MenuAt
  internal: boolean
  /** 'client': never internal (Item, Price); 'internal': always (Cost, Margin). */
  lock: HeadLock
  /** Item and Price: never deleted. */
  required: boolean
  onClose: () => void
  onInternal: () => void
  onDelete: () => void
}) {
  const on = lock === 'internal' ? true : lock === 'client' ? false : internal
  const hint = lock === 'internal' ? 'Always internal · cost is never shown' : lock === 'client' ? 'The client always sees this' : 'Not shown on the client’s PDF'
  return (
    <PopMenu at={at} width={248} label={`Column ${name}`} onClose={onClose}>
      <div className={v2.menuHead}><span className={v2.menuName}>{name}</span></div>
      <button type="button" role="menuitemcheckbox" aria-checked={on} disabled={!!lock} className={`${v2.menuRow} ${v2.menuRowTop}`} onClick={onInternal}>
        <span className={v2.menuTwo}><span>Internal only</span><span className={v2.menuHint}>{hint}</span></span>
        <span className={`${v2.switch}${on ? ` ${v2.switchOn}` : ''}${lock ? ` ${v2.switchLocked}` : ''}`} aria-hidden="true" />
      </button>
      <div className={v2.menuLine} />
      <button type="button" role="menuitem" disabled={required} className={`${v2.menuRow}${required ? '' : ` ${v2.menuDel}`}`} onClick={onDelete}>
        <span className={v2.grow}>Delete column</span>{required ? <span className={v2.menuHint}>Required</span> : null}
      </button>
    </PopMenu>
  )
}
