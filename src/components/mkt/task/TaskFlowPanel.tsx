import type { PanelView } from '@/lib/marketing/task-flow-view'
import TaskFlowAvatar from './TaskFlowAvatar'
import s from './taskflow.module.css'

// The focused stage's panel (Task Flow.dc.html): Stage n of N and its name, who (avatar and role), the time (Took / In
// stage / Planned), the due (On time / {n}d late / Expected by), the approval levels ("L1 · all Rachel ✓ Daniel …"),
// and the manager's ⇄ Reassign.

const DUE = { ok: s.toneOk, red: s.toneRed, ink: '' }
const GATE = { passed: s.gatePassed, active: s.gateActive, later: '' }
const PERSON = { ok: s.gatePOk, wait: s.gatePWait, plain: '' }

export default function TaskFlowPanel({ view, total, onReassign }: { view: PanelView; total: number; onReassign: () => void }) {
  return (
    <div className={`${s.panel}${view.line === 'cur' ? ` ${s.panelCur}` : view.line === 'late' ? ` ${s.panelLate}` : ''}`} data-testid="tf-panel">
      <div className={s.pCol}>
        <span className={s.pK}>Stage {view.n} of {total}</span>
        <span className={s.pName}>{view.name}</span>
      </div>
      <div className={s.pWho}>
        <TaskFlowAvatar init={view.init} hue={view.hue} size={26} open={view.open} />
        <div className={s.pCol}>
          <span className={s.pWhoName}>{view.who}</span>
          {view.whoSub ? <span className={s.pWhoSub}>{view.whoSub}</span> : null}
        </div>
      </div>
      <div className={s.pCol}>
        <span className={s.pK}>{view.timeK}</span>
        <span className={`${s.pTime}${view.timeRed ? ` ${s.toneRed}` : ''}`}>{view.timeV}</span>
      </div>
      <div className={s.pCol}>
        <span className={s.pK}>{view.dueK}</span>
        <span className={`${s.pDue} ${DUE[view.dueTone]}`}>{view.dueV}</span>
      </div>
      {view.gates.length ? (
        <div className={s.gates}>
          {view.gates.map(g => (
            <div key={g.n} className={`${s.gate} ${GATE[g.tone]}`}>
              <span className={s.gateN}>L{g.n}{g.rule ? ` · ${g.rule}` : ''}</span>
              {g.people.map((p, k) => (
                <span key={k} className={`${s.gateP} ${PERSON[p.tone]}${p.strong ? ` ${s.gatePStrong}` : ''}`}>{p.text}</span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      <span className={s.grow} />
      {view.canReassign ? <button type="button" className={s.ulink} onClick={onReassign}>⇄ Reassign</button> : null}
    </div>
  )
}
