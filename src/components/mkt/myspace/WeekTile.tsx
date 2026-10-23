import Link from 'next/link'
import { cardHref, type WeekRow } from '@/lib/marketing/my-space'
import s from './myspace.module.css'

/** My Space's This week tile: the dates on the viewer's plate, soonest first (red when late). */
export default function WeekTile({ week }: { week: WeekRow[] }) {
  return (
    <div className={s.weekTile}>
      <div className={s.weekHead}>🗓️ This week</div>
      {week.length ? (
        week.map(w => (
          <Link key={w.key} href={cardHref(w)} className={s.weekRow}>
            <span className={`${s.weekWhen}${w.red ? ` ${s.weekWhenRed}` : ''}`}>{w.when}</span>
            <span className={s.weekTitle}>{w.title}</span>
          </Link>
        ))
      ) : (
        <div className={s.weekNone}>No due dates this week</div>
      )}
    </div>
  )
}
