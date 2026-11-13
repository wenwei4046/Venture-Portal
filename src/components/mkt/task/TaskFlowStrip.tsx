import type { StripCard } from '@/lib/marketing/task-flow-view'
import Tip from '../ui/Tip'
import TaskFlowAvatar from './TaskFlowAvatar'
import s from './taskflow.module.css'

// The compact workflow strip (Task Flow.dc.html): a card a stage (min 118px, a 3px top bar — green done, orange the stage
// now, red late), ✓ or its number, its name, YOU, who has it, a mini value; joined by 12px lines. A click focuses a stage
// (ink border, soft shadow) — what a click does is a tooltip on the card (the user, 2026-11-13), not a line on the page.

const MINI = { ok: s.miniOk, red: s.miniRed, ink: s.miniInk, muted: s.miniMuted }

export default function TaskFlowStrip({ cards, doneCount, meta, onFocus }: { cards: StripCard[]; doneCount: number; meta: string; onFocus: (i: number) => void }) {
  return (
    <div className={s.stripWrap}>
      <div className={s.stripHead}>
        <span className={s.label}>Workflow · {doneCount} of {cards.length} done</span>
        <span className={s.grow} />
        {meta ? <span className={s.stripMeta}>{meta}</span> : null}
      </div>
      <div className={s.strip} role="list">
        {cards.map((c, i) => {
          const state = c.state === 'done' ? s.cardDone : c.late ? s.cardLate : c.state === 'cur' ? s.cardCur : ''
          const bar = c.state === 'done' ? s.barDone : c.late ? s.barLate : c.state === 'cur' ? s.barCur : ''
          return (
            <div key={c.idx} className={s.slot} role="listitem">
              <Tip text="Click a stage to see it">
              <button type="button" className={`${s.card} ${state}${c.focused ? ` ${s.cardFocus}` : ''}`} aria-pressed={c.focused}
                aria-label={`Stage ${c.idx + 1} · ${c.name}`} onClick={() => onFocus(c.idx)}>
                <div className={`${s.bar} ${bar}`} />
                <div className={s.cardBody}>
                  <div className={s.cardRow}>
                    <span className={`${s.num}${c.state === 'done' ? ` ${s.numDone}` : c.state === 'cur' ? ` ${s.numCur}` : ''}`}>{c.mark}</span>
                    <span className={s.cardName}>{c.name}</span>
                    {c.you ? <span className={s.you}>YOU</span> : null}
                  </div>
                  <div className={s.cardRow}>
                    <TaskFlowAvatar init={c.init} hue={c.hue} size={18} open={c.open} />
                    <span className={s.cardWho}>{c.who}</span>
                    <span className={`${s.mini} ${MINI[c.miniTone]}`}>{c.mini}</span>
                  </div>
                </div>
              </button>
              </Tip>
              {i < cards.length - 1 ? (
                <div className={s.link} aria-hidden="true"><span className={`${s.linkLine}${c.linkDone ? ` ${s.linkDone}` : ''}`} /></div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
