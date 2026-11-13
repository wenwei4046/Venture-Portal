import type { ReactNode } from 'react'
import type { PicView } from '@/lib/marketing/task-flow-view'
import Tip from '../ui/Tip'
import s from './taskflow.module.css'

// The PIC's link view (Task Flow.dc.html › isPic): a simpler page, at most 720px on the soft background — the status
// card in the stage's PIC words (its answer when the PIC is a pending approver), the steps and "Expected by", and only
// the 👁 sections, fields and table columns ("Coming soon" where empty). No staff names, no prices. What the link shows and
// whom to ask is a tooltip on its sub line (the user, 2026-11-13), not a footer.

export default function TaskFlowPic({ view, title, sub, answer }: {
  view: PicView
  title: string
  /** "Houzs Marketing · tracking link for 2990 Home". */
  sub: string
  /** The answer's buttons (Approve / Request changes) or its form — shown while the PIC is a pending approver. */
  answer?: ReactNode
}) {
  return (
    <div className={`mkt-shell ${s.pic}`}>
      <div className={s.picIn}>
        <div className={s.picTop}>
          <span className={s.picLogo} aria-hidden="true">H</span>
          <div className={s.picTopText}>
            <Tip text="You see team names only. Questions? Reply to the WhatsApp message with this link."><span className={s.picSub} tabIndex={0}>{sub}</span></Tip>
            <span className={s.picTitle}>{title}</span>
          </div>
        </div>
        <div className={`${s.picStatus} ${view.tone === 'done' ? s.picDone : view.tone === 'wait' ? s.picWait : s.picCalm}`} data-testid="pic-status">
          <span className={s.picIcon} aria-hidden="true">{view.icon}</span>
          <div className={s.picStatusBody}>
            <span className={s.picStatusTitle}>{view.title}</span>
            <span className={s.picStatusText}>{view.text}</span>
          </div>
          {view.answer ? answer : null}
        </div>
        <div className={s.picCard}>
          <div className={s.picSteps}>
            {view.steps.map((p, i) => (
              <div key={i} className={s.picStep}>
                <span className={`${s.picBar}${p.state === 'done' ? ` ${s.picBarDone}` : p.state === 'cur' ? ` ${s.picBarCur}` : ''}`} />
                <span className={`${s.picStepName}${p.state === 'cur' ? ` ${s.picStepCur}` : ''}`}>{p.name}</span>
              </div>
            ))}
          </div>
          <span className={s.picEta}>{view.eta}</span>
        </div>
        {view.secs.map(x => (
          <div key={x.id} className={s.picSec}>
            <div className={s.picSecHead}><span aria-hidden="true">{x.emoji}</span><span className={s.secTitle}>{x.title}</span></div>
            {x.text ? <p className={s.picText}>{x.text}</p> : null}
            {x.table ? (
              <div className={`${s.tblScroll} ${s.picTblTop}`}>
                <div className={s.grid} style={{ gridTemplateColumns: `repeat(${Math.max(1, x.table.cols.length)}, minmax(0, 1fr))` }}>
                  {x.table.cols.map(c => <span key={c} className={s.picTh}>{c}</span>)}
                  {x.table.cells.flatMap((row, ri) => row.map((c, ci) => (
                    <span key={`${ri}-${ci}`} className={`${s.picTd}${c.filled ? '' : ` ${s.picSoon}`}`}>{c.text}</span>
                  )))}
                </div>
              </div>
            ) : null}
            {x.fields.map(f => (
              <div key={f.name} className={s.picRow}>
                <span className={s.picK}>{f.name}</span>
                <span className={`${s.picV}${f.filled ? '' : ` ${s.picSoon}`}`}>{f.text}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
