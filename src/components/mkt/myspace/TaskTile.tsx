import Link from 'next/link'
import { cardHref, cardMeta, type PlateCard, type PlateColumn } from '@/lib/marketing/my-space'
import AcceptButton from './AcceptButton'
import s from './myspace.module.css'

// A task tile of My Space's board (`My Space Bento.dc.html`): My turn, Waiting on others or Delegated by me — its head
// with the count (red when anything in it is late), its cards, or "Nothing here right now". Half the board wide or more,
// the cards go two abreast.

const TONE: Record<PlateCard['tone'], string> = { red: s.red, waiting: s.waitingTone, done: s.done, draft: s.draft }

export default function TaskTile({ column, wide, canAccept }: { column: PlateColumn; wide: boolean; canAccept: boolean }) {
  const red = column.anyRed
  return (
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
