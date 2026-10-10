'use client'

import { useState, type ReactNode } from 'react'
import { Chevron } from '@/components/hrv/icons'
import s from './documentation.module.css'

/**
 * Documentation's two switchers (README §10 — Letters' "Letter type", Publish's
 * "Type"): a bordered button with its small key word, the value and a chevron
 * that turns over (.2s); under it a menu of rows (each its own: count,
 * Compulsory, ×) and, at its foot, a field to add one. A press outside or Esc
 * closes it.
 */
export default function SwitchMenu({
  keyWord,
  value,
  minWidth,
  menuWidth,
  children,
  addPlaceholder,
  onAdd,
  closeOnAdd = false,
  label,
}: {
  keyWord: string
  value: string
  minWidth: number
  menuWidth: number
  /** The rows; `close` shuts the menu after a pick. */
  children: (close: () => void) => ReactNode
  /** Left out when the viewer may not add. */
  addPlaceholder?: string
  onAdd?: (name: string) => Promise<boolean> | boolean
  /** Publish's Type closes once one is added; Letters' stays open on the new one. */
  closeOnAdd?: boolean
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const close = () => setOpen(false)

  async function add() {
    const name = draft.trim()
    if (!name || !onAdd) return
    if (await onAdd(name)) {
      setDraft('')
      if (closeOnAdd) close()
    }
  }

  return (
    <div className={s.switch}>
      <button
        type="button"
        className={s.switchBtn}
        style={{ minWidth, boxSizing: 'content-box' }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${label}: ${value}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className={s.switchKey}>{keyWord}</span>
        <span className={s.switchVal}>{value}</span>
        <span className={s.switchChev} aria-hidden="true">
          <Chevron />
        </span>
      </button>
      {open ? (
        <>
          <div className={s.menuScrim} onClick={close} aria-hidden="true" />
          <div
            className={s.menu}
            style={{ width: menuWidth }}
            role="menu"
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                close()
              }
            }}
          >
            <div className={s.menuList} style={{ maxHeight: menuWidth > 320 ? 300 : 260 }}>{children(close)}</div>
            {addPlaceholder && onAdd ? (
              <div className={s.menuAdd}>
                <input
                  className={s.menuInput}
                  value={draft}
                  placeholder={addPlaceholder}
                  maxLength={80}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void add()
                    if (e.key === 'Escape') close()
                  }}
                />
                <button type="button" className={s.addBtn} onClick={() => void add()}>+ Add</button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
