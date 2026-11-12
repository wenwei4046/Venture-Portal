import type { BannerAction, BannerView } from '@/lib/marketing/task-flow-view'
import s from './taskflow.module.css'

// The role banner (Task Flow.dc.html): one per viewer — the doer's Submit, the approver's Request changes / Approve, the
// manager's Reassign / Nudge, the next person's "You're up next", the finished, the done (green, Replay celebration).
// Its colours change in .2s.

const TONE = { me: s.bMe, late: s.bLate, calm: s.bCalm, done: s.bDone }

export default function TaskFlowBanner({ view, busy, onAction }: { view: BannerView; busy: boolean; onAction: (a: BannerAction) => void }) {
  return (
    <div className={`${s.banner} ${TONE[view.tone]}`} data-testid="tf-banner">
      <span className={s.bIcon} aria-hidden="true">{view.icon}</span>
      <div className={s.bBody}>
        <span className={s.bTitle}>{view.title}</span>
        <span className={s.bText}>{view.text}</span>
      </div>
      {view.actions.map(a => (
        <button key={a.key} type="button" className={`${s.btn}${a.primary ? ` ${s.btnPrimary}` : ''}`} disabled={busy && a.key !== 'replay'} onClick={() => onAction(a.key)}>
          {a.label}
        </button>
      ))}
    </div>
  )
}
