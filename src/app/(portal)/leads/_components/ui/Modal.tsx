'use client'

import type { ReactNode } from 'react'
import u from './ui.module.css'

/**
 * The handoff's modal (README §6.4): centred, radius 16, padding 22, Georgia 19 title, the backdrop closes it. The
 * footer is the caller's (right-aligned ghost Cancel + the primary, disabled until the required fields are valid).
 */
export default function Modal({ open, onClose, title, width = 480, children, foot }: {
  open: boolean
  onClose: () => void
  title: ReactNode
  width?: number
  children: ReactNode
  foot?: ReactNode
}) {
  if (!open) return null
  return (
    <>
      <div className={u.backdrop} onClick={onClose} aria-hidden="true" />
      <div className={u.modal} role="dialog" aria-modal="true" style={{ width }}>
        <h2 className={u.modalTitle}>{title}</h2>
        {children}
        {foot ? <div className={u.modalFoot}>{foot}</div> : null}
      </div>
    </>
  )
}
