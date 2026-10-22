import Link from 'next/link'
import { cardHref, cardMeta, type PlateCard, type PlateColumn, type WeekRow } from '@/lib/marketing/my-space'
import type { MktNotice } from '@/lib/marketing/shell'
import AcceptButton from './AcceptButton'
import s from './myspace.module.css'

// My Space (`My Space.dc.html` → `My Space Bento.dc.html`): the viewer's cover, name and role, the greeting with what
// is on their plate, and the board's task tiles — My turn (two cards abreast), Waiting on others, Delegated by me and
// This week. Above it, an Assignment plan that put them on a project, while it is unread.

const TONE: Record<PlateCard['tone'], string> = { red: s.red, waiting: s.waitingTone, done: s.done, draft: s.draft }

export interface MySpaceProps {
  name: string
  role: string | null
  letter: string
  avatarBg: string
  greeting: string
  first: string
  plateLine: string
  columns: PlateColumn[]
  week: WeekRow[]
  plans: MktNotice[]
  /** Marketing · Edit: a stage to accept is accepted on its tile. */
  canAccept: boolean
}

export default function MySpace(p: MySpaceProps) {
  const col = (key: PlateColumn['key']) => p.columns.find(c => c.key === key) as PlateColumn
  return (
    <div className={s.page}>
      {p.plans.map(n => (
        <Link key={n.id} href={n.ref ? `/marketing/projects/${n.ref}` : '/marketing/projects'} className={s.plan}>
          <span className={s.planIcon} aria-hidden="true">📋</span>
          <span className={s.planKicker}>Assignment plan</span>
          <span>{n.title}</span>
        </Link>
      ))}
      <div className={s.space}>
        <div className={s.cover}>
          <div className={s.avatar} style={{ background: p.avatarBg }} aria-hidden="true">{p.letter}</div>
        </div>
        <div className={s.who}>
          <div className={s.name}>
            {p.name} {p.role ? <span className={s.role}>· {p.role}</span> : null}
          </div>
        </div>
        <div className={s.greet}>
          {p.greeting}, {p.first} ☀️ <span className={s.greetRest}>— {p.plateLine}</span>
        </div>
        <div className={s.board}>
          <Tasks column={col('turn')} wide className={s.turn} canAccept={p.canAccept} />
          <Tasks column={col('waiting')} className={s.waiting} canAccept={p.canAccept} />
          <Tasks column={col('delegated')} className={s.delegated} canAccept={p.canAccept} />
          <div className={`${s.tile} ${s.week}`}>
            <div className={s.weekTile}>
              <div className={s.weekHead}>🗓️ This week</div>
              {p.week.length ? (
                p.week.map(w => (
                  <Link key={w.key} href={cardHref(w)} className={s.weekRow}>
                    <span className={`${s.weekWhen}${w.red ? ` ${s.weekWhenRed}` : ''}`}>{w.when}</span>
                    <span className={s.weekTitle}>{w.title}</span>
                  </Link>
                ))
              ) : (
                <div className={s.weekNone}>No due dates this week</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Tasks({ column, wide = false, className, canAccept }: { column: PlateColumn; wide?: boolean; className: string; canAccept: boolean }) {
  const red = column.anyRed
  return (
    <div className={`${s.tile} ${className}${column.key === 'waiting' && red ? ` ${s.tileRed}` : ''}`}>
      <div className={s.tasks}>
        <div className={s.tileHead}>
          <span className={s.tileEmoji} aria-hidden="true">{column.emoji}</span>
          <span className={s.tileTitle}>{column.title}</span>
          <span className={`${s.count}${red ? ` ${s.countRed}` : ''}`}>{column.cards.length}</span>
        </div>
        {column.cards.length ? (
          <div className={`${s.cards}${wide ? ` ${s.cards2}` : ''}`}>
            {column.cards.map(c => (
              <Card key={c.key} c={c} canAccept={canAccept} />
            ))}
          </div>
        ) : (
          <div className={s.empty}>Nothing here right now</div>
        )}
      </div>
    </div>
  )
}

function Card({ c, canAccept }: { c: PlateCard; canAccept: boolean }) {
  const href = cardHref(c)
  return (
    <div className={`${s.card}${c.tone === 'red' ? ` ${s.cardRed}` : c.isNew ? ` ${s.cardNew}` : ''}`}>
      <Link href={href} className={s.cardTitle} title={c.title}>
        {c.title}
      </Link>
      <div className={s.meta}>
        <span className={s.metaDot} style={{ background: c.sub?.dot ?? 'rgb(var(--mk-faint))' }} aria-hidden="true" />
        <span className={s.metaText}>{cardMeta(c)}</span>
      </div>
      <div className={s.cardFoot}>
        <span className={`${s.status} ${TONE[c.tone]}`}>
          <span className={s.statusDot} aria-hidden="true" />
          {c.label}
        </span>
        <span className={s.grow} />
        {c.action === 'accept' ? (
          canAccept ? <AcceptButton project={c.projectId} href={href} /> : <Link href={href} className={s.act}>Accept</Link>
        ) : c.action === 'review' ? (
          <Link href={href} className={s.act}>Review</Link>
        ) : c.action === 'open' ? (
          <Link href={href} className={s.open}>Open</Link>
        ) : null}
      </div>
    </div>
  )
}
