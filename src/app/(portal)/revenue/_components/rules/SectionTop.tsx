import type { ReactNode } from 'react'
import s from './rules.module.css'

/** A Rules section's top (2026-10-10, the HR revamp): the 20px title, its action, and its one line. */
export function SectionTop({ title, desc, action }: { title: string; desc: ReactNode; action?: ReactNode }) {
  return (
    <>
      <div className={s.secHead}>
        <span className={s.secTitle}>{title}</span>
        {action}
      </div>
      <p className={s.secDesc}>{desc}</p>
    </>
  )
}
