import Link from 'next/link'
import { cardHref, type PlateCard, type PlateColumn } from '@/lib/marketing/my-space'
import { tileCard } from '@/lib/marketing/task-tile'
import s from './myspace.module.css'

// A task tile of My Space's board (`My Space Bento.dc.html`; the Workflow Builder 2a handoff's step 3 —
// `Marketing Prototype.dc.html`): 👉 My turn — the viewer's to do, or a level waiting for them ("Needs your approval",
// an orange Review; red when overdue) — ⏳ Waiting on others ("{stage} · with {person}", Open), or Delegated by me. Its
// head counts them (red when anything in it is late). The whole card opens the task page. No Accept: a stage is its
// doer's as soon as it opens. Half the board wide or more, the cards go two abreast.

const TONE: Record<PlateCard['tone'], string> = { red: s.red, waiting: s.waitingTone, done: s.done, draft: s.draft }

export default function TaskTile({ column, wide }: { column: PlateColumn; wide: boolean }) {
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
          {column.cards.map(c => {
            const v = tileCard(c, column.key)
            const href = cardHref(c)
            // My turn's late card goes red; Waiting's stays calm (the prototype's grey).
            const calm = column.key === 'waiting'
            const tone = calm ? 'draft' : c.tone
            return (
              <div key={c.key} className={`${s.card}${tone === 'red' ? ` ${s.cardRed}` : ''}`}>
                <Link href={href} className={s.cardHit} aria-label={`Open ${c.title}`} />
                <span className={s.cardTitle} title={c.title}>{c.title}</span>
                <div className={s.meta}>
                  <span className={s.metaDot} style={{ background: c.sub?.dot ?? 'rgb(var(--mk-faint))' }} aria-hidden="true" />
                  <span className={s.metaText}>{v.meta}</span>
                </div>
                <div className={s.cardFoot}>
                  <span className={`${s.status} ${calm ? s.calm : TONE[tone]}`}>
                    <span className={s.statusDot} aria-hidden="true" />
                    {v.label}
                  </span>
                  <span className={s.grow} />
                  {v.act === 'review' ? (
                    <Link href={href} className={s.act}>Review</Link>
                  ) : v.act === 'open' ? (
                    <Link href={href} className={s.open}>Open</Link>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className={s.empty}>Nothing here right now</div>
      )}
    </div>
  )
}
