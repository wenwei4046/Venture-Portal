import type { ReactNode } from 'react'
import { HrIcon, type HrIconName } from '@/components/hrv/icons'
import s from './person-well.module.css'

/**
 * A well of a person's page (2026-10-16, the 360 — the user's option C, its
 * words their reference's): its title in spaced capitals beside its icon, a
 * quiet count at the end. The record's six wells, Promotion · Employment,
 * Permissions and Activity are all one.
 */
export default function PersonWell({
  title,
  icon,
  count,
  children,
}: {
  title: string
  icon: HrIconName
  count?: string
  children: ReactNode
}) {
  return (
    <section className={s.well}>
      <h2 className={s.title}>
        <span className={s.icon} aria-hidden>
          <HrIcon name={icon} size={15} stroke={1.6} />
        </span>
        {title}
        {count ? <span className={s.count}>{count}</span> : null}
      </h2>
      {children}
    </section>
  )
}
