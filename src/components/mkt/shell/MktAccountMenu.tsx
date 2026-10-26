'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import s from './shell.module.css'

// The avatar's menu (Marketing's shell): who is signed in, then — for a login of one's own — Change password, Change
// email and My documents, then IT support and Sign out, which asks first. The windows are the portal's own
// (layout/AccountMenu.tsx).

export type MktAccountWindow = 'password' | 'email' | 'signout'

export default function MktAccountMenu({
  name,
  sub,
  personal,
  onWindow,
  onClose,
}: {
  name: string
  sub: string
  /** A login a People record names (its password, email and documents are its own). */
  personal: boolean
  onWindow: (w: MktAccountWindow) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const item = (w: MktAccountWindow, emoji: string, label: string) => (
    <button
      type="button"
      role="menuitem"
      className={s.menuItem}
      onClick={() => {
        onClose()
        onWindow(w)
      }}
    >
      <span aria-hidden="true">{emoji}</span>
      <span>{label}</span>
    </button>
  )
  return (
    <div className={s.menu} role="menu" aria-label="Account">
      <div className={s.menuHead}>
        <div className={s.menuName}>{name}</div>
        <div className={s.menuSub}>{sub}</div>
      </div>
      {personal ? (
        <>
          {item('password', '🔑', 'Change password')}
          {item('email', '✉️', 'Change email')}
          <Link href="/admin/documents" role="menuitem" className={s.menuItem} onClick={onClose}>
            <span aria-hidden="true">📄</span>
            <span>My documents</span>
          </Link>
        </>
      ) : null}
      <Link href="/it-support" role="menuitem" className={s.menuItem} onClick={onClose}>
        <span aria-hidden="true">🛟</span>
        <span>IT support</span>
      </Link>
      {item('signout', '↩︎', 'Sign out')}
    </div>
  )
}
