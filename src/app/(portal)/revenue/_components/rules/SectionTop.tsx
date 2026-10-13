import type { ReactNode } from 'react'
import s from './rules.module.css'

/**
 * A Rules section's top (2026-10-10, the HR revamp): the 20px title and its
 * action. The one line under the title went on 2026-10-12 (the user: the
 * descriptions made the view too messy).
 */
export function SectionTop({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className={s.secHead}>
      <span className={s.secTitle}>{title}</span>
      {action}
    </div>
  )
}
