'use client'

import w from './workflows.module.css'

// The right-click (and long-press) menu, 210px, at the cursor and kept inside the board (the builder works out where).

export interface CtxItem {
  icon: string
  label: string
  onClick: () => void
  red?: boolean
  disabled?: boolean
  /** A line above it (the destructive item). */
  sep?: boolean
}

export default function CtxMenu({ x, y, title, items }: { x: number; y: number; title: string; items: CtxItem[] }) {
  return (
    <div className={w.ctx} style={{ left: x, top: y }} role="menu" aria-label={title} onClick={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
      <span className={w.ctxTitle}>{title}</span>
      {items.map(m => (
        <button
          key={m.label}
          type="button"
          role="menuitem"
          disabled={m.disabled}
          className={`${w.ctxItem}${m.red ? ` ${w.ctxRed}` : ''}${m.sep ? ` ${w.ctxSep}` : ''}`}
          onClick={m.onClick}
        >
          <span className={w.ctxIcon}>{m.icon}</span>
          {m.label}
        </button>
      ))}
    </div>
  )
}
